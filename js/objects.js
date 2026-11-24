/**
 * HYDRA — open-vocabulary vision. MobileNet gives 1000 ImageNet classes;
 * CLIP answers arbitrary questions ("is there a cat?"). Both load on demand
 * from a CDN and run in the browser.
 */


/* A broad label set for one-click identification; CLIP scores every entry. */
const VOCAB = [
  'person', 'face', 'hand', 'child', 'group of people', 'selfie', 'silhouette',
  'cat', 'dog', 'puppy', 'kitten', 'bird', 'fish', 'horse', 'cow', 'sheep', 'goat',
  'rabbit', 'hamster', 'mouse', 'rat', 'fox', 'deer', 'bear', 'lion', 'tiger',
  'elephant', 'monkey', 'penguin', 'owl', 'parrot', 'duck', 'chicken', 'insect',
  'butterfly', 'spider', 'snake', 'lizard', 'turtle', 'whale', 'shark',
  'pizza', 'burger', 'sandwich', 'hot dog', 'fries', 'taco', 'sushi', 'ramen',
  'pasta', 'rice', 'salad', 'soup', 'bread', 'toast', 'cheese', 'egg', 'bacon',
  'cake', 'cookie', 'donut', 'ice cream', 'chocolate', 'candy', 'fruit', 'apple',
  'banana', 'orange', 'lemon', 'strawberry', 'grapes', 'watermelon', 'avocado',
  'tomato', 'carrot', 'broccoli', 'potato', 'onion', 'coffee', 'tea', 'beer',
  'wine', 'cocktail', 'juice', 'water bottle', 'soda can', 'mug', 'glass',
  'laptop', 'desktop computer', 'monitor', 'keyboard', 'mouse', 'tablet',
  'smartphone', 'phone', 'camera', 'headphones', 'earbuds', 'speaker', 'microphone',
  'television', 'game console', 'controller', 'smartwatch', 'printer', 'router',
  'cable', 'charger', 'power bank', 'drone', 'robot', 'vr headset',
  'book', 'notebook', 'pen', 'pencil', 'marker', 'paper', 'envelope', 'folder',
  'scissors', 'stapler', 'ruler', 'backpack', 'handbag', 'wallet', 'keys',
  'sunglasses', 'glasses', 'watch', 'jewelry', 'ring', 'hat', 'cap', 'helmet',
  'shirt', 't-shirt', 'jacket', 'hoodie', 'dress', 'jeans', 'trousers', 'shorts',
  'skirt', 'socks', 'shoes', 'sneakers', 'boots', 'slippers', 'scarf', 'gloves',
  'bed', 'pillow', 'blanket', 'sofa', 'couch', 'armchair', 'chair', 'stool',
  'table', 'desk', 'shelf', 'bookcase', 'wardrobe', 'drawer', 'cabinet', 'lamp',
  'ceiling light', 'candle', 'mirror', 'clock', 'rug', 'curtain', 'door',
  'window', 'stairs', 'wall', 'floor', 'ceiling', 'fireplace', 'plant', 'flower',
  'vase', 'potted plant', 'tree', 'grass', 'leaf', 'garden', 'forest', 'mountain',
  'beach', 'ocean', 'river', 'lake', 'sky', 'cloud', 'sun', 'moon', 'stars',
  'rain', 'snow', 'fog', 'city', 'street', 'building', 'skyscraper', 'house',
  'bridge', 'tower', 'park', 'playground', 'stadium', 'airport', 'station',
  'car', 'truck', 'van', 'bus', 'motorcycle', 'scooter', 'bicycle', 'train',
  'tram', 'subway', 'airplane', 'helicopter', 'boat', 'ship', 'kayak', 'tractor',
  'traffic light', 'sign', 'road', 'parking lot', 'gas station',
  'cup', 'plate', 'bowl', 'fork', 'knife', 'spoon', 'chopsticks', 'pan', 'pot',
  'kettle', 'toaster', 'microwave', 'oven', 'stove', 'fridge', 'blender',
  'washing machine', 'vacuum cleaner', 'broom', 'bucket', 'towel', 'soap',
  'toothbrush', 'toilet', 'sink', 'shower', 'bathtub', 'trash can', 'box',
  'cardboard box', 'bag', 'basket', 'toy', 'teddy bear', 'ball', 'doll',
  'lego', 'puzzle', 'board game', 'cards', 'guitar', 'piano', 'drums', 'violin',
  'microphone stand', 'artwork', 'painting', 'poster', 'photograph', 'screen',
  'code on a screen', 'chart', 'diagram', 'text', 'document', 'spreadsheet',
  'whiteboard', 'sticky note', 'calendar', 'map', 'money', 'credit card',
  'ticket', 'receipt', 'box of food', 'shopping bag', 'delivery box',
  'fire', 'smoke', 'water', 'sand', 'rock', 'metal', 'wood', 'fabric',
  'plastic', 'glass surface', 'reflection', 'shadow', 'blurry image',
  'close-up', 'wide shot', 'indoor scene', 'outdoor scene', 'night scene',
  'daylight', 'neon lights', 'dark room', 'bright room', 'empty space',
];

const CDN = {
  tf: 'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js',
  mobilenet: 'https://cdn.jsdelivr.net/npm/@tensorflow-models/mobilenet@2.1.1/dist/mobilenet.min.js',
  transformers: 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2',
};

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector('script[src="' + src + '"]')) return resolve();
    const script = document.createElement('script');
    script.src = src;
    script.onload = resolve;
    script.onerror = () => reject(new Error('Could not load ' + src));
    document.head.append(script);
  });
}

class Objects {
  constructor() {
    this.thousand = null;
    this.clip = null;
  }

  async loadThousand() {
    if (this.thousand) return this.thousand;
    if (!window.tf) await loadScript(CDN.tf);
    if (!window.mobilenet) await loadScript(CDN.mobilenet);
    this.thousand = await window.mobilenet.load({ version: 2, alpha: 0.75 });
    return this.thousand;
  }

  async classify(source, count = 5) {
    const model = await this.loadThousand();
    const predictions = await model.classify(source, count);
    return predictions.map((p) => ({ label: p.className.split(',')[0], score: p.probability }));
  }

  async loadClip() {
    if (this.clip) return this.clip;
    const mod = await import(CDN.transformers);
    mod.env.allowLocalModels = false;
    this.clip = await mod.pipeline('zero-shot-image-classification', 'Xenova/clip-vit-base-patch32');
    return this.clip;
  }

  /**
   * Identify a frame without a prompt: CLIP against a broad vocabulary plus
   * MobileNet's 1000 concrete classes, merged and de-duplicated.
   */
  async identify(source, extra = []) {
    const labels = [...new Set([...extra, ...VOCAB])];
    const [clip, thousand] = await Promise.allSettled([
      this.ask(source, labels),
      this.classify(source, 6),
    ]);
    const merged = new Map();
    const add = (label, score, from) => {
      const key = String(label).toLowerCase().split(',')[0].trim();
      if (!key) return;
      const current = merged.get(key);
      if (!current || current.score < score) merged.set(key, { label: key, score, from });
    };
    if (clip.status === 'fulfilled') {
      for (const entry of clip.value.filter((e) => e.score >= 0.03).slice(0, 6)) add(entry.label, entry.score, 'clip');
    }
    if (thousand.status === 'fulfilled') {
      for (const entry of thousand.value.slice(0, 5)) add(entry.label, entry.score, 'imagenet');
    }
    if (!merged.size) return this.localReport(source);
    return [...merged.values()].sort((a, b) => b.score - a.score).slice(0, 8);
  }

  /**
   * Instant, dependency-free description of the frame. Runs when no model has
   * been downloaded yet (or the network blocks the weights), so Identify never
   * dead-ends.
   */
  async localReport(source) {
    const image = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('frame unreadable'));
      img.src = source;
    });
    const size = 48;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(image, 0, 0, size, size);
    const { data } = ctx.getImageData(0, 0, size, size);

    let sum = 0, sat = 0, edge = 0, r = 0, g = 0, b = 0;
    for (let i = 0; i < size * size; i += 1) {
      const red = data[i * 4];
      const green = data[i * 4 + 1];
      const blue = data[i * 4 + 2];
      r += red; g += green; b += blue;
      const max = Math.max(red, green, blue);
      const min = Math.min(red, green, blue);
      sum += (red + green + blue) / 3;
      sat += max === 0 ? 0 : (max - min) / max;
      if (i % size < size - 1) {
        const next = (data[(i + 1) * 4] + data[(i + 1) * 4 + 1] + data[(i + 1) * 4 + 2]) / 3;
        edge += Math.abs((red + green + blue) / 3 - next);
      }
    }
    const pixels = size * size;
    const brightness = sum / pixels;
    const saturation = sat / pixels;
    const detail = edge / pixels;
    const hue = (() => {
      const rn = r / pixels / 255, gn = g / pixels / 255, bn = b / pixels / 255;
      const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn), d = max - min;
      if (!d) return 'grey';
      if (max === rn) return (gn - bn) / d < 0 ? 'magenta' : 'warm';
      if (max === gn) return 'green';
      if (bn > rn) return d > 0.12 ? 'purple' : 'blue';
      return 'blue';
    })();

    const labels = [];
    labels.push({
      label: brightness < 55 ? 'dark scene' : brightness > 185 ? 'bright scene' : 'mid-lit scene',
      score: 0.46, from: 'local',
    });
    labels.push({
      label: `${hue === 'purple' || hue === 'magenta' ? 'purple' : hue} palette`,
      score: 0.34 + Math.min(saturation, 0.3), from: 'local',
    });
    labels.push({
      label: detail > 28 ? 'detailed subject close-up' : detail > 12 ? 'busy background' : 'plain background',
      score: 0.28 + Math.min(detail / 200, 0.12), from: 'local',
    });
    if (saturation > 0.32) labels.push({ label: 'colourful frame', score: 0.3, from: 'local' });
    return labels;
  }

  async ask(source, labels) {
    const clip = await this.loadClip();
    const output = await clip(source, labels);
    return output.map((row) => ({ label: row.label, score: row.score })).sort((a, b) => b.score - a.score);
  }
}

export const objects = new Objects();
