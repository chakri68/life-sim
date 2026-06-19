import type { Config, Rule, Condition, CompareOp } from '../core/types';
import { el, option, clear } from './dom';

const OPS: CompareOp[] = ['=', '!=', '>', '>=', '<', '<='];

function stateSelect(
  cfg: Config,
  value: number,
  includeAny: boolean,
  onChange: (v: number) => void,
): HTMLSelectElement {
  const sel = el('select', {
    class: 'state-select',
    onchange: (e: Event) => onChange(Number((e.target as HTMLSelectElement).value)),
  });
  if (includeAny) sel.append(option(-1, 'Any', value === -1));
  cfg.states.forEach((s, i) => {
    const opt = option(i, s.name, value === i);
    opt.style.color = s.color;
    sel.append(opt);
  });
  return sel;
}

function opSelect(value: CompareOp, onChange: (v: CompareOp) => void): HTMLSelectElement {
  const sel = el('select', {
    class: 'op-select',
    onchange: (e: Event) => onChange((e.target as HTMLSelectElement).value as CompareOp),
  });
  OPS.forEach((op) => sel.append(option(op, op, op === value)));
  return sel;
}

function conditionRow(
  cfg: Config,
  cond: Condition,
  onCommit: () => void,
  onRemove: () => void,
  rerender: () => void,
): HTMLElement {
  const rhsValue =
    cond.rhs.kind === 'const'
      ? el('input', {
          class: 'num',
          type: 'number',
          min: '0',
          max: '99',
          value: String(cond.rhs.value),
          oninput: (e: Event) => {
            if (cond.rhs.kind === 'const') cond.rhs.value = Number((e.target as HTMLInputElement).value);
            onCommit();
          },
        })
      : stateSelect(cfg, cond.rhs.state, false, (v) => {
          if (cond.rhs.kind === 'count') cond.rhs.state = v;
          onCommit();
        });

  const rhsKind = el('select', {
    class: 'kind-select',
    onchange: (e: Event) => {
      const k = (e.target as HTMLSelectElement).value;
      cond.rhs = k === 'const' ? { kind: 'const', value: 2 } : { kind: 'count', state: 0 };
      rerender();
    },
  });
  rhsKind.append(option('const', 'number', cond.rhs.kind === 'const'));
  rhsKind.append(option('count', 'count of', cond.rhs.kind === 'count'));

  return el('div', { class: 'cond-row' }, [
    el('span', { class: 'muted' }, 'count of'),
    stateSelect(cfg, cond.state, false, (v) => { cond.state = v; onCommit(); }),
    opSelect(cond.op, (v) => { cond.op = v; onCommit(); }),
    rhsKind,
    rhsValue,
    el('button', { class: 'icon-btn', title: 'Remove condition', onclick: onRemove }, '×'),
  ]);
}

function ruleRow(
  cfg: Config,
  rule: Rule,
  index: number,
  onCommit: () => void,
  rerender: () => void,
): HTMLElement {
  const conds = el('div', { class: 'conds' });
  rule.conditions.forEach((cond) => {
    conds.append(
      conditionRow(
        cfg,
        cond,
        onCommit,
        () => { rule.conditions = rule.conditions.filter((c) => c !== cond); rerender(); },
        rerender,
      ),
    );
  });

  const move = (dir: number) => {
    const j = index + dir;
    if (j < 0 || j >= cfg.rules.length) return;
    [cfg.rules[index], cfg.rules[j]] = [cfg.rules[j], cfg.rules[index]];
    rerender();
  };

  return el('div', { class: 'rule' }, [
    el('div', { class: 'rule-head' }, [
      el('span', { class: 'kw' }, 'WHEN'),
      stateSelect(cfg, rule.when, true, (v) => { rule.when = v; onCommit(); }),
      el('span', { class: 'spacer' }),
      el('button', { class: 'icon-btn', title: 'Move up', onclick: () => move(-1) }, '↑'),
      el('button', { class: 'icon-btn', title: 'Move down', onclick: () => move(1) }, '↓'),
      el('button', {
        class: 'icon-btn danger',
        title: 'Delete rule',
        onclick: () => { cfg.rules.splice(index, 1); rerender(); },
      }, '🗑'),
    ]),
    conds,
    el('button', {
      class: 'add-cond',
      onclick: () => { rule.conditions.push({ state: 0, op: '>=', rhs: { kind: 'const', value: 2 } }); rerender(); },
    }, '+ condition'),
    el('div', { class: 'rule-result' }, [
      el('span', { class: 'kw' }, '→ become'),
      stateSelect(cfg, rule.become, false, (v) => { rule.become = v; onCommit(); }),
      el('span', { class: 'muted' }, 'prob'),
      el('input', {
        class: 'num',
        type: 'number',
        min: '0',
        max: '1',
        step: '0.05',
        value: String(rule.prob),
        oninput: (e: Event) => { rule.prob = Number((e.target as HTMLInputElement).value); onCommit(); },
      }),
    ]),
  ]);
}

/**
 * (Re)render the full rule list into `container`.
 * `onCommit` persists value edits; `rebuild` is called after structural
 * changes (add/remove/reorder) and should re-invoke this function.
 */
export function renderRules(
  container: HTMLElement,
  cfg: Config,
  onCommit: () => void,
  rebuild: () => void,
): void {
  clear(container);
  if (cfg.rules.length === 0) {
    container.append(el('p', { class: 'muted' }, 'No rules yet. Cells will hold their state.'));
  }
  cfg.rules.forEach((rule, i) => container.append(ruleRow(cfg, rule, i, onCommit, rebuild)));
  container.append(
    el('button', {
      class: 'add-rule',
      onclick: () => {
        cfg.rules.push({ when: -1, conditions: [], become: 0, prob: 1 });
        rebuild();
      },
    }, '+ Add rule'),
  );
}
