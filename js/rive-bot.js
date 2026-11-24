/**
 * HYDRA — Rive companion runtime. Drop a robot .riv file in, point
 * Settings → Rive asset at it, and the state machine named below drives the
 * bot with lookX / lookY / talking / emotion inputs. Without an asset this
 * module stays idle and the Three.js or SVG robot stays in charge.
 */

const RUNTIME = 'https://cdn.jsdelivr.net/npm/@rive-app/canvas@2.21.6/+esm';

let instance = null;
let inputs = null;

export async function initRiveBot({ src, stateMachine = 'State Machine 1', host = '#companion' } = {}) {
  if (!src || instance) return Boolean(instance);
  const root = document.querySelector(host);
  if (!root) return false;
  let rive;
  try {
    rive = await import(RUNTIME);
  } catch {
    return false;
  }
  try {
    const canvas = document.createElement('canvas');
    canvas.className = 'robot3d rive-bot';
    canvas.setAttribute('aria-hidden', 'true');
    root.append(canvas);
    root.classList.add('is-3d', 'is-rive');
    const bot = new rive.Rive({
      src,
      canvas,
      stateMachines: stateMachine,
      autoplay: true,
      layout: new rive.Layout({ fit: rive.Fit.Contain, alignment: rive.Alignment.Center }),
      onLoad: () => {
        bot.resizeDrawingSurfaceToCanvas();
        const list = bot.stateMachineInputs(stateMachine) || [];
        inputs = {
          lookX: list.find((i) => /look.?x/i.test(i.name)),
          lookY: list.find((i) => /look.?y/i.test(i.name)),
          talking: list.find((i) => /talk|speak/i.test(i.name)),
          emotion: list.find((i) => /emotion/i.test(i.name)),
        };
      },
    });
    instance = bot;
    return true;
  } catch {
    return false;
  }
}

export function driveRive({ x = 0, y = 0, talking = false, emotion = null } = {}) {
  if (!inputs) return;
  if (inputs.lookX) inputs.lookX.value = x;
  if (inputs.lookY) inputs.lookY.value = y;
  if (inputs.talking) inputs.talking.value = talking;
  if (inputs.emotion && emotion != null) inputs.emotion.value = emotion;
}

export function teardownRiveBot() {
  try { instance?.cleanup?.(); } catch { /* ignore */ }
  instance = null;
  inputs = null;
  document.querySelectorAll('.rive-bot').forEach((node) => node.remove());
  document.querySelector('#companion')?.classList.remove('is-rive');
}
