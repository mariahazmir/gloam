// Tiny DOM helper for the ui/ modules. Text goes in through textContent only, so
// strings from a pack file or from content/strings.ts can never become markup.

export interface ElOptions {
  className?: string;
  text?: string;
  attrs?: Readonly<Record<string, string>>;
}

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  opts: ElOptions = {},
  ...children: Array<Node | string>
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (opts.className !== undefined) node.className = opts.className;
  if (opts.text !== undefined) node.textContent = opts.text;
  for (const [name, value] of Object.entries(opts.attrs ?? {})) node.setAttribute(name, value);
  for (const child of children) node.append(child);
  return node;
}
