import type { Config, SpeciesParams } from '../core/types';
import { el, clear } from './dom';

interface SliderDef {
  key: 'moveProb' | 'huntSuccess' | 'huntThreshold' | 'breedTime' | 'maxAge' | 'metabolism' | 'startEnergy' | 'gain' | 'seedDensity';
  label: string;
  min: number;
  max: number;
  step: number;
  scale?: number;      // display value = stored * scale
  zeroLabel?: string;  // text shown when the value hits 0
  zeroWarn?: boolean;  // style the 0 case as an amber warning (degenerate)
  maxLabel?: string;   // text shown at the max (a benign extreme, e.g. "always")
  sentinel?: number;   // value stored at the max position (so "always" = ignore)
}

// Movement activity — only shown for mobile species. Stored as 0–1, shown as %.
// 0% is allowed for experimentation: the unit becomes stationary (warned).
const MOBILITY: SliderDef = { key: 'moveProb', label: 'mobility %', min: 0, max: 100, step: 5, scale: 100, zeroLabel: 'stationary', zeroWarn: true };

// Predation efficiency — only shown for mobile species that have a diet.
const HUNT: SliderDef = { key: 'huntSuccess', label: 'hunt success %', min: 0, max: 100, step: 5, scale: 100, zeroLabel: 'never catches', zeroWarn: true };

// Hunger gating — predators only. Max position = "always hunt" (stored as a
// sentinel so it's treated as no threshold at all).
const HUNGER: SliderDef = { key: 'huntThreshold', label: 'hunts when energy <', min: 1, max: 25, step: 1, maxLabel: 'always', sentinel: 1e5 };

const SLIDERS: SliderDef[] = [
  { key: 'breedTime', label: 'breed time', min: 0, max: 30, step: 1 },
  { key: 'maxAge', label: 'lifespan', min: 0, max: 300, step: 5, zeroLabel: 'immortal' },
  { key: 'metabolism', label: 'metabolism', min: 0, max: 6, step: 1 },
  { key: 'startEnergy', label: 'start energy', min: 1, max: 30, step: 1 },
  { key: 'gain', label: 'energy / food', min: 0, max: 20, step: 1 },
  { key: 'seedDensity', label: 'seed %', min: 0, max: 60, step: 1, scale: 100 },
];

function slider(sp: SpeciesParams, def: SliderDef, onChange: () => void): HTMLElement {
  const scale = def.scale ?? 1;
  const stored = sp[def.key];
  // A sentinel (or undefined) parks the slider at its max "always" position.
  const atMax = def.sentinel !== undefined && (stored === undefined || stored >= def.sentinel);
  const initRaw = atMax ? def.max : Math.round((stored ?? 0) * scale);

  const row = el('div', { class: 'param-row' });
  const valLabel = el('span', { class: 'param-val' });

  const showValue = (raw: number) => {
    let text = String(raw);
    let warn = false;
    if (def.maxLabel !== undefined && raw === def.max) text = def.maxLabel;
    else if (def.zeroLabel !== undefined && raw === 0) { text = def.zeroLabel; warn = def.zeroWarn ?? false; }
    valLabel.textContent = text;
    valLabel.classList.toggle('warn', warn);
    row.classList.toggle('warn', warn);
  };

  const input = el('input', {
    type: 'range',
    class: 'slider param-slider',
    min: String(def.min),
    max: String(def.max),
    step: String(def.step),
    value: String(initRaw),
    oninput: (e: Event) => {
      const raw = Number((e.target as HTMLInputElement).value);
      sp[def.key] = def.sentinel !== undefined && raw === def.max ? def.sentinel : raw / scale;
      showValue(raw);
      onChange();
    },
  });

  showValue(initRaw);
  row.append(el('label', {}, [def.label, valLabel]), input);
  return row;
}

/** Toggle chips for which other species this one eats. */
function dietChips(cfg: Config, selfId: number, sp: SpeciesParams, onChange: () => void, rebuild: () => void): HTMLElement {
  const wrap = el('div', { class: 'diet-chips' }, [el('span', { class: 'muted diet-label' }, 'eats:')]);
  let any = false;
  cfg.states.forEach((st, j) => {
    if (j === 0 || j === selfId) return; // never eat empty or self
    any = true;
    const active = sp.diet.includes(j);
    const chip = el('button', {
      class: 'chip' + (active ? ' on' : ''),
      style: active ? `border-color:${st.color};color:${st.color}` : '',
      onclick: () => {
        const idx = sp.diet.indexOf(j);
        if (idx < 0) sp.diet.push(j);
        else sp.diet.splice(idx, 1);
        onChange();
        rebuild(); // refresh chip state + show/hide the hunt-success slider
      },
    }, st.name);
    wrap.append(chip);
  });
  if (!any) wrap.append(el('span', { class: 'muted' }, '(no other species)'));
  return wrap;
}

/**
 * Per-species editor for the ecosystem engine. Each card wires one species:
 * its diet (who it eats), whether it moves, and its life-cycle sliders.
 * Food chains/webs emerge from the diet links. Changes apply live; reseed to
 * also apply new seed densities.
 */
export function renderEcosystem(container: HTMLElement, cfg: Config, onChange: () => void): void {
  clear(container);
  const eco = cfg.ecosystem;
  if (!eco) return;

  container.append(
    el('p', { class: 'muted' }, 'Immobile species are producers (spread without food). Mobile species hunt their diet, gain energy, and starve when metabolism drains them to zero.'),
  );

  cfg.states.forEach((st, i) => {
    if (i === 0) return; // skip Empty
    const sp = eco.species[i];
    if (!sp) return;
    // Normalize older/shared configs so sliders show 100%, not 0%.
    if (sp.moveProb === undefined) sp.moveProb = 1;
    if (sp.huntSuccess === undefined) sp.huntSuccess = 1;
    const rebuild = () => renderEcosystem(container, cfg, onChange);

    const mobileToggle = el('label', { class: 'mobile-toggle' }, [
      el('input', {
        type: 'checkbox',
        checked: sp.mobile,
        // Re-render so the mobility slider appears/disappears with the toggle.
        onchange: (e: Event) => {
          sp.mobile = (e.target as HTMLInputElement).checked;
          onChange();
          rebuild();
        },
      }),
      'mobile',
    ]);

    // Mobile units get mobility; predators (mobile + a diet) also get hunt
    // success and a hunger threshold.
    const defs = sp.mobile
      ? [MOBILITY, ...(sp.diet.length ? [HUNT, HUNGER] : []), ...SLIDERS]
      : SLIDERS;
    const card = el('div', { class: 'species-card' }, [
      el('div', { class: 'species-head' }, [
        el('span', { class: 'brush-dot', style: `background:${st.color}` }),
        el('span', { class: 'species-name' }, st.name),
        mobileToggle,
      ]),
      dietChips(cfg, i, sp, onChange, rebuild),
      ...defs.map((def) => slider(sp, def, onChange)),
    ]);
    container.append(card);
  });
}
