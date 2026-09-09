import { parseMarkdown, sectionEnd } from "./parser.js";
import { mountViewer, tok } from "../assets/common.js";

mountViewer({
  kind: "md",
  copyToast: "markdown copied ✓",
  emptyMessage: "Paste Markdown on the left to view it here.",
  render,
});

function render(text, api) {
  api.viewer.classList.add("is-md");
  const parsed = parseMarkdown(text);
  const lines = parsed.lines;
  const has = lines.length > 0;
  const size = api.sourceSize(text);
  const trunc = parsed.truncated;

  if (!has) {
    return {
      has: false,
      sourceHas: false,
      truncated: trunc,
      status: `${size} · Nothing could be parsed.`,
      empty: "Nothing could be parsed.",
    };
  }

  const root = document.createDocumentFragment();
  renderRange(lines, 0, lines.length, root, api);
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

function renderRange(lines, start, end, parent, api) {
  let i = start;
  while (i < end) {
    const line = lines[i];
    if (line.kind === "heading" && line.level <= 2) {
      const close = Math.min(sectionEnd(lines, i), end);
      if (close > i + 1) {
        renderSection(lines, i, close, parent, api);
        i = close;
        continue;
      }
    }
    renderLine(line, parent, api);
    i += 1;
  }
}

function renderSection(lines, start, end, parent, api) {
  const heading = lines[start];
  const block = api.el("div", { class: "block" });
  const opener = api.newLine(0, block);
  const fold = api.foldButton();
  opener.foldSlot.append(fold);
  appendHeading(opener.content, heading);

  const count = end - start - 1;
  const preview = api.el("span", { class: "preview" });
  const ellipsis = api.el("span", { class: "ellipsis" }, `…${count}`);
  preview.append(ellipsis);
  opener.content.append(preview);

  const children = api.el("div", { class: "children" });
  renderRange(lines, start + 1, end, children, api);
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

function renderLine(line, parent, api) {
  const row = api.newLine(0, parent);
  appendLine(row.content, line);
}

function appendHeading(content, line) {
  const wrap = tok(`md-h${line.level}`, "");
  wrap.append(tok("md-hash", `${line.hashes} `));
  appendTokens(wrap, line.tokens);
  content.append(wrap);
}

function appendLine(content, line) {
  switch (line.kind) {
    case "heading":
      appendHeading(content, line);
      return;
    case "fence-start":
    case "fence-end":
      content.append(tok("md-fence", line.raw));
      return;
    case "code":
      content.append(tok("md-codeblock", line.raw));
      return;
    case "hr":
      content.append(tok("md-hr", line.raw));
      return;
    case "quote":
      content.append(tok("md-quote-mark", "> "));
      appendTokens(content, line.tokens);
      return;
    case "list":
      content.append(tok("md-list-mark", `${line.mark} `));
      appendTokens(content, line.tokens);
      return;
    default:
      appendTokens(content, line.tokens);
  }
}

function appendTokens(content, tokens) {
  for (const token of tokens) {
    switch (token.kind) {
      case "code":
        content.append(tok("md-code", token.text));
        break;
      case "strong":
        content.append(tok("md-strong", token.text));
        break;
      case "em":
        content.append(tok("md-em", token.text));
        break;
      case "strike":
        content.append(tok("md-strike", token.text));
        break;
      case "link": {
        const node = tok("md-link", token.text);
        node.title = token.url;
        content.append(node);
        break;
      }
      case "image": {
        const node = tok("md-image", token.text || "image");
        node.title = token.url;
        content.append(node);
        break;
      }
      default:
        content.append(token.text);
    }
  }
}

function appendTrunc(root, api) {
  const target = [...root.querySelectorAll(".line .content")].at(-1);
  if (target && !target.querySelector(".trunc")) target.append(api.truncMark());
}
