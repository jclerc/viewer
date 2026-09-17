import { viewPython } from "./parser.js";
import { mountViewer } from "../assets/common.js";
import { renderCode, appendTrunc, countLines } from "../assets/code-view.js";

mountViewer({
  kind: "py",
  copyToast: "formatted python copied ✓",
  emptyMessage: "Paste Python on the left to view it here.",
  render,
});

function render(text, api) {
  const { nodes, formatted, truncated } = viewPython(text);
  const has = countLines(nodes) > 0;
  const size = api.sourceSize(text);

  if (!has) {
    return {
      has: false,
      sourceHas: Boolean(text.trim()),
      truncated,
      status: `${size} · Nothing could be parsed.`,
      empty: "Nothing could be parsed.",
    };
  }

  const root = document.createDocumentFragment();
  renderCode(nodes, root, api, "py");
  if (truncated) appendTrunc(root, api);

  const n = countLines(nodes);
  return {
    has: true,
    sourceHas: true,
    truncated,
    formatted,
    fragment: root,
    status: `${size} · ${n} line${n === 1 ? "" : "s"}${truncated ? " · incomplete" : ""}`,
  };
}
