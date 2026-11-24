/**
 * HYDRA — GSAP choreography. Loaded on demand; every call returns false if
 * the CDN is unreachable so the CSS fallbacks keep working.
 */

let gsap = null;
let loading = null;

export function loadGsap() {
  if (gsap) return Promise.resolve(gsap);
  if (!loading) {
    loading = import('https://cdn.jsdelivr.net/npm/gsap@3.12.5/+esm')
      .then((mod) => { gsap = mod.gsap || mod.default; return gsap; })
      .catch(() => { gsap = null; return null; });
  }
  return loading;
}

export async function gsapEntrance(node) {
  const g = await loadGsap();
  if (!g || !node) return false;
  g.fromTo(node,
    { y: 46, scale: 0.82, opacity: 0, filter: 'blur(12px) brightness(2)' },
    { y: 0, scale: 1, opacity: 1, filter: 'blur(0px) brightness(1)', duration: 1.25, ease: 'elastic.out(1, 0.62)' });
  return true;
}

export async function gsapPanel(node) {
  const g = await loadGsap();
  if (!g || !node) return false;
  const kids = [...node.children].slice(0, 8);
  g.fromTo(node, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.35, ease: 'power2.out' });
  if (kids.length) g.fromTo(kids, { y: 18, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5, stagger: 0.045, ease: 'power3.out' });
  return true;
}

export async function gsapHologram(x, y) {
  const g = await loadGsap();
  if (!g) return false;
  const ring = document.createElement('span');
  ring.className = 'holo-ring gsap-ring';
  ring.style.left = `${x}px`;
  ring.style.top = `${y}px`;
  ring.style.animation = 'none';
  ring.style.width = ring.style.height = '16px';
  document.body.append(ring);
  g.timeline({ onComplete: () => ring.remove() })
    .to(ring, { width: 560, height: 560, opacity: 0, duration: 0.72, ease: 'power2.out' })
    .fromTo(ring, { opacity: 0.95 }, { opacity: 0, duration: 0.001 }, 0);
  return true;
}

export async function gsapPop(node, { from = 1, to = 1.12, ms = 0.35 } = {}) {
  const g = await loadGsap();
  if (!g || !node) return false;
  g.fromTo(node, { scale: from }, { scale: to, duration: ms / 2, yoyo: true, repeat: 1, ease: 'power2.out' });
  return true;
}
