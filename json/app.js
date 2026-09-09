import { parse, countValues, isEmptyAst, astToValues } from "./parser.js";
import { applyJq } from "./jq.js";
import { mountViewer, tok, errorMark } from "../assets/common.js";

mountViewer({
  kind: "json",
  copyToast: "formatted json copied ✓",
  emptyMessage: "Paste JSON on the left to view it here.",
  hashOpts: (api) => ({
    nest: api.nestOn,
    jq: api.jqEnabled && api.jqFilter ? api.jqFilter : "",
  }),
  render,
});

function render(text, api) {
  const parsed = text.trim() ? parse(text, { nest: api.nestOn }) : null;
  const sourceHas = parsed && !isEmptyAst(parsed);

  let ast = parsed;
  let jqNote = "";
  api.setJqGlobalError("");

  const jqFilter = api.jqFilter;
  if (api.jqEnabled && sourceHas && jqFilter) {
    const result = applyJq(astToValues(parsed), jqFilter);
    if (!result.ok) {
      api.setJqGlobalError(result.error);
    } else if (!result.passthrough) {
      ast = jqResultToAst(result.items, api.nestOn);
      const hasItemErrors = result.items.some((item) => !item.ok);
      if (!result.values.length && !hasItemErrors) {
        jqNote = " · jq: no results";
      } else {
        jqNote = result.values.length <= 1 ? " · jq" : ` · jq ×${result.values.length}`;
      }
    }
  }

  const has = ast && !isEmptyAst(ast);
  const size = api.sourceSize(text);

  if (!has) {
    return {
      has: false,
      sourceHas,
      truncated: true,
      status: jqNote ? `${size}${jqNote}` : `${size} · Nothing could be parsed.`,
      empty: jqNote ? "jq produced no results." : "Nothing could be parsed.",
    };
  }

  const n = countValues(ast);
  const trunc = Boolean(ast.truncated);
  const formatted = astToValues(ast)
    .map((v) => JSON.stringify(v, null, 2))
    .join("\n");

  const root = document.createDocumentFragment();
  renderValue(ast, 0, [], root, false, api);

  return {
    has: true,
    sourceHas,
    truncated: trunc,
    formatted,
    fragment: root,
    status: `${size} · ${n} value${n === 1 ? "" : "s"}${trunc ? " · incomplete" : ""}${jqNote}`,
  };
}

function renderValue(node, depth, prefix, parent, comma, api) {
  for (const comment of node.leadingComments || []) {
    renderComment(comment, depth, parent, api);
  }

  if (node.type === "comment") {
    renderComment(node, depth, parent, api);
    return;
  }

  if (node.type === "jq-error") {
    const row = api.newLine(depth, parent);
    row.content.append(...prefix, jqErrorMark(node.message));
    if (comma) row.content.append(tok("p", ","));
    return;
  }

  if (node.type === "doc") {
    let prevMissing = false;
    for (const item of node.items) {
      const missing = item.type === "missing";
      if (missing && prevMissing) continue;
      prevMissing = missing;
      renderValue(item, depth, [], parent, false, api);
    }
    if (node.truncated && !node.items.some((n) => n.truncated)) {
      appendTruncOnLast(parent);
    }
    return;
  }

  if (node.type === "string" && node.nested) {
    renderValue(node.nested, depth, prefix, parent, comma, api);
    renderAfterComments(node, depth, parent, api);
    return;
  }

  if (node.type === "object" || node.type === "array") {
    renderCompound(node, depth, prefix, parent, comma, api);
    renderAfterComments(node, depth, parent, api);
    return;
  }

  const row = api.newLine(depth, parent);
  row.content.append(...prefix, ...primitive(node));
  if (comma) row.content.append(tok("p", ","));
  if (node.truncated || node.type === "missing") row.content.append(api.truncMark("JSON ended here"));
  renderAfterComments(node, depth, parent, api);
}

function renderCompound(node, depth, prefix, parent, comma, api) {
  const isObj = node.type === "object";
  const kids = isObj ? node.entries : node.items;
  const open = isObj ? "{" : "[";
  const close = isObj ? "}" : "]";

  if (kids.length === 0 && !node.truncated) {
    const row = api.newLine(depth, parent);
    row.content.append(...prefix, tok("p", open + close));
    if (comma) row.content.append(tok("p", ","));
    return;
  }

  const block = api.el("div", { class: "block" });
  const opener = api.newLine(depth, block);
  const fold = api.foldButton();
  opener.foldSlot.append(fold);
  opener.content.append(...prefix, tok("p", open));
  const preview = api.el("span", { class: "preview" });
  const ellipsis = api.el("span", { class: "ellipsis" }, `…${kids.length}`);
  preview.append(ellipsis, tok("p", close + (comma ? "," : "")));
  opener.content.append(preview);

  const children = api.el("div", { class: "children" });

  kids.forEach((kid, i) => {
    const last = i === kids.length - 1;
    const needComma = !last;
    if (isObj) renderEntry(kid, depth + 1, children, needComma, api);
    else renderValue(kid, depth + 1, [], children, needComma, api);
  });

  for (const comment of node.trailingComments || []) {
    renderComment(comment, depth + 1, children, api);
  }

  if (node.truncated && !children.querySelector(".trunc") && !opener.content.querySelector(".trunc")) {
    const target =
      kids.length === 0
        ? opener.content
        : [...children.querySelectorAll(".line .content")].at(-1) || opener.content;
    if (target) target.append(api.truncMark("JSON ended here"));
  }

  const closer = api.newLine(depth, children);
  closer.content.append(tok("p", close));
  if (comma) closer.content.append(tok("p", ","));

  block.append(children);
  parent.append(block);

  fold.addEventListener("click", (e) => {
    e.stopPropagation();
    api.toggleBlock(block);
  });
  ellipsis.addEventListener("click", (e) => {
    e.stopPropagation();
    if (block.classList.contains("is-collapsed")) api.toggleBlock(block);
  });
}

function renderEntry(entry, depth, parent, comma, api) {
  for (const comment of entry.comments || []) {
    renderComment(comment, depth, parent, api);
  }

  const nested = Boolean(entry.value?.nested);
  const prefix = keyPrefix(entry.key, nested);

  if (entry.keyTruncated) {
    const row = api.newLine(depth, parent);
    row.content.append(...prefix, api.truncMark("JSON ended here"));
    renderAfterComments(entry, depth, parent, api);
    return;
  }

  renderValue(entry.value, depth, prefix, parent, comma, api);
  renderAfterComments(entry, depth, parent, api);
}

function renderComment(node, depth, parent, api) {
  const row = api.newLine(depth, parent);
  const text = node.kind === "block" ? `/* ${node.text} */` : `// ${node.text}`;
  row.content.append(tok("c", text));
}

function renderAfterComments(node, depth, parent, api) {
  for (const comment of node.afterComments || []) {
    renderComment(comment, depth, parent, api);
  }
}

function primitive(node) {
  switch (node.type) {
    case "string":
      return quoted("s", node.value);
    case "number":
      return [tok("n", node.raw ?? String(node.value))];
    case "boolean":
      return [tok("b", String(node.value))];
    case "null":
      return [tok("u", "null")];
    case "missing":
      return [];
    default:
      return [tok("u", "")];
  }
}

function quoted(kind, text) {
  return [tok("qt", '"'), tok(kind, text), tok("qt", '"')];
}

function keyPrefix(key, nested) {
  if (nested) {
    const k = tok("k nested-key", key);
    k.title = "Parsed from a JSON string";
    return [tok("qt", '"'), k, tok("qt", '"'), tok("p", ": ")];
  }
  return [...quoted("k", key), tok("p", ": ")];
}

function jqErrorMark(message) {
  const text = message.startsWith("jq: ") ? message.slice(4) : message;
  return errorMark(text, message);
}

function jqResultToAst(items, nest) {
  const nodes = [];
  for (const item of items) {
    if (!item.ok) {
      nodes.push({ type: "jq-error", message: item.error });
      continue;
    }
    for (const value of item.values) {
      const text = JSON.stringify(value, null, 2);
      if (text === undefined) continue;
      const node = parse(text, { nest });
      if (node.type === "doc") nodes.push(...node.items);
      else nodes.push(node);
    }
  }
  if (nodes.length === 0) return null;
  if (nodes.length === 1) return nodes[0];
  return { type: "doc", items: nodes };
}

function appendTruncOnLast(parent) {
  const last = parent.querySelector(".line:last-of-type .content");
  if (last && !last.querySelector(".trunc")) last.append(errorMark("JSON ended here", "Input ended while parsing"));
}
