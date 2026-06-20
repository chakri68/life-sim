// Tiny DOM helper so the UI stays dependency-free.

type Child = Node | string | number | null | undefined | false;
type Attrs = Record<string, unknown>;

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  children: Child | Child[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const key in attrs) {
    const v = attrs[key];
    if (v == null || v === false) continue;
    if (key === "class") node.className = String(v);
    else if (key === "style") node.setAttribute("style", String(v));
    else if (key.startsWith("on") && typeof v === "function") {
      node.addEventListener(key.slice(2).toLowerCase(), v as EventListener);
    } else if (key in node) {
      (node as Record<string, unknown>)[key] = v;
    } else {
      node.setAttribute(key, String(v));
    }
  }
  const list = Array.isArray(children) ? children : [children];
  for (const c of list) {
    if (c == null || c === false) continue;
    node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return node;
}

export function option(
  value: string | number,
  label: string,
  selected: boolean,
): HTMLOptionElement {
  return el("option", { value: String(value), selected }, label);
}

export function clear(node: HTMLElement): void {
  node.replaceChildren();
}
