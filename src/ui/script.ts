import type { Config } from "../core/types";
import type { CodeEditor } from "./codeEditor";
import { el, clear } from "./dom";

export interface ScriptHooks {
  /** Set cfg.script + compile. Returns an error message, or null on success. */
  apply: (source: string) => string | null;
  /** Persist config (URL). */
  commit: () => void;
  /** Hand the error element back to the app so it can show runtime errors. */
  register: (errorEl: HTMLElement) => void;
}

// Inline "expand/maximize" icon (Feather "maximize"), inherits button color.
const EXPAND_ICON =
  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>';

const DOC = [
  '// self         -> this cell\'s state (0 = first/"empty" state)',
  "// count(s)     -> how many neighbors are in state s",
  "// get(dx,dy)   -> a neighbor's state (wraps at edges)",
  "// x, y, gen    -> position + generation number",
  "// rand()       -> random in [0, 1)",
  "// return <int> -> the cell's next state",
].join("\n");

/**
 * Editor for the manual ('script') engine. CodeMirror is lazy-loaded (so it
 * only ships when Manual mode is opened); if that fails we fall back to a plain
 * textarea. The same editor instance is moved in/out of the Expand modal so
 * there's a single source of truth for the code.
 */
export function renderScript(
  container: HTMLElement,
  cfg: Config,
  hooks: ScriptHooks,
  pending = false,
): void {
  clear(container);

  container.append(
    el(
      "p",
      { class: "muted" },
      "Write the per-cell transition in JS — it runs once per cell each generation and returns the next state. Use it for rules the visual editor can’t express. Edit, then Apply.",
    ),
    el("pre", { class: "script-doc" }, DOC),
  );

  // A script loaded from a shared link is shown but not run until Apply.
  const notice = el(
    "div",
    { class: "script-notice" + (pending ? " show" : "") },
    "Loaded from a shared link. Review the code below, then click Apply to run it.",
  );

  const host = el(
    "div",
    { class: "cm-host" },
    el("span", { class: "muted cm-loading" }, "loading editor…"),
  );
  const errBox = el("pre", { class: "script-error" });
  hooks.register(errBox);

  let editor: CodeEditor | null = null;
  let errTarget: HTMLElement = errBox; // where compile errors render (swaps to the modal)

  const getValue = () => (editor ? editor.getValue() : (cfg.script ?? ""));

  const apply = () => {
    const err = hooks.apply(getValue());
    errTarget.textContent = err ?? "";
    errTarget.classList.toggle("show", !!err);
    if (!err) notice.classList.remove("show");
  };

  const applyBtn = el(
    "button",
    { class: "btn primary", onclick: apply },
    "Apply",
  );
  const expandBtn = el("button", {
    class: "btn btn-iconed",
    title: "Expand editor",
    innerHTML: EXPAND_ICON + "<span>Expand</span>",
    onclick: () => {
      if (editor) openModal();
    },
  });

  // Pop the editor into a large overlay by moving its DOM there and back.
  function openModal(): void {
    if (!editor) return;
    const mErr = el("pre", { class: "script-error" });
    const modalHost = el("div", { class: "cm-host cm-host-modal" });
    modalHost.append(editor.dom);
    errTarget = mErr;

    const close = () => {
      host.append(editor!.dom);
      errTarget = errBox;
      backdrop.remove();
      document.removeEventListener("keydown", onKey);
      editor!.focus();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };

    const modal = el(
      "div",
      {
        class: "modal script-modal",
        onclick: (e: Event) => e.stopPropagation(),
      },
      [
        el("div", { class: "modal-head" }, [
          el("h3", {}, "Manual rule  // raw JS"),
          el(
            "button",
            { class: "icon-btn", title: "Close", onclick: close },
            "✕",
          ),
        ]),
        modalHost,
        el("div", { class: "row" }, [
          el("button", { class: "btn primary", onclick: apply }, "Apply"),
          el(
            "span",
            { class: "muted script-hint" },
            "⌘/Ctrl+Enter to apply · Esc to close",
          ),
        ]),
        mErr,
      ],
    );
    const backdrop = el("div", { class: "modal-backdrop", onclick: close }, [
      modal,
    ]);
    document.body.append(backdrop);
    document.addEventListener("keydown", onKey);
    editor.focus();
  }

  container.append(
    notice,
    host,
    el("div", { class: "row" }, [
      applyBtn,
      expandBtn,
      el("span", { class: "muted script-hint" }, "or ⌘/Ctrl+Enter"),
    ]),
    errBox,
  );

  const mount = (ed: CodeEditor) => {
    editor = ed;
    clear(host);
    host.append(ed.dom);
  };

  // Lazy-load CodeMirror; fall back to a textarea if its chunk fails to load.
  import("./codeEditor")
    .then(({ createCodeEditor }) =>
      mount(createCodeEditor({ doc: cfg.script ?? "", onApply: apply })),
    )
    .catch(() => {
      const ta = el("textarea", { class: "script-editor" });
      ta.value = cfg.script ?? "";
      ta.spellcheck = false;
      ta.addEventListener("keydown", (e: KeyboardEvent) => {
        if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
          e.preventDefault();
          apply();
        }
      });
      mount({
        dom: ta,
        getValue: () => ta.value,
        focus: () => ta.focus(),
        destroy: () => {},
      });
    });
}
