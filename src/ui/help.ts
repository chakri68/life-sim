import { el } from './dom';

interface Term {
  term: string;
  desc: string;
}
interface Topic {
  title: string;
  intro?: string;
  terms: Term[];
}

/**
 * Plain-language glossary for every knob in the sidebar, grouped by panel.
 * The "?" buttons next to each panel header open the matching topic.
 */
const TOPICS: Record<string, Topic> = {
  preset: {
    title: 'Presets & sharing',
    intro: 'A preset loads a whole universe at once: its states, rules and engine.',
    terms: [
      { term: 'Load preset…', desc: 'Swap in a ready-made world. Conway, RPS and Competitive are rule-based; the predator/prey ones are agent-based; the Reaction · ones are chemical fields.' },
      { term: 'Copy link', desc: 'Encodes the entire current config into the URL and copies it. Anyone who opens that link gets your exact world — edits included.' },
    ],
  },
  controls: {
    title: 'Canvas & playback',
    terms: [
      { term: 'Play / Pause', desc: 'Start or stop the simulation clock. Each tick advances one generation.' },
      { term: 'Step', desc: 'Advance exactly one generation, then pause. Good for watching a rule fire frame by frame.' },
      { term: 'Clear', desc: 'Empty the grid back to the dead/empty state.' },
      { term: 'Randomize', desc: 'Re-seed the grid with a fresh random starting pattern.' },
      { term: 'Speed', desc: 'Generations per second when playing (1–120).' },
      { term: 'Brush', desc: 'Paint radius. 0 paints a single cell; higher values paint a filled disc. Left-drag paints, right/middle-drag pans, wheel zooms.' },
    ],
  },
  population: {
    title: 'Population chart',
    intro: 'A scrolling history of the last ~240 samples, one line per state.',
    terms: [
      { term: 'Lines', desc: 'Each colored line tracks how many cells are in that state over time — handy for spotting booms, crashes and stable cycles.' },
      { term: 'Mean V (reaction)', desc: 'For the chemical engine there is one line: the average V concentration across the whole grid.' },
    ],
  },
  states: {
    title: 'States',
    intro: 'A state is a discrete value a cell can hold, each with a name and color. State 0 is the empty/dead background.',
    terms: [
      { term: 'Swatch', desc: 'Click to recolor a state. Colors are purely visual.' },
      { term: 'Select (row)', desc: 'Click a row to make it the active brush — the state you paint onto the grid.' },
      { term: '+ Add / ✕ Remove', desc: 'Add or delete a state. Rules and diets that referenced a removed state are remapped automatically.' },
    ],
  },
  rules: {
    title: 'Rules (totalistic)',
    intro: 'Rules run top-to-bottom; the first one whose conditions match decides the cell’s next state. If none match, the cell stays put.',
    terms: [
      { term: 'WHEN current', desc: 'The rule only applies to cells currently in this state. “Any” matches every state.' },
      { term: 'Condition: count(state) op N', desc: 'Counts the cell’s neighbors that are in the given state, then compares that tally against N (=, ≠, <, ≤, >, ≥). All conditions in a rule must hold.' },
      { term: '→ become', desc: 'The state the cell turns into when the rule fires.' },
      { term: 'prob', desc: 'Chance (0–1) the rule actually applies when matched. Below 1 makes the rule stochastic.' },
      { term: 'Neighborhood', desc: 'Which cells count as neighbors — Moore is all 8 surrounding; Von Neumann is the 4 orthogonal. Set per universe.' },
    ],
  },
  ecosystem: {
    title: 'Species (food web)',
    intro: 'An agent engine. Each non-empty state is a species. Immobile species are producers; mobile species hunt, gain energy, breed and starve.',
    terms: [
      { term: 'mobile', desc: 'On = a consumer that moves, hunts its diet and dies if its energy hits zero. Off = a producer that simply spreads into empty neighbors on its breed timer.' },
      { term: 'mobility %', desc: 'How often a mobile unit acts each step. 100% hunts/moves every step; lower values make it rest more — a sluggish forager that still ages and burns metabolism while idle. 0% (“stationary”) means it never moves at all — handy for experiments, though a unit with metabolism will eventually starve in place.' },
      { term: 'eats (diet)', desc: 'Which other species this one can move onto and consume. Diet links are what form food chains and webs.' },
      { term: 'hunt success %', desc: 'When a predator pounces on adjacent prey, the chance the kill lands. On a miss the prey escapes and the predator wanders instead. Pairs with mobility: a patient ambusher is low-mobility/high-success; a frantic clumsy one is the reverse. Only shown when the species has a diet.' },
      { term: 'hunts when energy <', desc: 'Hunger gating: a predator only attacks when its energy is below this. A sated one ignores nearby prey and wanders, letting prey recover — which tends to dampen boom-bust crashes into steadier coexistence. Slide to “always” to hunt regardless. Predators only.' },
      { term: 'lifespan', desc: 'Steps a unit lives before dying of old age (true age — breeding doesn’t reset it). “Immortal” (0) means it only dies from starvation or being eaten. A finite lifespan forces turnover and stops immortal blobs from locking up the grid.' },
      { term: 'breed time', desc: 'Generations a survivor must wait before it can reproduce into a neighbor cell.' },
      { term: 'metabolism', desc: 'Energy burned each step. Higher = starves faster without food.' },
      { term: 'start energy', desc: 'Energy a newborn begins with (and roughly what a parent splits on breeding).' },
      { term: 'energy / food', desc: 'Energy gained from eating one prey. Must outpace metabolism for the species to thrive.' },
      { term: 'seed %', desc: 'Fraction of the grid this species fills on Randomize. Applies on the next re-seed.' },
    ],
  },
  script: {
    title: 'Manual rule (raw JS)',
    intro: 'When the visual rule rows can’t express what you want, write the transition function yourself. It runs once per cell each generation and returns that cell’s next state. Hit Apply (or ⌘/Ctrl+Enter) to compile and run.',
    terms: [
      { term: 'self', desc: 'The current state of the cell being updated — an integer state id (0 is the first/“empty” state).' },
      { term: 'count(s)', desc: 'How many neighbors are in state s, using the universe’s neighborhood (Moore = 8, Von Neumann = 4).' },
      { term: 'get(dx, dy)', desc: 'The state of the neighbor at offset (dx, dy). Wraps around the edges (toroidal).' },
      { term: 'x, y, gen', desc: 'The cell’s coordinates and the current generation number — for position- or time-dependent rules.' },
      { term: 'rand()', desc: 'A random number in [0, 1) for stochastic rules.' },
      { term: 'return <int>', desc: 'Return the cell’s next state. A non-number or out-of-range value leaves the cell unchanged.' },
      { term: 'errors', desc: 'Syntax errors show when you Apply; a runtime error pauses the sim and shows the message. States and colors come from the States panel — reference them by index.' },
      { term: 'shared links', desc: 'A manual rule opened from a shared link is shown but not run until you click Apply — so you can read the code before it executes. Presets you load yourself run immediately.' },
    ],
  },
  reaction: {
    title: 'Reaction-Diffusion (Gray-Scott)',
    intro: 'Two chemicals U and V diffuse and react across a continuous field. Tiny feed/kill changes flip between coral, mazes, spots and waves.',
    terms: [
      { term: 'pattern', desc: 'Shortcuts that jump feed/kill to known coordinates (Coral, Mitosis, Maze, Worms, Waves…) and re-seed.' },
      { term: 'feed (F)', desc: 'Rate U is replenished. Raising it generally adds more material/growth.' },
      { term: 'kill (k)', desc: 'Rate V is removed. With feed, this pair is what selects the pattern family.' },
      { term: 'diffuse U / V', desc: 'How fast each chemical spreads. V usually diffuses about half as fast as U — that imbalance is what makes patterns form.' },
      { term: 'timestep', desc: 'Integration step size (dt). Bigger is faster but can blow up into noise.' },
      { term: 'iters / step', desc: 'Simulation sub-steps run per displayed frame. Higher = smoother evolution per visible tick.' },
      { term: 'colormap', desc: 'Maps V concentration (low → high) to color. Purely visual; paint on the canvas to inject more V.' },
    ],
  },
};

function closeModal(): void {
  document.querySelector('.modal-backdrop')?.remove();
  document.removeEventListener('keydown', onKey);
}

function onKey(e: KeyboardEvent): void {
  if (e.key === 'Escape') closeModal();
}

/** Open the help modal focused on a single topic. */
export function openHelp(id: string): void {
  closeModal();
  const topic = TOPICS[id];
  if (!topic) return;

  const list = el('dl', { class: 'glossary' });
  for (const t of topic.terms) {
    list.append(el('dt', {}, t.term), el('dd', {}, t.desc));
  }

  const modal = el('div', { class: 'modal', onclick: (e: Event) => e.stopPropagation() }, [
    el('div', { class: 'modal-head' }, [
      el('h3', {}, topic.title),
      el('button', { class: 'icon-btn', title: 'Close', onclick: closeModal }, '✕'),
    ]),
    topic.intro ? el('p', { class: 'modal-intro muted' }, topic.intro) : null,
    list,
  ]);

  const backdrop = el('div', { class: 'modal-backdrop', onclick: closeModal }, [modal]);
  document.body.append(backdrop);
  document.addEventListener('keydown', onKey);
}

/** A small "?" button that opens the help modal for `id`. */
export function helpButton(id: string): HTMLButtonElement {
  return el('button', {
    class: 'help-btn',
    title: 'What do these mean?',
    onclick: (e: Event) => { e.stopPropagation(); openHelp(id); },
  }, '?');
}

/** A panel `<h2>` with an optional trailing "?" help button. Clicking the
 *  header collapses/expands its enclosing `.panel`. */
export function panelHeader(title: string, helpId?: string): HTMLElement {
  return el('h2', {
    class: 'panel-head',
    onclick: (e: Event) => {
      (e.currentTarget as HTMLElement).closest('.panel')?.classList.toggle('collapsed');
    },
  }, [
    el('span', { class: 'panel-title' }, title),
    helpId ? helpButton(helpId) : null,
  ]);
}
