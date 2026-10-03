import { parseMarkdown } from "./parser.js";
import { canonicalLang, highlight } from "./highlight.js";
import { copyText, el, mountViewer, setCollapsed, tok } from "../assets/common.js";

const ID_PREFIX = "user-content-";

const ALERTS = {
  note: { title: "Note", icon: "M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13ZM8 7v4.5M8 4.6v.1" },
  tip: { title: "Tip", icon: "M8 1.8a4.2 4.2 0 0 0-2.5 7.6c.5.4.8 1 .8 1.6v.5h3.4V11c0-.6.3-1.2.8-1.6A4.2 4.2 0 0 0 8 1.8ZM6.4 13.6h3.2" },
  important: { title: "Important", icon: "M2.5 2.5h11v8.5H8l-3 2.5V11H2.5ZM8 4.8v3M8 9.3v.1" },
  warning: { title: "Warning", icon: "M8 2 14.5 13.5h-13ZM8 6.5v3.2M8 11.6v.1" },
  caution: { title: "Caution", icon: "M5.3 1.8h5.4l3.5 3.5v5.4l-3.5 3.5H5.3l-3.5-3.5V5.3ZM8 5v3.6M8 10.8v.1" },
};

const ALLOWED_TAGS = new Set(
  (
    "a abbr b bdi bdo blockquote br caption center cite code col colgroup dd del details dfn div dl dt em " +
    "figcaption figure h1 h2 h3 h4 h5 h6 hr i img ins kbd li mark ol p picture pre q rp rt ruby s samp small " +
    "source span strike strong sub summary sup table tbody td tfoot th thead time tr tt u ul var wbr"
  ).split(" "),
);

// GFM tagfilter, plus anything that can run code or submit data: dropped with its content.
const DROPPED_TAGS = new Set(
  (
    "script style iframe object embed applet frame frameset noscript noembed noframes title textarea xmp " +
    "plaintext template form input button select option link meta base svg math canvas audio video param head"
  ).split(" "),
);

const ALLOWED_ATTRS = {
  "*": ["title", "lang", "dir", "align", "id", "name"],
  a: ["href"],
  img: ["src", "alt", "width", "height"],
  source: ["srcset", "media", "type", "width", "height"],
  td: ["colspan", "rowspan", "valign", "width"],
  th: ["colspan", "rowspan", "valign", "width", "scope"],
  ol: ["start", "type", "reversed"],
  ul: ["type"],
  li: ["value"],
  details: ["open"],
  col: ["span", "width"],
  colgroup: ["span"],
  time: ["datetime"],
  q: ["cite"],
  blockquote: ["cite"],
  del: ["cite", "datetime"],
  ins: ["cite", "datetime"],
  table: ["width", "border"],
};

const entityBox = document.createElement("textarea");

mountViewer({
  kind: "md",
  copyToast: "markdown copied ✓",
  emptyMessage: "Paste Markdown on the left to view it here.",
  render,
});

document.querySelector("#viewer").addEventListener("click", onDocClick);

function render(text, api) {
  api.viewer.classList.add("is-md");
  const doc = parseMarkdown(text, { decodeEntity });
  const size = api.sourceSize(text);
  const trunc = doc.truncated;

  if (!doc.blocks.length && !doc.footnotes.length) {
    return {
      has: false,
      sourceHas: false,
      truncated: trunc,
      status: `${size} · Nothing could be parsed.`,
      empty: "Nothing could be parsed.",
    };
  }

  const root = document.createDocumentFragment();
  const view = new DocView(doc, api, text.split(/\r\n|\n|\r/).length);
  view.renderRange(view.units, 0, view.units.length, root);
  if (trunc) appendTrunc(root, api);

  return {
    has: true,
    sourceHas: true,
    truncated: trunc,
    formatted: text,
    fragment: root,
    status: `${size}${trunc ? " · incomplete" : ""}`,
  };
}

function decodeEntity(raw) {
  entityBox.innerHTML = raw;
  const value = entityBox.value;
  return value === raw ? null : value;
}

class DocView {
  constructor(doc, api, totalLines) {
    this.doc = doc;
    this.api = api;
    this.totalLines = totalLines;
    this.usedLines = new Set();
    this.overflowLine = totalLines;
    this.units = buildUnits(doc);
  }

  // Each unit becomes one viewer line; its gutter shows the source line it starts on.
  newLine(sourceLine, parent) {
    let n = sourceLine;
    if (!n || this.usedLines.has(n)) n = ++this.overflowLine;
    this.usedLines.add(n);
    this.api.ctx.line = n - 1;
    return this.api.newLine(0, parent);
  }

  renderRange(units, start, end, parent) {
    let i = start;
    while (i < end) {
      const unit = units[i];
      if (unit.kind === "block" && unit.block.type === "heading") {
        const close = Math.min(sectionEndUnits(units, i), end);
        if (close > i + 1) {
          this.renderSection(units, i, close, parent);
          i = close;
          continue;
        }
      }
      this.renderUnitLine(unit, parent);
      i += 1;
    }
  }

  renderSection(units, start, end, parent) {
    const heading = units[start].block;
    const block = el("div", { class: "block md-section" });
    const opener = this.newLine(heading.line, block);
    const fold = this.api.foldButton();
    opener.foldSlot.append(fold);
    opener.line.classList.add("md-line", "is-heading", `is-h${heading.level}`);
    const h = this.heading(heading);
    opener.content.append(h);

    const nextLine = units.slice(end).find((u) => u.kind !== "footnote")?.line ?? this.totalLines + 1;
    const hidden = Math.max(1, nextLine - heading.line - 1);
    const preview = el("span", { class: "preview" });
    const ellipsis = el("span", { class: "ellipsis", title: `${hidden} hidden line${hidden === 1 ? "" : "s"}` }, `…${hidden}`);
    preview.append(ellipsis);
    h.append(preview);

    const children = el("div", { class: "children" });
    this.renderRange(units, start + 1, end, children);
    block.append(children);
    parent.append(block);

    fold.addEventListener("click", (e) => {
      e.stopPropagation();
      this.api.toggleBlock(block);
    });
    ellipsis.addEventListener("click", (e) => {
      e.stopPropagation();
      if (block.classList.contains("is-collapsed")) this.api.toggleBlock(block);
    });
  }

  renderUnitLine(unit, parent) {
    const row = this.newLine(unit.line, parent);
    row.line.classList.add("md-line", `is-${unit.kind}`);
    const content = row.content;
    switch (unit.kind) {
      case "item": {
        const { list, item, index } = unit;
        if (list.tight) row.line.classList.add("is-tight");
        if (index === 0) row.line.classList.add("is-first");
        if (index === list.children.length - 1) row.line.classList.add("is-last");
        const wrap = this.listShell(list, index);
        wrap.append(this.item(item, list.tight));
        content.append(wrap);
        break;
      }
      case "group":
        content.append(this.mixed(unit.blocks.map((b) => (b.type === "html" ? b.text : this.block(b)))));
        break;
      case "footnote":
        if (unit.first) {
          row.line.classList.add("is-first");
          content.append(el("div", { class: "md-footnotes-title" }, "Footnotes"));
        }
        content.append(this.footnote(unit.footnote));
        break;
      default:
        row.line.classList.add(`is-${unit.block.type}`);
        content.append(this.block(unit.block));
    }
  }

  blocks(list, tight = false) {
    const frag = document.createDocumentFragment();
    let i = 0;
    while (i < list.length) {
      const b = list[i];
      if (b.type === "html") {
        const end = htmlGroupEnd(list, i);
        frag.append(this.mixed(list.slice(i, end).map((x) => (x.type === "html" ? x.text : this.block(x, tight)))));
        i = end;
        continue;
      }
      frag.append(this.block(b, tight));
      i += 1;
    }
    return frag;
  }

  block(b, tight = false) {
    switch (b.type) {
      case "paragraph":
        return tight ? this.inlines(b.children) : el("p", {}, this.inlines(b.children));
      case "heading":
        return this.heading(b);
      case "code":
        return this.code(b.text, b.lang, b.info, b.closed ? "" : "is-open");
      case "frontmatter":
        return this.code(b.text ? `${b.text}\n` : "", b.format, `${b.format} front matter`, "is-frontmatter");
      case "html":
        return this.mixed([b.text]);
      case "hr":
        return el("hr");
      case "blockquote":
        return b.alert ? this.alert(b) : el("blockquote", {}, this.blocks(b.children));
      case "list": {
        const list = this.listShell(b, 0);
        for (const item of b.children) list.append(this.item(item, b.tight));
        return list;
      }
      case "table":
        return this.table(b);
      case "toc":
        return this.toc();
      default:
        return document.createTextNode("");
    }
  }

  heading(b) {
    const h = el(`h${b.level}`, { class: "md-h", id: ID_PREFIX + b.id });
    h.append(this.inlines(b.children));
    h.append(el("a", { class: "md-anchor", href: `#${b.id}`, "aria-label": `Link to ${b.text}` }));
    return h;
  }

  listShell(list, index) {
    const tasks = list.children.some((item) => item.task);
    const cls = `md-list ${list.tight ? "is-tight" : "is-loose"}${tasks ? " has-tasks" : ""}`;
    if (!list.ordered) return el("ul", { class: cls });
    const start = list.start + index;
    return el("ol", { class: cls, start: start === 1 ? null : start });
  }

  item(item, tight) {
    const li = el("li");
    if (item.task) {
      li.classList.add("md-task");
      if (item.task === "~") li.classList.add("is-na");
      li.append(
        el("input", {
          type: "checkbox",
          class: "md-check",
          disabled: true,
          checked: item.task === "x",
          "aria-label": item.task === "x" ? "Done" : item.task === "~" ? "Not applicable" : "To do",
        }),
      );
    }
    li.append(this.blocks(item.children, tight));
    return li;
  }

  code(text, lang, info, extra = "") {
    const label = info || lang || "";
    const box = el("div", { class: `md-pre${extra ? ` ${extra}` : ""}`, "data-lang": label || null });
    const button = el("button", { type: "button", class: "md-copy", "aria-label": "Copy code", title: "Copy code" });
    button.innerHTML =
      '<svg class="glyph" aria-hidden="true" viewBox="0 0 16 16" width="14" height="14"><use href="#g-copy" /></svg>';
    const code = el("code", { class: lang ? `language-${canonicalLang(lang)}` : null });
    const body = text.endsWith("\n") ? text.slice(0, -1) : text;
    for (const token of highlight(body, lang)) {
      code.append(token.cls ? tok(`hl-${token.cls}`, token.text) : token.text);
    }
    const pre = el("pre", {}, code);
    if (canonicalLang(lang) === "math") pre.classList.add("is-math");
    box.append(button, pre);
    return box;
  }

  alert(b) {
    const kind = ALERTS[b.alert.kind];
    const box = el("div", { class: `md-alert is-${b.alert.kind}` });
    const title = el("p", { class: "md-alert-title" });
    title.innerHTML = `<svg class="glyph" aria-hidden="true" viewBox="0 0 16 16" width="16" height="16"><path d="${kind.icon}" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    title.append(b.alert.title || kind.title);
    box.append(title, this.blocks(b.children));
    return box;
  }

  table(b) {
    const cellAttrs = (i) => (b.align[i] ? { style: `text-align: ${b.align[i]}` } : {});
    const thead = el("thead", {}, el("tr", {}, ...b.head.map((cell, i) => el("th", cellAttrs(i), this.inlines(cell)))));
    const table = el("table", {}, thead);
    if (b.rows.length) {
      const tbody = el("tbody");
      for (const row of b.rows) {
        tbody.append(el("tr", {}, ...row.map((cell, i) => el("td", cellAttrs(i), this.inlines(cell)))));
      }
      table.append(tbody);
    }
    return el("div", { class: "md-table-wrap" }, table);
  }

  toc() {
    const root = el("ul", { class: "md-toc" });
    const stack = [{ level: 0, list: root }];
    for (const h of this.doc.headings) {
      while (stack.length > 1 && stack[stack.length - 1].level >= h.level) stack.pop();
      const li = el("li", {}, el("a", { class: "md-link", href: `#${h.id}` }, h.text));
      stack[stack.length - 1].list.append(li);
      const sub = el("ul");
      li.append(sub);
      stack.push({ level: h.level, list: sub });
    }
    root.querySelectorAll("ul:empty").forEach((ul) => ul.remove());
    return el("nav", { class: "md-toc-box", "aria-label": "Table of contents" }, root);
  }

  footnote(f) {
    const li = el("li", { id: `${ID_PREFIX}fn-${f.label}` });
    li.append(this.blocks(f.children));
    const backrefs = document.createDocumentFragment();
    for (let r = 1; r <= f.refs; r += 1) {
      const id = r === 1 ? `fnref-${f.label}` : `fnref-${f.label}-${r}`;
      backrefs.append(" ", el("a", { class: "md-backref", href: `#${id}`, "aria-label": "Back to reference" }, r === 1 ? "↩" : `↩${r}`));
    }
    const last = li.lastElementChild;
    if (last && last.localName === "p") last.append(backrefs);
    else li.append(backrefs);
    return el("ol", { class: "md-footnotes", start: f.n === 1 ? null : f.n }, li);
  }

  inlines(nodes) {
    if (!nodes.some((n) => n.type === "html")) {
      const frag = document.createDocumentFragment();
      for (const node of nodes) frag.append(this.inline(node));
      return frag;
    }
    return this.mixed(nodes.map((n) => (n.type === "html" ? n.text : this.inline(n))));
  }

  inline(n) {
    switch (n.type) {
      case "text":
        return document.createTextNode(n.text);
      case "softbreak":
        return document.createTextNode("\n");
      case "linebreak":
        return el("br");
      case "code":
        return inlineCode(n.text);
      case "emph":
        return el("em", {}, this.inlines(n.children));
      case "strong":
        return el("strong", {}, this.inlines(n.children));
      case "strike":
        return el("del", {}, this.inlines(n.children));
      case "ins":
        return el("ins", { class: "md-diff" }, this.inlines(n.children));
      case "del":
        return el("del", { class: "md-diff" }, this.inlines(n.children));
      case "link":
        return this.link(n);
      case "image":
        return imageNode(n);
      case "emoji":
        return el("span", { class: "md-emoji", title: `:${n.name}:` }, n.text);
      case "math":
        return el("span", { class: n.display ? "md-math is-display" : "md-math" }, n.text);
      case "footnote_ref": {
        const id = n.ref === 1 ? `${ID_PREFIX}fnref-${n.label}` : `${ID_PREFIX}fnref-${n.label}-${n.ref}`;
        return el("sup", { class: "md-fnref" }, el("a", { href: `#fn-${n.label}`, id }, String(n.n)));
      }
      default:
        return document.createTextNode("");
    }
  }

  link(n) {
    const href = safeUrl(n.href);
    const children = this.inlines(n.children);
    if (!href) {
      const span = el("span", { class: "md-link is-dead", title: n.href || null });
      span.append(children);
      return span;
    }
    const a = el("a", { class: "md-link", href, title: n.title || null });
    if (!href.startsWith("#")) {
      a.target = "_blank";
      a.rel = "noopener noreferrer";
    }
    a.append(children);
    return a;
  }

  // Raw HTML can open in one node and close in another, so the parts are joined
  // into one string, parsed and sanitized, then rendered nodes are put back.
  mixed(parts) {
    const nonce = Math.random().toString(36).slice(2);
    const nodes = [];
    const html = parts
      .map((part) => {
        if (typeof part === "string") return part;
        nodes.push(part);
        return `<md-slot data-k="${nonce}" data-i="${nodes.length - 1}"></md-slot>`;
      })
      .join("");
    const tpl = document.createElement("template");
    tpl.innerHTML = html;
    sanitize(tpl.content, nonce);
    tpl.content.querySelectorAll("md-slot").forEach((slot) => {
      slot.replaceWith(nodes[Number(slot.dataset.i)]);
    });
    return tpl.content;
  }
}

function buildUnits(doc) {
  const units = [];
  const blocks = doc.blocks;
  let i = 0;
  while (i < blocks.length) {
    const b = blocks[i];
    if (b.type === "html") {
      const end = htmlGroupEnd(blocks, i);
      units.push({ kind: "group", line: b.line, blocks: blocks.slice(i, end) });
      i = end;
      continue;
    }
    if (b.type === "list") {
      b.children.forEach((item, index) => units.push({ kind: "item", line: item.line, list: b, item, index }));
    } else {
      units.push({ kind: "block", line: b.line, block: b });
    }
    i += 1;
  }
  doc.footnotes.forEach((footnote, index) => {
    units.push({ kind: "footnote", line: footnote.line, footnote, first: index === 0 });
  });
  return units;
}

function sectionEndUnits(units, index) {
  const level = units[index].block.level;
  for (let i = index + 1; i < units.length; i += 1) {
    const u = units[i];
    if (u.kind === "footnote") return i;
    if (u.kind === "block" && u.block.type === "heading" && u.block.level <= level) return i;
  }
  return units.length;
}

// An HTML block that leaves tags open (<details>, <div>, …) swallows the
// Markdown blocks that follow until its closing tag shows up.
function htmlGroupEnd(blocks, start) {
  let depth = tagDepth(blocks[start].text);
  let i = start + 1;
  while (depth > 0 && i < blocks.length) {
    if (blocks[i].type === "html") depth += tagDepth(blocks[i].text);
    i += 1;
  }
  return i;
}

const VOID_TAGS = new Set("area base br col embed hr img input link meta source track wbr".split(" "));

function tagDepth(html) {
  let depth = 0;
  const clean = html.replace(/<!--[\s\S]*?-->/g, "");
  for (const m of clean.matchAll(/<(\/?)([A-Za-z][A-Za-z0-9-]*)[^>]*?(\/?)>/g)) {
    const name = m[2].toLowerCase();
    if (VOID_TAGS.has(name) || m[3]) continue;
    depth += m[1] ? -1 : 1;
  }
  return depth;
}

function inlineCode(text) {
  const code = el("code", { class: "md-code" });
  const color = colorChip(text);
  if (color) {
    const chip = el("span", { class: "md-chip", "aria-hidden": "true" });
    chip.style.background = color;
    code.append(chip);
  }
  code.append(text);
  return code;
}

// GitLab colour chips: `#F00`, `#FF0000AA`, `RGB(0,0,0)`, `HSLA(…)` in inline code.
function colorChip(text) {
  const value = text.trim();
  if (!/^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$|^(?:rgba?|hsla?)\([^()]*\)$/i.test(value)) return null;
  return CSS.supports("color", value) ? value : null;
}

function imageNode(n) {
  const src = safeUrl(n.src);
  if (!src) return el("span", { class: "md-img-missing", title: n.src || null }, n.alt || "image");
  const img = el("img", {
    class: "md-img",
    src,
    alt: n.alt,
    title: n.title || null,
    width: n.width?.replace(/px$/, "") || null,
    height: n.height?.replace(/px$/, "") || null,
    loading: "lazy",
  });
  img.addEventListener("error", () => onImageError(img), { once: true });
  return img;
}

function onImageError(img) {
  const alt = img.getAttribute("alt") || "image";
  const span = el("span", { class: "md-img-missing", title: img.getAttribute("src") }, alt);
  img.replaceWith(span);
}

function safeUrl(url) {
  const raw = String(url ?? "").trim();
  if (!raw) return "";
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(raw);
  if (scheme) return /^(https?|mailto|ftp|tel)$/i.test(scheme[1]) ? raw : "";
  return raw;
}

function allowedAttr(tag, name) {
  return ALLOWED_ATTRS["*"].includes(name) || (ALLOWED_ATTRS[tag]?.includes(name) ?? false);
}

function sanitize(root, nonce) {
  for (const node of [...root.querySelectorAll("*")]) {
    const tag = node.localName;
    if (tag === "md-slot") {
      if (node.getAttribute("data-k") !== nonce) node.remove();
      continue;
    }
    if (DROPPED_TAGS.has(tag)) {
      node.remove();
      continue;
    }
    if (!ALLOWED_TAGS.has(tag)) {
      node.replaceWith(...node.childNodes);
      continue;
    }
    for (const attr of [...node.attributes]) {
      const name = attr.name.toLowerCase();
      if (!allowedAttr(tag, name)) {
        node.removeAttribute(attr.name);
        continue;
      }
      if (name === "href" || name === "src" || name === "cite") {
        const url = safeUrl(attr.value);
        if (url) node.setAttribute(name, url);
        else node.removeAttribute(attr.name);
      } else if (name === "srcset") {
        const ok = attr.value.split(",").every((part) => safeUrl(part.trim().split(/\s+/)[0]));
        if (!ok) node.removeAttribute(attr.name);
      } else if (name === "id" || name === "name") {
        node.setAttribute(name, ID_PREFIX + attr.value);
      }
    }
    if (tag === "a" && node.hasAttribute("href")) {
      node.classList.add("md-link");
      if (!node.getAttribute("href").startsWith("#")) {
        node.target = "_blank";
        node.rel = "noopener noreferrer";
      }
    } else if (tag === "img") {
      node.classList.add("md-img");
      node.loading = "lazy";
      node.addEventListener("error", () => onImageError(node), { once: true });
    }
  }
}

function onDocClick(e) {
  const copy = e.target.closest(".md-copy");
  if (copy) {
    e.preventDefault();
    const code = copy.parentElement.querySelector("code");
    copyText(code.textContent).then(() => {
      copy.classList.add("is-copied");
      setTimeout(() => copy.classList.remove("is-copied"), 1200);
    });
    return;
  }

  const a = e.target.closest("a[href^='#']");
  if (!a || !e.currentTarget.contains(a)) return;
  // The page hash holds the shared document, so in-page links scroll instead.
  e.preventDefault();
  const id = decodeURIComponent(a.getAttribute("href").slice(1));
  const viewer = e.currentTarget;
  const target =
    viewer.querySelector(`[id="${CSS.escape(ID_PREFIX + id)}"]`) ??
    viewer.querySelector(`[id="${CSS.escape(id)}"]`) ??
    viewer.querySelector(`[name="${CSS.escape(ID_PREFIX + id)}"]`);
  if (!target) return;
  for (let node = target.parentElement; node && node !== viewer; node = node.parentElement) {
    if (node.classList.contains("block") && node.classList.contains("is-collapsed")) setCollapsed(node, false);
  }
  target.scrollIntoView({ block: "start", behavior: "smooth" });
  target.classList.remove("is-target");
  void target.offsetWidth;
  target.classList.add("is-target");
}

function appendTrunc(root, api) {
  if (root.querySelector(".trunc")) return;
  const open = [...root.querySelectorAll(".md-pre.is-open code")].at(-1);
  const target = open ?? [...root.querySelectorAll(".line .content")].at(-1);
  target?.append(api.truncMark());
}

