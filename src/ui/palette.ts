import type { Config } from "../core/types";
import { el, clear } from "./dom";

export interface PaletteHandlers {
  brush: number;
  setBrush: (i: number) => void;
  commit: () => void; // persist + recolor (no structural change)
  addState: () => void;
  removeState: (i: number) => void;
}

/** Render the editable palette: swatch + name + color per state, click to pick brush. */
export function renderPalette(
  container: HTMLElement,
  cfg: Config,
  h: PaletteHandlers,
): void {
  clear(container);
  cfg.states.forEach((state, i) => {
    const swatch = el("input", {
      class: "swatch",
      type: "color",
      value: state.color,
      oninput: (e: Event) => {
        state.color = (e.target as HTMLInputElement).value;
        h.commit();
      },
    });
    const name = el("input", {
      class: "state-name",
      type: "text",
      value: state.name,
      oninput: (e: Event) => {
        state.name = (e.target as HTMLInputElement).value;
        h.commit();
      },
    });
    const row = el(
      "div",
      {
        class: "state-row" + (i === h.brush ? " active" : ""),
        title: "Click to paint with this state",
        onclick: (e: Event) => {
          // Don't hijack clicks on the inner inputs/buttons.
          if ((e.target as HTMLElement).closest("input, button")) return;
          h.setBrush(i);
        },
      },
      [
        el("span", { class: "brush-dot", style: `background:${state.color}` }),
        swatch,
        name,
        el("span", { class: "state-id muted" }, `#${i}`),
        cfg.states.length > 1
          ? el(
              "button",
              {
                class: "icon-btn danger",
                title: "Delete state",
                onclick: () => h.removeState(i),
              },
              "×",
            )
          : null,
      ],
    );
    container.append(row);
  });
  container.append(
    el(
      "button",
      { class: "add-rule", onclick: () => h.addState() },
      "+ Add state",
    ),
  );
}
