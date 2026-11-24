/** Inline Lottie: a HUD ring used while HYDRA scans a frame. */
const arc = (ind, size, from, to, opacity, width) => ({
  ddd: 0, ind, ty: 4, nm: `arc${ind}`, sr: 1,
  ks: {
    o: { a: 0, k: opacity },
    r: { a: 1, k: [{ t: 0, s: [from], e: [to] }, { t: 60, s: [to] }] },
    p: { a: 0, k: [120, 120, 0] },
    a: { a: 0, k: [0, 0, 0] },
    s: { a: 0, k: [100, 100, 100] },
  },
  ao: 0,
  shapes: [{
    ty: 'gr',
    it: [
      { ty: 'el', p: { a: 0, k: [0, 0] }, s: { a: 0, k: [size, size] } },
      { ty: 'st', c: { a: 0, k: [0.66, 0.55, 0.98, 1] }, o: { a: 0, k: 100 }, w: { a: 0, k: width }, lc: 2, lj: 1 },
      { ty: 'tm', s: { a: 0, k: 0 }, e: { a: 0, k: 30 }, o: { a: 0, k: 0 }, m: 1 },
      {
        ty: 'tr', p: { a: 0, k: [0, 0] }, a: { a: 0, k: [0, 0] }, s: { a: 0, k: [100, 100] },
        r: { a: 0, k: 0 }, o: { a: 0, k: 100 }, sk: { a: 0, k: 0 }, sa: { a: 0, k: 0 },
      },
    ],
  }],
  ip: 0, op: 60, st: 0, bm: 0,
});

export const HUD = {
  v: '5.7.4', fr: 30, ip: 0, op: 60, w: 240, h: 240, nm: 'hydra-hud', ddd: 0, assets: [],
  layers: [
    arc(1, 176, 0, 360, 100, 3),
    arc(2, 138, 360, 0, 80, 2),
    arc(3, 100, 0, 360, 55, 1.5),
  ],
};
