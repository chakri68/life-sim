import type { Config } from '../core/types';
import { el, clear } from './dom';

export interface ScriptHooks {
  /** Set cfg.script + compile. Returns an error message, or null on success. */
  apply: (source: string) => string | null;
  /** Persist config (URL). */
  commit: () => void;
  /** Hand the error element back to the app so it can show runtime errors. */
  register: (errorEl: HTMLElement) => void;
}

const DOC = [
  "// self         -> this cell's state (0 = first/\"empty\" state)",
  '// count(s)     -> how many neighbors are in state s',
  "// get(dx,dy)   -> a neighbor's state (wraps at edges)",
  '// x, y, gen    -> position + generation number',
  '// rand()       -> random in [0, 1)',
  "// return <int> -> the cell's next state",
].join('\n');

/**
 * Editor for the manual ('script') engine: a code box for the per-cell
 * transition function, an Apply button, an error readout, and an API cheat
 * sheet. Errors (compile + runtime) render in the red box below.
 */
export function renderScript(container: HTMLElement, cfg: Config, hooks: ScriptHooks, pending = false): void {
  clear(container);

  container.append(
    el('p', { class: 'muted' }, 'Write the per-cell transition in JS — it runs once per cell each generation and returns the next state. Use it for rules the visual editor can’t express. Edit, then Apply.'),
    el('pre', { class: 'script-doc' }, DOC),
  );

  // A script loaded from a shared link is shown but not run until Apply.
  const notice = el('div', { class: 'script-notice' + (pending ? ' show' : '') },
    'Loaded from a shared link. Review the code below, then click Apply to run it.');

  const editor = el('textarea', { class: 'script-editor', rows: '12' });
  editor.value = cfg.script ?? '';
  editor.spellcheck = false;

  const errBox = el('pre', { class: 'script-error' });
  hooks.register(errBox);

  const showErr = (target: HTMLElement, err: string | null) => {
    target.textContent = err ?? '';
    target.classList.toggle('show', !!err);
  };

  // Compile `source`, render any error into `target`, clear the pending notice.
  const apply = (source: string, target: HTMLElement) => {
    const err = hooks.apply(source);
    showErr(target, err);
    if (!err) notice.classList.remove('show');
    return err;
  };

  const ctrlEnter = (e: KeyboardEvent, run: () => void) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); run(); }
  };

  editor.addEventListener('keydown', (e) => ctrlEnter(e, () => apply(editor.value, errBox)));

  const applyBtn = el('button', { class: 'btn primary', onclick: () => apply(editor.value, errBox) }, 'Apply');
  const expandBtn = el('button', { class: 'btn', onclick: () => openModal() }, '⛶ Expand');

  // Pop the editor into a large centered overlay for serious editing. The big
  // textarea mirrors back into the inline one live, so closing never loses work.
  function openModal(): void {
    const big = el('textarea', { class: 'script-editor script-editor-modal' });
    big.value = editor.value;
    big.spellcheck = false;
    big.addEventListener('input', () => { editor.value = big.value; });

    const mErr = el('pre', { class: 'script-error' });
    const close = () => {
      editor.value = big.value;
      backdrop.remove();
      document.removeEventListener('keydown', onKey);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
      else ctrlEnter(e, () => apply(big.value, mErr));
    };

    const modal = el('div', { class: 'modal script-modal', onclick: (e: Event) => e.stopPropagation() }, [
      el('div', { class: 'modal-head' }, [
        el('h3', {}, 'Manual rule  // raw JS'),
        el('button', { class: 'icon-btn', title: 'Close', onclick: close }, '✕'),
      ]),
      big,
      el('div', { class: 'row' }, [
        el('button', { class: 'btn primary', onclick: () => apply(big.value, mErr) }, 'Apply'),
        el('span', { class: 'muted script-hint' }, '⌘/Ctrl+Enter to apply · Esc to close'),
      ]),
      mErr,
    ]);
    const backdrop = el('div', { class: 'modal-backdrop', onclick: close }, [modal]);
    document.body.append(backdrop);
    document.addEventListener('keydown', onKey);
    big.focus();
  }

  container.append(
    notice,
    editor,
    el('div', { class: 'row' }, [applyBtn, expandBtn, el('span', { class: 'muted script-hint' }, 'or ⌘/Ctrl+Enter')]),
    errBox,
  );
}
