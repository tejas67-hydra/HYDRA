/**
 * HYDRA — weather service (Open-Meteo, no API key required).
 * Cached for 15 minutes; offline reads the last good snapshot.
 */

import { bus } from './utils.js';
import { settings } from './settings.js';
import { storage } from './storage.js';

const CACHE_TTL = 15 * 60 * 1000;
const DEFAULT_PLACE = { lat: 52.52, lon: 13.405, label: 'Berlin' };

const WMO = {
  0: { label: 'Clear sky', icon: '☀️' },
  1: { label: 'Mostly clear', icon: '🌤️' },
  2: { label: 'Partly cloudy', icon: '⛅' },
  3: { label: 'Overcast', icon: '☁️' },
  45: { label: 'Fog', icon: '🌫️' },
  48: { label: 'Rime fog', icon: '🌫️' },
  51: { label: 'Light drizzle', icon: '🌦️' },
  53: { label: 'Drizzle', icon: '🌦️' },
  55: { label: 'Heavy drizzle', icon: '🌧️' },
  56: { label: 'Freezing drizzle', icon: '🌧️' },
  57: { label: 'Freezing drizzle', icon: '🌧️' },
  61: { label: 'Light rain', icon: '🌦️' },
  63: { label: 'Rain', icon: '🌧️' },
  65: { label: 'Heavy rain', icon: '🌧️' },
  66: { label: 'Freezing rain', icon: '🌧️' },
  67: { label: 'Freezing rain', icon: '🌧️' },
  71: { label: 'Light snow', icon: '🌨️' },
  73: { label: 'Snow', icon: '🌨️' },
  75: { label: 'Heavy snow', icon: '❄️' },
  77: { label: 'Snow grains', icon: '🌨️' },
  80: { label: 'Rain showers', icon: '🌦️' },
  81: { label: 'Rain showers', icon: '🌧️' },
  82: { label: 'Violent showers', icon: '⛈️' },
  85: { label: 'Snow showers', icon: '🌨️' },
  86: { label: 'Snow showers', icon: '❄️' },
  95: { label: 'Thunderstorm', icon: '⛈️' },
  96: { label: 'Storm with hail', icon: '⛈️' },
  99: { label: 'Storm with hail', icon: '⛈️' },
};

export function describeCode(code) {
  return WMO[code] ?? { label: 'Unknown', icon: '🌡️' };
}

class WeatherService {
  constructor() {
    this.data = null;
    this.status = 'idle';
    this.error = null;
    this.loading = null;
    const cached = storage.get('weather.cache', null);
    if (cached?.data) {
      this.data = cached.data;
      this.updatedAt = cached.at;
      this.status = 'cached';
    }
  }

  get units() {
    return settings.get('units') === 'imperial' ? 'imperial' : 'metric';
  }

  get unitSymbol() {
    return this.units === 'imperial' ? '°F' : '°C';
  }

  isFresh() {
    return this.data && Date.now() - (this.updatedAt ?? 0) < CACHE_TTL;
  }

  async resolveLocation() {
    const { weatherLat, weatherLon, weatherCity } = settings.get();
    if (weatherLat != null && weatherLon != null) {
      return { lat: weatherLat, lon: weatherLon, label: weatherCity || 'Current location' };
    }
    if (weatherCity) {
      const key = `weather.geo.${weatherCity.toLowerCase()}`;
      const cached = storage.get(key, null);
      if (cached) return cached;
      try {
        const url = new URL('https://geocoding-api.open-meteo.com/v1/search');
        url.searchParams.set('name', weatherCity);
        url.searchParams.set('count', '1');
        url.searchParams.set('language', 'en');
        url.searchParams.set('format', 'json');
        const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
        if (res.ok) {
          const json = await res.json();
          const hit = json.results?.[0];
          if (hit) {
            const place = {
              lat: hit.latitude,
              lon: hit.longitude,
              label: [hit.name, hit.country_code].filter(Boolean).join(', '),
            };
            storage.set(key, place);
            return place;
          }
        }
      } catch {
        /* fall through to default */
      }
    }
    return { ...DEFAULT_PLACE, label: `${DEFAULT_PLACE.label} · default` };
  }

  async refresh({ force = false, announce = false } = {}) {
    if (this.loading) return this.loading;
    if (!force && this.isFresh()) return this.data;

    this.loading = (async () => {
      this.status = 'loading';
      bus.emit('weather:state', this.status);
      try {
        const place = await this.resolveLocation();
        const url = new URL('https://api.open-meteo.com/v1/forecast');
        url.searchParams.set('latitude', String(place.lat));
        url.searchParams.set('longitude', String(place.lon));
        url.searchParams.set('current', 'temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,wind_speed_10m');
        url.searchParams.set('hourly', 'temperature_2m,weather_code,precipitation_probability');
        url.searchParams.set('daily', 'weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset');
        url.searchParams.set('timezone', 'auto');
        url.searchParams.set('forecast_days', '6');
        url.searchParams.set('temperature_unit', this.units === 'imperial' ? 'fahrenheit' : 'celsius');
        url.searchParams.set('wind_speed_unit', this.units === 'imperial' ? 'mph' : 'kmh');

        const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
        if (!res.ok) throw new Error(`Weather HTTP ${res.status}`);
        const json = await res.json();

        const now = new Date();
        const hourlyTimes = json.hourly?.time ?? [];
        let startIdx = hourlyTimes.findIndex((t) => new Date(t) >= new Date(now.getTime() - 3600_000));
        if (startIdx < 0) startIdx = 0;

        this.data = {
          place,
          current: {
            temp: Math.round(json.current?.temperature_2m ?? 0),
            feels: Math.round(json.current?.apparent_temperature ?? 0),
            humidity: json.current?.relative_humidity_2m ?? 0,
            wind: Math.round(json.current?.wind_speed_10m ?? 0),
            code: json.current?.weather_code ?? 0,
            isDay: Boolean(json.current?.is_day),
            precipitation: json.current?.precipitation ?? 0,
          },
          hourly: hourlyTimes.slice(startIdx, startIdx + 12).map((time, i) => ({
            time,
            temp: Math.round(json.hourly.temperature_2m[startIdx + i] ?? 0),
            code: json.hourly.weather_code[startIdx + i] ?? 0,
            precip: json.hourly.precipitation_probability?.[startIdx + i] ?? 0,
          })),
          daily: (json.daily?.time ?? []).map((date, i) => ({
            date,
            code: json.daily.weather_code[i],
            max: Math.round(json.daily.temperature_2m_max[i]),
            min: Math.round(json.daily.temperature_2m_min[i]),
            sunrise: json.daily.sunrise?.[i],
            sunset: json.daily.sunset?.[i],
          })),
          units: this.units,
          symbol: this.unitSymbol,
          updatedAt: Date.now(),
        };
        this.updatedAt = Date.now();
        this.status = 'ready';
        this.error = null;
        storage.set('weather.cache', { data: this.data, at: this.updatedAt });
        bus.emit('weather:update', this.data);
        bus.emit('weather:state', this.status);
        if (announce) {
          bus.emit('notify', {
            title: `Weather · ${this.data.place.label}`,
            body: `${describeCode(this.data.current.code).label}, ${this.data.current.temp}${this.data.symbol}`,
            tone: 'success',
          });
        }
        return this.data;
      } catch (err) {
        this.status = this.data ? 'stale' : 'error';
        this.error = err;
        bus.emit('weather:state', this.status);
        if (announce) {
          bus.emit('notify', {
            title: 'Weather unavailable',
            body: this.data ? 'Showing the last cached reading.' : 'Check the city in Settings.',
            tone: 'warn',
          });
        }
        return this.data;
      } finally {
        this.loading = null;
      }
    })();

    return this.loading;
  }

  /** Human sentence used by the assistant. */
  summary() {
    if (!this.data) return null;
    const { place, current, daily } = this.data;
    const today = daily[0];
    const desc = describeCode(current.code).label.toLowerCase();
    const range = today ? `, ${today.min}–${today.max}${this.data.symbol}` : '';
    return `${place.label}: ${desc}, ${current.temp}${this.data.symbol} (feels ${current.feels}${this.data.symbol})${range}`;
  }
}

export const weather = new WeatherService();

export function initWeather() {
  weather.refresh();
  setInterval(() => {
    if (!document.hidden) weather.refresh();
  }, CACHE_TTL);
  bus.on('settings:change', ({ state, prev }) => {
    if (state.units !== prev.units || state.weatherCity !== prev.weatherCity
      || state.weatherLat !== prev.weatherLat || state.weatherLon !== prev.weatherLon) {
      weather.refresh({ force: true });
    }
  });
  return weather;
}
