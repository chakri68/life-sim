import { EditorView, basicSetup } from "codemirror";
import { keymap } from "@codemirror/view";
import { Prec } from "@codemirror/state";
import { javascript, javascriptLanguage } from "@codemirror/lang-javascript";
import { completeFromList } from "@codemirror/autocomplete";
import type { Completion } from "@codemirror/autocomplete";
import { oneDark } from "@codemirror/theme-one-dark";

// The manual-rule API, surfaced as autocomplete entries. `detail` shows the
// type signature next to each suggestion — lightweight "types" without pulling
// in the full TypeScript language service.
const API: Completion[] = [
  {
    label: "self",
    type: "variable",
    detail: "number",
    info: "this cell's current state id",
  },
  {
    label: "count",
    type: "function",
    detail: "(state: number) => number",
    info: "neighbors in the given state",
  },
  {
    label: "get",
    type: "function",
    detail: "(dx: number, dy: number) => number",
    info: "a neighbor's state (wraps at edges)",
  },
  { label: "x", type: "variable", detail: "number", info: "cell x coordinate" },
  { label: "y", type: "variable", detail: "number", info: "cell y coordinate" },
  {
    label: "gen",
    type: "variable",
    detail: "number",
    info: "current generation number",
  },
  {
    label: "rand",
    type: "function",
    detail: "() => number",
    info: "random number in [0, 1)",
  },
];

// Override one-dark's background to match the app's near-black palette.
const appTheme = EditorView.theme(
  {
    "&": { backgroundColor: "#000000", fontSize: "12.5px" },
    ".cm-gutters": {
      backgroundColor: "#0b0b0a",
      borderRight: "1px solid #2b2925",
      color: "#5a564c",
    },
    ".cm-scroller": {
      fontFamily: "'JetBrains Mono', ui-monospace, monospace",
      lineHeight: "1.6",
    },
    "&.cm-focused": { outline: "none" },
    ".cm-activeLine, .cm-activeLineGutter": {
      backgroundColor: "rgba(255,176,0,0.07)",
    },
  },
  { dark: true },
);

export interface CodeEditor {
  dom: HTMLElement;
  getValue(): string;
  focus(): void;
  destroy(): void;
}

/** Build a CodeMirror 6 editor for the manual-rule code. */
export function createCodeEditor(opts: {
  doc: string;
  onApply: () => void;
}): CodeEditor {
  // Ctrl/Cmd+Enter applies, overriding any default binding.
  const applyKey = Prec.highest(
    keymap.of([
      {
        key: "Mod-Enter",
        run: () => {
          opts.onApply();
          return true;
        },
      },
    ]),
  );

  const view = new EditorView({
    doc: opts.doc,
    extensions: [
      basicSetup,
      javascript(),
      javascriptLanguage.data.of({ autocomplete: completeFromList(API) }),
      oneDark,
      appTheme,
      applyKey,
    ],
  });

  return {
    dom: view.dom,
    getValue: () => view.state.doc.toString(),
    focus: () => view.focus(),
    destroy: () => view.destroy(),
  };
}
