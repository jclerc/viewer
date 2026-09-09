export function parseMarkdown(text) {
  const rawLines = String(text ?? "").split(/\r\n|\n|\r/);
  const lines = [];
  let fence = null;
  let truncated = false;

  for (const raw of rawLines) {
    if (fence) {
      if (isFenceClose(raw, fence)) {
        lines.push({ kind: "fence-end", raw, marker: fence.marker });
        fence = null;
      } else {
        lines.push({ kind: "code", raw });
      }
      continue;
    }

    const open = fenceOpen(raw);
    if (open) {
      fence = open;
      lines.push({ kind: "fence-start", raw, lang: open.lang, marker: open.marker });
      continue;
    }

    const heading = atxHeading(raw);
    if (heading) {
      lines.push({
        kind: "heading",
        raw,
        level: heading.level,
        hashes: heading.hashes,
        text: heading.text,
        tokens: tokenizeInline(heading.text),
      });
      continue;
    }

    if (/^\s{0,3}(---|\*\*\*|___)\s*$/.test(raw)) {
      lines.push({ kind: "hr", raw });
      continue;
    }

    if (/^\s{0,3}>/.test(raw)) {
      const body = raw.replace(/^\s{0,3}> ?/, "");
      lines.push({ kind: "quote", raw, body, tokens: tokenizeInline(body) });
      continue;
    }

    const list = listLine(raw);
    if (list) {
      lines.push({
        kind: "list",
        raw,
        mark: list.mark,
        body: list.body,
        tokens: tokenizeInline(list.body),
      });
      continue;
    }

    if (/^\s*\|/.test(raw) && raw.includes("|")) {
      lines.push({ kind: "table", raw, tokens: tokenizeInline(raw) });
      continue;
    }

    lines.push({ kind: "text", raw, tokens: tokenizeInline(raw) });
  }

  if (fence) truncated = true;
  return { lines, truncated };
}

function fenceOpen(raw) {
  const m = /^( {0,3})(`{3,}|~{3,})(.*)$/.exec(raw);
  if (!m) return null;
  const marker = m[2];
  if (marker[0] === "`" && m[3].includes("`")) return null;
  return { marker: marker[0], count: marker.length, lang: m[3].trim() };
}

function isFenceClose(raw, fence) {
  const m = /^( {0,3})(`{3,}|~{3,})\s*$/.exec(raw);
  if (!m) return false;
  if (m[2][0] !== fence.marker) return false;
  return m[2].length >= fence.count;
}

function atxHeading(raw) {
  const m = /^( {0,3})(#{1,6})(?:[ \t]+(.*?)(?:[ \t]+#+[ \t]*)?)?[ \t]*$/.exec(raw);
  if (!m) return null;
  const text = (m[3] || "").replace(/[ \t]+#+\s*$/, "").trimEnd();
  return { level: m[2].length, hashes: m[2], text };
}

function listLine(raw) {
  const m = /^( {0,3})([-*+]|\d+[.)])([ \t]+)(.*)$/.exec(raw);
  if (!m) return null;
  return { mark: m[1] + m[2], body: m[4] };
}

export function tokenizeInline(text) {
  const tokens = [];
  let i = 0;
  const n = text.length;

  while (i < n) {
    if (text[i] === "`") {
      let ticks = 0;
      while (i + ticks < n && text[i + ticks] === "`") ticks += 1;
      const close = text.indexOf("`".repeat(ticks), i + ticks);
      if (close !== -1) {
        tokens.push({ kind: "code", text: text.slice(i + ticks, close) });
        i = close + ticks;
        continue;
      }
    }

    if (text.startsWith("~~", i)) {
      const close = text.indexOf("~~", i + 2);
      if (close !== -1) {
        tokens.push({ kind: "strike", text: text.slice(i + 2, close) });
        i = close + 2;
        continue;
      }
    }

    if (text.startsWith("**", i) || text.startsWith("__", i)) {
      const mark = text.slice(i, i + 2);
      const close = text.indexOf(mark, i + 2);
      if (close !== -1) {
        tokens.push({ kind: "strong", text: text.slice(i + 2, close) });
        i = close + 2;
        continue;
      }
    }

    if (text[i] === "*" || text[i] === "_") {
      const mark = text[i];
      const close = text.indexOf(mark, i + 1);
      if (close !== -1 && (mark === "*" || (i === 0 || /\s/.test(text[i - 1])))) {
        tokens.push({ kind: "em", text: text.slice(i + 1, close) });
        i = close + 1;
        continue;
      }
    }

    const link = readLink(text, i);
    if (link) {
      tokens.push(link.token);
      i = link.next;
      continue;
    }

    const next = nextSpecial(text, i + 1);
    tokens.push({ kind: "text", text: text.slice(i, next) });
    i = next;
  }

  return tokens;
}

function nextSpecial(text, from) {
  for (let i = from; i < text.length; i += 1) {
    const c = text[i];
    if (c === "`" || c === "*" || c === "_" || c === "~" || c === "[" || c === "!") return i;
  }
  return text.length;
}

function readLink(text, i) {
  const image = text.startsWith("![", i);
  if (!image && text[i] !== "[") return null;
  const start = image ? i + 2 : i + 1;
  const closeLabel = text.indexOf("]", start);
  if (closeLabel === -1 || text[closeLabel + 1] !== "(") return null;
  const closeUrl = text.indexOf(")", closeLabel + 2);
  if (closeUrl === -1) return null;
  const label = text.slice(start, closeLabel);
  const url = text.slice(closeLabel + 2, closeUrl);
  return {
    next: closeUrl + 1,
    token: { kind: image ? "image" : "link", text: label, url },
  };
}

export function sectionEnd(lines, headerIndex) {
  const level = lines[headerIndex].level;
  for (let i = headerIndex + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (line.kind === "heading" && line.level <= 2 && line.level <= level) return i;
  }
  return lines.length;
}
