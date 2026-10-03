import { viewSql } from "./parser.js";
import { mountViewer } from "../assets/common.js";
import { renderCode, appendTrunc, countLines } from "../assets/code-view.js";

mountViewer({
  kind: "sql",
  copyToast: "formatted sql copied ✓",
  emptyMessage: "Paste SQL on the left to view it here.",
  render,
});

function render(text, api) {
  const { nodes, formatted, truncated, statements } = viewSql(text);
  const n = countLines(nodes);
  const size = api.sourceSize(text);

  if (!n || !text.trim()) {
    return {
      has: false,
      sourceHas: Boolean(text.trim()),
      truncated,
      status: `${size} · Nothing could be parsed.`,
      empty: "Nothing could be parsed.",
    };
  }

  const root = document.createDocumentFragment();
  renderCode(nodes, root, api);
  if (truncated) appendTrunc(root, api);

  const parts = [size];
  if (statements) parts.push(`${statements} statement${statements === 1 ? "" : "s"}`);
  parts.push(`${n} line${n === 1 ? "" : "s"}`);
  if (truncated) parts.push("incomplete");
  return {
    has: true,
    sourceHas: true,
    truncated,
    formatted,
    fragment: root,
    status: parts.join(" · "),
  };
}
