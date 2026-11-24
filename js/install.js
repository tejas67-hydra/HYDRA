/**
 * HYDRA — install prompts and shortcut helpers.
 */

let deferred = null;

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  deferred = event;
  window.dispatchEvent(new CustomEvent('hydra:installable'));
});

export const install = {
  platform() {
    const ua = navigator.userAgent || '';
    if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
    if (/Android/i.test(ua)) return 'android';
    if (/Macintosh/i.test(ua)) return 'mac';
    if (/Windows/i.test(ua)) return 'windows';
    return 'linux';
  },

  isPhone() {
    const p = this.platform();
    return p === 'ios' || p === 'android';
  },

  isStandalone() {
    return window.matchMedia('(display-mode: standalone)').matches || Boolean(navigator.standalone);
  },

  canInstall() {
    return Boolean(deferred);
  },

  async prompt() {
    if (!deferred) return false;
    deferred.prompt();
    const choice = await deferred.userChoice;
    deferred = null;
    return choice.outcome === 'accepted';
  },

  qr(url) {
    return 'https://api.qrserver.com/v1/create-qr-code/?size=190x190&margin=6&data=' + encodeURIComponent(url);
  },

  steps() {
    const p = this.platform();
    if (p === 'ios') return ['Open this page in Safari.', 'Tap the Share button.', 'Choose “Add to Home Screen”, then Add.'];
    if (p === 'android') return ['Open the browser menu (⋮).', 'Tap “Install app” or “Add to Home screen”.', 'Confirm to pin HYDRA to your home screen.'];
    if (p === 'windows') return ['Click the install icon in the address bar (or use this button).', 'HYDRA opens as its own window.', 'Right-click the taskbar icon → “Pin to taskbar”.'];
    if (p === 'mac') return ['Click the install icon in the address bar.', 'HYDRA opens as its own app window.', 'Keep it in the Dock: right-click the Dock icon → Options → Keep in Dock.'];
    return ['Install from the browser address bar.', 'HYDRA opens as its own window.', 'Pin it to your dock or taskbar from there.'];
  },
};
