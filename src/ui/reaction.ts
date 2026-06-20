import type { Config, ReactionParams } from '../core/types';
import { REACTION_PATTERNS } from '../rules/presets';
import { el, clear } from './dom';

export interface ReactionHooks {
  /** Persist config (URL). */
  commit: () => void;
  /** Re-upload the colormap to the renderer and repaint. */
  applyColormap: () => void;
  /** Re-seed the field (used after a pattern change). */
  reseed: () => void;
}

interface SliderDef {
  key: 'feed' | 'kill' | 'du' | 'dv' | 'dt' | 'iterations';
  label: string;
  min: number;
  max: number;
  step: number;
  digits: number;
}

const SLIDERS: SliderDef[] = [
  { key: 'feed', label: 'feed (F)', min: 0.005, max: 0.1, step: 0.0005, digits: 4 },
  { key: 'kill', label: 'kill (k)', min: 0.03, max: 0.075, step: 0.0005, digits: 4 },
  { key: 'du', label: 'diffuse U', min: 0.05, max: 0.3, step: 0.01, digits: 2 },
  { key: 'dv', label: 'diffuse V', min: 0.02, max: 0.2, step: 0.01, digits: 2 },
  { key: 'dt', label: 'timestep', min: 0.2, max: 1.4, step: 0.05, digits: 2 },
  { key: 'iterations', label: 'iters / step', min: 1, max: 24, step: 1, digits: 0 },
];

function slider(p: ReactionParams, def: SliderDef, onChange: () => void): HTMLElement {
  const valLabel = el('span', { class: 'param-val' }, p[def.key].toFixed(def.digits));
  const input = el('input', {
    type: 'range',
    class: 'slider param-slider',
    min: String(def.min),
    max: String(def.max),
    step: String(def.step),
    value: String(p[def.key]),
    oninput: (e: Event) => {
      const v = Number((e.target as HTMLInputElement).value);
      p[def.key] = v;
      valLabel.textContent = v.toFixed(def.digits);
      onChange();
    },
  });
  return el('div', { class: 'param-row' }, [el('label', {}, [def.label, valLabel]), input]);
}

/**
 * Editor for the Gray-Scott reaction-diffusion engine: quick pattern chips that
 * jump to known F/k coordinates, the raw parameter sliders, and the colormap.
 */
export function renderReaction(container: HTMLElement, cfg: Config, hooks: ReactionHooks): void {
  clear(container);
  const p = cfg.reaction;
  if (!p) return;

  container.append(
    el('p', { class: 'muted' }, 'Two chemicals diffuse and react. Tiny feed/kill changes flip between coral, mazes, spots and waves. Paint on the canvas to inject more.'),
  );

  // Pattern chips → set F/k and reseed.
  const chips = el('div', { class: 'pattern-chips' });
  REACTION_PATTERNS.forEach((pat) => {
    chips.append(
      el('button', {
        class: 'chip' + (Math.abs(p.feed - pat.feed) < 1e-6 && Math.abs(p.kill - pat.kill) < 1e-6 ? ' on' : ''),
        onclick: () => { p.feed = pat.feed; p.kill = pat.kill; hooks.reseed(); hooks.commit(); renderReaction(container, cfg, hooks); },
      }, pat.label),
    );
  });
  container.append(el('div', { class: 'param-row' }, [el('label', {}, 'pattern'), chips]));

  SLIDERS.forEach((def) => container.append(slider(p, def, hooks.commit)));

  // Colormap stops.
  const swatches = el('div', { class: 'colormap-row' });
  p.colors.forEach((color, i) => {
    swatches.append(
      el('input', {
        class: 'swatch',
        type: 'color',
        value: color,
        oninput: (e: Event) => { p.colors[i] = (e.target as HTMLInputElement).value; hooks.applyColormap(); hooks.commit(); },
      }),
    );
  });
  container.append(el('div', { class: 'param-row' }, [el('label', {}, 'colormap'), swatches]));
}
