import { tok } from "./common.js";

const CLASS_FOR = {
  keyword: "kw",
  defname: "fn",
  number: "n",
  op: "p",
  punct: "p",
  comment: "c",
  bool: "b",
  null: "u",
  regex: "s",
  "jsx-tag": "param",
  "jsx-attr": "fn",
};

const PY_BUILTINS = new Set([
  "abs",
  "all",
  "any",
  "bool",
  "bytes",
  "dict",
  "enumerate",
  "filter",
  "float",
  "frozenset",
  "getattr",
  "hasattr",
  "int",
  "isinstance",
  "iter",
  "len",
  "list",
  "map",
  "max",
  "min",
  "next",
  "object",
  "open",
  "print",
  "property",
  "range",
  "reversed",
  "set",
  "setattr",
  "slice",
  "sorted",
  "str",
  "sum",
  "super",
  "tuple",
  "type",
  "zip",
  "True",
  "False",
  "None",
]);

const JS_CONTEXT_KW = new Set(["from", "of", "as"]);

export function renderCode(nodes, parent, api, lang) {
  for (const node of nodes) renderNode(node, parent, api, lang);
}

function renderNode(node, parent, api, lang) {
  if (node.type === "block") renderBlock(node, parent, api, lang);
  else renderLine(node, parent, api, lang);
}

function renderBlock(node, parent, api, lang) {
  const block = api.el("div", { class: "block" });
  const opener = api.newLine(0, block);
  const fold = api.foldButton();
  opener.foldSlot.append(fold);
  appendTokens(opener.content, node.header, lang);

  const count = countLines(node.children);
  const preview = api.el("span", { class: "preview" });
  const ellipsis = api.el("span", { class: "ellipsis" }, `…${count}`);
  preview.append(ellipsis);
  opener.content.append(preview);

  const children = api.el("div", { class: "children" });
  renderCode(node.children, children, api, lang);
  if (node.truncated) appendTrunc(children, api);
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

function renderLine(node, parent, api, lang) {
  const row = api.newLine(0, parent);
  appendTokens(row.content, node.tokens, lang);
  if (node.truncated) row.content.append(api.truncMark());
}

export function appendTokens(content, tokens, lang) {
  const colored = lang ? colorize(tokens, lang) : tokens;
  for (const token of colored || []) {
    if (token.type === "string") {
      const { prefix, open, value, close } = stringQuotes(token);
      if (prefix) content.append(tok("b", prefix));
      if (open) content.append(tok("qt", open));
      if (value) content.append(tok("s", value));
      if (close) content.append(tok("qt", close));
      continue;
    }
    const cls = token.cls || CLASS_FOR[token.type];
    if (!cls) content.append(token.value);
    else content.append(tok(cls, token.value));
  }
}

function colorize(tokens, lang) {
  const out = (tokens || []).map((t) => ({ ...t }));
  for (let i = 0; i < out.length; i += 1) {
    const t = out[i];
    const prev = prevCode(out, i);
    const next = nextCode(out, i);
    if (t.type === "keyword") t.cls = "kw";
    else if (t.type === "defname") t.cls = "fn";
    else if (t.type === "number") t.cls = "n";
    else if (t.type === "op" || t.type === "punct") t.cls = t.value === "@" ? "param" : "p";
    else if (t.type === "comment") t.cls = "c";
    else if (t.type === "jsx-tag") t.cls = "param";
    else if (t.type === "jsx-attr") t.cls = "fn";
    else if (t.type === "bool") t.cls = lang === "js" ? "n" : "ty";
    else if (t.type === "null") t.cls = lang === "py" ? "ty" : "u";
    else if (t.type === "regex") t.cls = "s";

    if (t.type !== "name") continue;
    if (lang === "js" && JS_CONTEXT_KW.has(t.value)) {
      t.cls = "kw";
      continue;
    }
    if (lang === "py" && (t.value === "self" || t.value === "cls")) {
      t.cls = "param";
      continue;
    }
    if (lang === "py" && PY_BUILTINS.has(t.value)) {
      t.cls = "ty";
      continue;
    }
    if (prev && (prev.value === "." || prev.value === "?.")) {
      t.cls = lang === "py" ? "param" : "fn";
      continue;
    }
    if (prev && prev.value === "@") {
      t.cls = "param";
      continue;
    }
    if (next && next.value === "(") {
      t.cls = "fn";
      continue;
    }
    if (lang === "js" && next && next.value === "=" && assignedFunction(out, i)) {
      t.cls = "fn";
      continue;
    }
    if (lang === "js" && next && next.value === ":") {
      const after = nextCode(out, nextCodeIndex(out, i));
      if (after && (after.value === "(" || after.value === "async" || after.value === "function")) {
        t.cls = "fn";
        continue;
      }
    }
    if (lang === "py" && prev && (prev.value === ":" || prev.value === "->")) {
      t.cls = PY_BUILTINS.has(t.value) ? "ty" : "fn";
      continue;
    }
    if (/^[A-Z]/.test(t.value) || /^[A-Z0-9_]+$/.test(t.value)) t.cls = "fn";
  }
  markParams(out, lang);
  return out;
}

function markParams(tokens, lang) {
  for (let i = 0; i < tokens.length; i += 1) {
    const t = tokens[i];
    if (lang === "py" && t.type === "defname") {
      const open = findNextValue(tokens, i, "(");
      if (open < 0) continue;
      const kind = prevKeyword(tokens, i);
      markNamesInParens(tokens, open, kind === "class" ? "base" : "param", lang);
    }
    if (lang === "js" && (t.type === "defname" || (t.type === "keyword" && t.value === "function"))) {
      const open = findNextValue(tokens, i, "(");
      if (open >= 0) markNamesInParens(tokens, open, "param", lang);
    }
    if (lang === "js" && t.value === "=>") {
      const prevI = prevCodeIndex(tokens, i);
      if (prevI >= 0 && tokens[prevI].value === ")") {
        const open = matchOpen(tokens, prevI);
        if (open >= 0) markNamesInParens(tokens, open, "param", lang);
      } else if (prevI >= 0 && tokens[prevI].type === "name") tokens[prevI].cls = "param";
    }
    if (lang === "js" && t.type === "keyword" && (t.value === "const" || t.value === "let" || t.value === "var")) {
      const nextI = nextCodeIndex(tokens, i);
      if (nextI >= 0 && tokens[nextI].value === "[") markNamesInParens(tokens, nextI, "param", lang);
      if (nextI >= 0 && tokens[nextI].value === "{") markObjectBindings(tokens, nextI);
    }
    if (t.type === "keyword" && t.value === "for") {
      const open = findNextValue(tokens, i, "(");
      if (open >= 0) markForBinding(tokens, open);
    }
    if (lang === "py" && t.type === "keyword" && t.value === "from") {
      markFromImport(tokens, i);
    }
  }
}

function markNamesInParens(tokens, open, role, lang) {
  let depth = 0;
  let afterColon = false;
  for (let i = open; i < tokens.length; i += 1) {
    const t = tokens[i];
    if (t.value === "(" || t.value === "[" || t.value === "{") depth += 1;
    if (t.value === ")" || t.value === "]" || t.value === "}") {
      depth -= 1;
      if (depth === 0) break;
      continue;
    }
    if (t.value === "," || t.value === "=") afterColon = false;
    if (t.value === ":") {
      afterColon = true;
      continue;
    }
    if (t.type !== "name" && t.type !== "defname") continue;
    if (role === "base") t.cls = PY_BUILTINS.has(t.value) ? "ty" : "fn";
    else if (lang === "py" && afterColon) t.cls = PY_BUILTINS.has(t.value) ? "ty" : "fn";
    else if (lang === "js" && afterColon) t.cls = "param";
    else t.cls = "param";
  }
}

function markObjectBindings(tokens, open) {
  let depth = 0;
  let afterColon = false;
  for (let i = open; i < tokens.length; i += 1) {
    const t = tokens[i];
    if (t.value === "{") depth += 1;
    if (t.value === "}") {
      depth -= 1;
      if (depth === 0) break;
      continue;
    }
    if (t.value === ",") afterColon = false;
    if (t.value === ":") {
      afterColon = true;
      continue;
    }
    if (t.type !== "name") continue;
    if (afterColon) t.cls = "param";
  }
}

function markForBinding(tokens, open) {
  let depth = 0;
  let binding = false;
  for (let i = open; i < tokens.length; i += 1) {
    const t = tokens[i];
    if (t.value === "(") depth += 1;
    if (t.value === ")") {
      depth -= 1;
      if (depth === 0) break;
      continue;
    }
    if (t.type === "keyword" && (t.value === "const" || t.value === "let" || t.value === "var")) {
      binding = true;
      continue;
    }
    if (t.value === "of" || t.value === "in" || t.value === ";") binding = false;
    if (binding && t.type === "name") t.cls = "param";
  }
}

function markFromImport(tokens, fromAt) {
  let seenImport = false;
  for (let i = fromAt + 1; i < tokens.length; i += 1) {
    const t = tokens[i];
    if (t.type === "keyword" && t.value === "import") {
      seenImport = true;
      continue;
    }
    if (!seenImport) continue;
    if (t.type === "keyword") continue;
    if (t.type === "name") t.cls = "ty";
  }
}

function prevCode(tokens, i) {
  const j = prevCodeIndex(tokens, i);
  return j >= 0 ? tokens[j] : null;
}

function nextCode(tokens, i) {
  const j = nextCodeIndex(tokens, i);
  return j >= 0 ? tokens[j] : null;
}

function prevCodeIndex(tokens, i) {
  for (let j = i - 1; j >= 0; j -= 1) {
    if (tokens[j].type !== "space") return j;
  }
  return -1;
}

function nextCodeIndex(tokens, i) {
  for (let j = i + 1; j < tokens.length; j += 1) {
    if (tokens[j].type !== "space") return j;
  }
  return -1;
}

function assignedFunction(tokens, i) {
  const eq = nextCode(tokens, i);
  if (!eq || eq.value !== "=") return false;
  for (let j = i + 1; j < tokens.length; j += 1) {
    if (tokens[j].value === ";") break;
    if (tokens[j].value === "=>" || tokens[j].value === "function") return true;
  }
  return false;
}

function prevKeyword(tokens, i) {
  for (let j = i - 1; j >= 0; j -= 1) {
    if (tokens[j].type === "space") continue;
    if (tokens[j].type === "keyword") return tokens[j].value;
    return "";
  }
  return "";
}

function findNextValue(tokens, i, value) {
  for (let j = i + 1; j < tokens.length; j += 1) {
    if (tokens[j].type === "space") continue;
    if (tokens[j].value === value) return j;
    return -1;
  }
  return -1;
}

function matchOpen(tokens, close) {
  let depth = 0;
  for (let j = close; j >= 0; j -= 1) {
    const v = tokens[j].value;
    if (v === ")") depth += 1;
    if (v === "(") {
      depth -= 1;
      if (depth === 0) return j;
    }
  }
  return -1;
}

export function nodesToFormatted(nodes) {
  const lines = [];
  emitNodes(nodes, lines);
  if (!lines.length) return "";
  return `${lines.join("\n")}\n`;
}

function emitNodes(nodes, lines) {
  for (const node of nodes) {
    if (node.type === "block") {
      lines.push(tokensText(node.header));
      emitNodes(node.children, lines);
    } else {
      lines.push(tokensText(node.tokens));
    }
  }
}

export function tokensText(tokens) {
  let out = "";
  for (const token of tokens || []) {
    if (token.type === "string") {
      const { prefix, open, value, close } = stringQuotes(token);
      out += `${prefix}${open}${value}${close}`;
    } else {
      out += token.value;
    }
  }
  return out;
}

export function countLines(nodes) {
  let n = 0;
  for (const node of nodes || []) {
    if (node.type === "block") n += 1 + countLines(node.children);
    else n += 1;
  }
  return n;
}

export function appendTrunc(root, api) {
  const target = [...root.querySelectorAll(".line .content")].at(-1);
  if (target && !target.querySelector(".trunc")) target.append(api.truncMark());
}

function stringQuotes(token) {
  const quote = token.quote || "";
  return {
    prefix: token.prefix || "",
    open: quote && token.side !== "close" ? quote : "",
    value: token.value,
    close: quote && token.side !== "open" ? quote : "",
  };
}

export function pickQuote(body, preferred) {
  const hasDouble = body.includes('"');
  const hasSingle = body.includes("'");
  if (preferred === "double") {
    if (hasDouble && !hasSingle) return "'";
    return '"';
  }
  if (hasSingle && !hasDouble) return '"';
  return "'";
}

export function rewriteString(token, preferred) {
  if (token.type !== "string") return token;
  if (token.quote === "`") return token;
  if ((token.quote || "").length > 1) {
    const want = preferred === "double" ? '"""' : "'''";
    const other = preferred === "double" ? "'''" : '"""';
    if (token.value.includes(want) && !token.value.includes(other)) return token;
    if (!token.value.includes(want)) return { ...token, quote: want };
    return token;
  }
  const quote = pickQuote(token.value, preferred);
  return { ...token, quote };
}

export function nestGroups(tokens) {
  const root = { kind: "seq", items: [] };
  const stack = [root];
  const match = { "(": ")", "[": "]", "{": "}" };
  for (const token of tokens) {
    const top = stack[stack.length - 1];
    if (token.value && match[token.value]) {
      const group = { kind: "group", open: token, close: null, items: [], truncated: false };
      top.items.push(group);
      stack.push(group);
      continue;
    }
    if (token.value === ")" || token.value === "]" || token.value === "}") {
      if (stack.length > 1) {
        const group = stack.pop();
        group.close = token;
        continue;
      }
    }
    top.items.push(token);
  }
  while (stack.length > 1) {
    const group = stack.pop();
    group.truncated = true;
  }
  return root;
}

export function groupHasTrailingComma(group) {
  const items = group.items.filter((item) => item.kind === "group" || (item.type !== "comment" && item.type !== "nl"));
  const last = items[items.length - 1];
  return Boolean(last && last.value === ",");
}

export function splitCommaItems(items) {
  const chunks = [];
  let current = [];
  for (const item of items) {
    if (item.kind !== "group" && item.value === ",") {
      chunks.push({ items: current, comma: item });
      current = [];
      continue;
    }
    current.push(item);
  }
  if (current.length) chunks.push({ items: current, comma: null });
  return chunks;
}

export function spaces(n) {
  return n ? [{ type: "space", value: " ".repeat(n) }] : [];
}

export function sp() {
  return { type: "space", value: " " };
}

export function isOpen(token) {
  return token && (token.value === "(" || token.value === "[" || token.value === "{");
}

export function isClose(token) {
  return token && (token.value === ")" || token.value === "]" || token.value === "}");
}

export function splitStringParts(body, firstBudget, nextBudget) {
  if (!body || firstBudget < 8) return null;
  const parts = [];
  let rest = body;
  let budget = Math.max(8, firstBudget);
  while (rest.length > budget) {
    let cut = rest.lastIndexOf(" ", budget);
    if (cut < Math.floor(budget / 3)) cut = budget;
    else cut += 1;
    parts.push(rest.slice(0, cut));
    rest = rest.slice(cut);
    budget = Math.max(8, nextBudget);
  }
  if (rest) parts.push(rest);
  return parts.length > 1 ? parts : null;
}
