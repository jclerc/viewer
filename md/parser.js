// CommonMark 0.31 block + inline parser, with the GitHub (GFM) and GitLab (GLFM)
// extensions. Block parsing follows the spec's two-phase algorithm (container
// stack, then inlines once every link reference definition is known).
import { ENTITIES } from "./entities.js";
import { EMOJI } from "./emoji.js";

const ESCAPABLE = "[!\"#$%&'()*+,./:;<=>?@[\\\\\\]^_`{|}~-]";
const ENTITY = "&(?:#x[a-f0-9]{1,6}|#[0-9]{1,7}|[a-z][a-z0-9]{1,31});";
const reEscapable = new RegExp(`^${ESCAPABLE}`);
const reEntityOrEscapedChar = new RegExp(`\\\\${ESCAPABLE}|${ENTITY}`, "gi");
const reEntityHere = new RegExp(`^${ENTITY}`, "i");

const TAGNAME = "[A-Za-z][A-Za-z0-9-]*";
const ATTRIBUTENAME = "[a-zA-Z_:][a-zA-Z0-9:._-]*";
const ATTRIBUTEVALUE = "(?:[^\"'=<>`\\x00-\\x20]+|'[^']*'|\"[^\"]*\")";
const ATTRIBUTE = `(?:\\s+${ATTRIBUTENAME}(?:\\s*=\\s*${ATTRIBUTEVALUE})?)`;
const OPENTAG = `<${TAGNAME}${ATTRIBUTE}*\\s*/?>`;
const CLOSETAG = `</${TAGNAME}\\s*[>]`;
const HTMLCOMMENT = "<!-->|<!--->|<!--[\\s\\S]*?-->";
const PROCESSING = "[<][?][\\s\\S]*?[?][>]";
const DECLARATION = "<![A-Za-z][^>]*>";
const CDATA = "<!\\[CDATA\\[[\\s\\S]*?\\]\\]>";
const reHtmlTag = new RegExp(
  `^(?:${OPENTAG}|${CLOSETAG}|${HTMLCOMMENT}|${PROCESSING}|${DECLARATION}|${CDATA})`,
  "i",
);

const reHtmlBlockOpen = [
  null,
  /^<(?:script|pre|textarea|style)(?:\s|>|$)/i,
  /^<!--/,
  /^<[?]/,
  /^<![A-Za-z]/,
  /^<!\[CDATA\[/,
  /^<[/]?(?:address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h[123456]|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|nav|noframes|ol|optgroup|option|p|param|search|section|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul)(?:\s|[/]?[>]|$)/i,
  new RegExp(`^(?:${OPENTAG}|${CLOSETAG})\\s*$`, "i"),
];

const reHtmlBlockClose = [
  null,
  /<\/(?:script|pre|textarea|style)>/i,
  /-->/,
  /\?>/,
  />/,
  /\]\]>/,
];

const reThematicBreak = /^(?:\*[ \t]*){3,}$|^(?:_[ \t]*){3,}$|^(?:-[ \t]*){3,}$/;
const reClosingFence = /^(?:`{3,}|~{3,}|\${2,})(?=[ \t]*$)/;
const reMlQuote = /^>{3,}[ \t]*$/;
const reTableDelim = /^\|?[ \t]*:?-+:?[ \t]*(?:\|[ \t]*:?-+:?[ \t]*)*\|?[ \t]*$/;
const reTableBreaker =
  /^(?:>|#{1,6}(?:[ \t]|$)|`{3,}|~{3,}|<[A-Za-z/!?]|(?:[-*_][ \t]*){3,}$|[*+-](?:[ \t]|$)|\d{1,9}[.)](?:[ \t]|$))/;
const reLinkTitle = /^(?:"(?:\\[\s\S]|[^"\\\x00])*"|'(?:\\[\s\S]|[^'\\\x00])*'|\((?:\\[\s\S]|[^()\\\x00])*\))/;
const reLinkDestinationBraces = /^<(?:[^<>\n\\\x00]|\\.)*>/;
const reLinkLabel = /^\[(?:[^\\[\]]|\\[\s\S]){0,1000}\]/;
const reSpnl = /^[ \t]*(?:\n[ \t]*)?/;
const reEmailAutolink =
  /^<([a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*)>/;
const reAutolink = /^<[A-Za-z][A-Za-z0-9.+-]{1,31}:[^<>\x00-\x20]*>/;
const reMain = /^[^\n`[\]\\!<&*_~$:{]+/;
const rePunctuation = /^[\p{P}\p{S}]/u;
const reWhitespaceChar = /^[ \t\n\x0b\x0c\x0d\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]/;
const reAlert = /^\[!(note|tip|important|warning|caution)\][ \t]*(.*)$/i;
const reTask = /^\[([ xX~])\](?=[ \t]|$)[ \t]*/;
const reToc = /^(?:\[\[_TOC_\]\]|\[TOC\])$/i;

class Node {
  constructor(type, props) {
    this.type = type;
    this.parent = null;
    this.firstChild = null;
    this.lastChild = null;
    this.prev = null;
    this.next = null;
    if (props) Object.assign(this, props);
  }

  appendChild(child) {
    child.unlink();
    child.parent = this;
    if (this.lastChild) {
      this.lastChild.next = child;
      child.prev = this.lastChild;
      this.lastChild = child;
    } else {
      this.firstChild = child;
      this.lastChild = child;
    }
  }

  insertAfter(sibling) {
    sibling.unlink();
    sibling.next = this.next;
    if (sibling.next) sibling.next.prev = sibling;
    sibling.prev = this;
    this.next = sibling;
    sibling.parent = this.parent;
    if (!sibling.next && sibling.parent) sibling.parent.lastChild = sibling;
  }

  unlink() {
    if (this.prev) this.prev.next = this.next;
    else if (this.parent) this.parent.firstChild = this.next;
    if (this.next) this.next.prev = this.prev;
    else if (this.parent) this.parent.lastChild = this.prev;
    this.parent = null;
    this.prev = null;
    this.next = null;
  }
}

function isSpaceOrTab(c) {
  return c === " " || c === "\t";
}

function isBlankText(s) {
  return /^[ \t\n]*$/.test(s);
}

export function normalizeLabel(label) {
  return label.trim().replace(/[ \t\r\n]+/g, " ").toLowerCase().toUpperCase();
}

function decodeEntity(raw, state) {
  if (raw[1] === "#") {
    const hex = raw[2] === "x" || raw[2] === "X";
    const code = parseInt(raw.slice(hex ? 3 : 2, -1), hex ? 16 : 10);
    if (!code || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) return "\uFFFD";
    return String.fromCodePoint(code);
  }
  const name = raw.slice(1, -1);
  if (Object.hasOwn(ENTITIES, name)) return ENTITIES[name];
  return state?.decode?.(raw) ?? null;
}

function unescapeString(s, state) {
  if (!/[\\&]/.test(s)) return s;
  return s.replace(reEntityOrEscapedChar, (m) =>
    m[0] === "\\" ? m[1] : (decodeEntity(m, state) ?? m),
  );
}

export function normalizeURI(uri) {
  return uri.replace(/%(?![0-9a-f]{2})|[^%A-Za-z0-9;/?:@&=+$,\-_.!~*'()#]+/gi, (m) => {
    if (m === "%") return "%25";
    try {
      return encodeURIComponent(m);
    } catch {
      return m;
    }
  });
}

// ---------------------------------------------------------------------------
// Blocks

const BLOCKS = {
  document: {
    continue: () => 0,
    canContain: (t) => t !== "item",
  },
  list: {
    continue: () => 0,
    finalize: finalizeList,
    canContain: (t) => t === "item",
  },
  blockquote: {
    continue: continueQuote,
    canContain: (t) => t !== "item",
  },
  item: {
    continue: continueItem,
    canContain: (t) => t !== "item",
  },
  footnote_def: {
    continue: continueFootnote,
    finalize: finalizeFootnote,
    canContain: (t) => t !== "item",
  },
  heading: {
    continue: () => 1,
    canContain: () => false,
  },
  hr: {
    continue: () => 1,
    canContain: () => false,
  },
  code: {
    continue: continueCode,
    finalize: finalizeCode,
    canContain: () => false,
    acceptsLines: true,
  },
  html: {
    continue: (p, block) => (p.blank && (block.htmlType === 6 || block.htmlType === 7) ? 1 : 0),
    finalize: (p, block) => {
      block.text = block.content.replace(/(\n *)+$/, "");
    },
    canContain: () => false,
    acceptsLines: true,
  },
  paragraph: {
    continue: (p) => (p.blank ? 1 : 0),
    finalize: finalizeParagraph,
    canContain: () => false,
    acceptsLines: true,
  },
  table: {
    continue: continueTable,
    finalize: finalizeTable,
    canContain: () => false,
    acceptsLines: true,
  },
  mlquote: {
    continue: continueMlQuote,
    finalize: finalizeMlQuote,
    canContain: () => false,
    acceptsLines: true,
  },
};

function continueQuote(p) {
  if (p.indented || p.line[p.nextNonspace] !== ">") return 1;
  p.advanceNextNonspace();
  p.advanceOffset(1, false);
  if (isSpaceOrTab(p.line[p.offset])) p.advanceOffset(1, true);
  return 0;
}

function continueItem(p, block) {
  if (p.blank) {
    if (!block.firstChild) return 1;
    p.advanceNextNonspace();
  } else if (p.indent >= block.markerOffset + block.padding) {
    p.advanceOffset(block.markerOffset + block.padding, true);
  } else {
    return 1;
  }
  return 0;
}

function continueFootnote(p) {
  if (p.blank) p.advanceNextNonspace();
  else if (p.indent >= 4) p.advanceOffset(4, true);
  else return 1;
  return 0;
}

function finalizeFootnote(p, block) {
  block.unlink();
  const key = normalizeLabel(block.label);
  if (!p.state.footnotes.has(key)) p.state.footnotes.set(key, block);
}

function continueCode(p, block) {
  if (block.fenced) {
    const rest = p.line.slice(p.nextNonspace);
    if (p.indent <= 3 && rest[0] === block.fenceChar) {
      const m = reClosingFence.exec(rest);
      if (m && m[0].length >= block.fenceLength) {
        block.closed = true;
        p.finalize(block);
        return 2;
      }
    }
    let i = block.fenceOffset;
    while (i > 0 && isSpaceOrTab(p.line[p.offset])) {
      p.advanceOffset(1, true);
      i -= 1;
    }
    return 0;
  }
  if (p.indent >= 4) p.advanceOffset(4, true);
  else if (p.blank) p.advanceNextNonspace();
  else return 1;
  return 0;
}

function finalizeCode(p, block) {
  if (block.fenced) {
    const nl = block.content.indexOf("\n");
    block.info = unescapeString(block.content.slice(0, nl).trim(), p.state);
    block.text = block.content.slice(nl + 1);
    if (block.fenceChar === "$") block.info = "math";
  } else {
    block.info = "";
    block.text = block.content.replace(/(\n *)+$/, "\n");
  }
}

function finalizeParagraph(p, block) {
  let content = block.content;
  let pos;
  while (content[0] === "[" && (pos = parseReference(content, p.state))) content = content.slice(pos);
  block.content = content;
  if (isBlankText(content)) block.unlink();
}

function finalizeList(p, block) {
  block.tight = true;
  for (let item = block.firstChild; item; item = item.next) {
    if (endsWithBlankLine(item) && item.next) {
      block.tight = false;
      break;
    }
    for (let sub = item.firstChild; sub; sub = sub.next) {
      if (endsWithBlankLine(sub) && (item.next || sub.next)) {
        block.tight = false;
        break;
      }
    }
    if (!block.tight) break;
  }
}

function endsWithBlankLine(block) {
  while (block) {
    if (block.lastLineBlank) return true;
    if (!block.lastLineChecked && (block.type === "list" || block.type === "item")) {
      block.lastLineChecked = true;
      block = block.lastChild;
    } else {
      block.lastLineChecked = true;
      return false;
    }
  }
  return false;
}

function continueTable(p) {
  if (p.blank) return 1;
  const rest = p.line.slice(p.nextNonspace);
  if (!p.indented && reTableBreaker.test(rest) && !/(^|[^\\])\|/.test(rest)) return 1;
  return 0;
}

function finalizeTable(p, block) {
  const width = block.align.length;
  block.rows = block.content
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => {
      const cells = splitRow(line).slice(0, width);
      while (cells.length < width) cells.push("");
      return cells;
    });
}

function continueMlQuote(p, block) {
  if (!p.indented && reMlQuote.test(p.line.slice(p.nextNonspace))) {
    p.finalize(block);
    return 2;
  }
  return 0;
}

function finalizeMlQuote(p, block) {
  const lines = block.content.split("\n");
  lines.shift();
  if (lines.length && lines[lines.length - 1] === "") lines.pop();
  const sub = new Node("document", { line: block.line });
  new BlockParser(p.state, sub, lines, block.line).run();
  block.type = "blockquote";
  block.multiline = true;
  while (sub.firstChild) block.appendChild(sub.firstChild);
}

export function splitRow(line) {
  let s = line.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|") && !s.endsWith("\\|")) s = s.slice(0, -1);
  const cells = [];
  let cur = "";
  for (let i = 0; i < s.length; i += 1) {
    if (s[i] === "\\" && s[i + 1] === "|") {
      cur += "|";
      i += 1;
    } else if (s[i] === "|") {
      cells.push(cur.trim());
      cur = "";
    } else {
      cur += s[i];
    }
  }
  cells.push(cur.trim());
  return cells;
}

function alignOf(cell) {
  const left = cell.startsWith(":");
  const right = cell.endsWith(":");
  if (left && right) return "center";
  if (right) return "right";
  if (left) return "left";
  return "";
}

const BLOCK_STARTS = [
  function mlQuoteStart(p) {
    if (p.indented || !reMlQuote.test(p.line.slice(p.nextNonspace))) return 0;
    if (!p.hasLaterLine(reMlQuote)) return 0;
    p.closeUnmatchedBlocks();
    p.addChild("mlquote");
    p.advanceOffset(p.line.length - p.offset, false);
    return 2;
  },

  function blockQuoteStart(p) {
    if (p.indented || p.line[p.nextNonspace] !== ">") return 0;
    p.advanceNextNonspace();
    p.advanceOffset(1, false);
    if (isSpaceOrTab(p.line[p.offset])) p.advanceOffset(1, true);
    p.closeUnmatchedBlocks();
    p.addChild("blockquote");
    return 1;
  },

  function atxStart(p) {
    if (p.indented) return 0;
    const m = /^#{1,6}(?:[ \t]+|$)/.exec(p.line.slice(p.nextNonspace));
    if (!m) return 0;
    p.advanceNextNonspace();
    p.advanceOffset(m[0].length, false);
    p.closeUnmatchedBlocks();
    const heading = p.addChild("heading");
    heading.level = m[0].trim().length;
    heading.content = p.line
      .slice(p.offset)
      .replace(/^[ \t]*#+[ \t]*$/, "")
      .replace(/[ \t]+#+[ \t]*$/, "");
    p.advanceOffset(p.line.length - p.offset, false);
    return 2;
  },

  function fenceStart(p) {
    if (p.indented) return 0;
    const m = /^`{3,}(?!.*`)|^~{3,}|^\$\$(?=[ \t]*$)/.exec(p.line.slice(p.nextNonspace));
    if (!m) return 0;
    p.closeUnmatchedBlocks();
    const code = p.addChild("code");
    code.fenced = true;
    code.closed = false;
    code.fenceChar = m[0][0];
    code.fenceLength = m[0].length;
    code.fenceOffset = p.indent;
    p.advanceNextNonspace();
    p.advanceOffset(m[0].length, false);
    return 2;
  },

  function htmlStart(p, container) {
    if (p.indented || p.line[p.nextNonspace] !== "<") return 0;
    const s = p.line.slice(p.nextNonspace);
    for (let t = 1; t <= 7; t += 1) {
      if (!reHtmlBlockOpen[t].test(s)) continue;
      if (t === 7) {
        if (container.type === "paragraph") return 0;
        if (!p.allClosed && !p.blank && p.tip.type === "paragraph") return 0;
      }
      p.closeUnmatchedBlocks();
      const block = p.addChild("html");
      block.htmlType = t;
      return 2;
    }
    return 0;
  },

  function tableStart(p, container) {
    if (p.indented || container.type !== "paragraph") return 0;
    const rest = p.line.slice(p.nextNonspace);
    if (!reTableDelim.test(rest)) return 0;
    const delim = splitRow(rest);
    const paraLines = container.content.replace(/\n$/, "").split("\n");
    const headerLine = paraLines[paraLines.length - 1];
    if (!rest.includes("|") && !/(^|[^\\])\|/.test(headerLine)) return 0;
    const head = splitRow(headerLine);
    if (head.length !== delim.length) return 0;

    p.closeUnmatchedBlocks();
    const table = new Node("table", {
      line: container.line + paraLines.length - 1,
      open: true,
      content: "",
      align: delim.map(alignOf),
      head,
    });
    container.insertAfter(table);
    if (paraLines.length > 1) {
      container.content = `${paraLines.slice(0, -1).join("\n")}\n`;
      p.finalize(container);
    } else {
      container.unlink();
    }
    p.tip = table;
    p.advanceOffset(p.line.length - p.offset, false);
    return 2;
  },

  function setextStart(p, container) {
    if (p.indented || container.type !== "paragraph") return 0;
    const m = /^(?:=+|-+)[ \t]*$/.exec(p.line.slice(p.nextNonspace));
    if (!m) return 0;
    p.closeUnmatchedBlocks();
    let pos;
    while (container.content[0] === "[" && (pos = parseReference(container.content, p.state))) {
      container.content = container.content.slice(pos);
    }
    if (!container.content) return 0;
    const heading = new Node("heading", {
      line: container.line,
      open: true,
      level: m[0][0] === "=" ? 1 : 2,
      content: container.content.trim(),
      setext: true,
    });
    container.insertAfter(heading);
    container.unlink();
    p.tip = heading;
    p.advanceOffset(p.line.length - p.offset, false);
    return 2;
  },

  function hrStart(p) {
    if (p.indented || !reThematicBreak.test(p.line.slice(p.nextNonspace))) return 0;
    p.closeUnmatchedBlocks();
    p.addChild("hr");
    p.advanceOffset(p.line.length - p.offset, false);
    return 2;
  },

  function footnoteStart(p) {
    if (p.indented) return 0;
    const m = /^\[\^([^\]\s]+)\]:[ \t]?/.exec(p.line.slice(p.nextNonspace));
    if (!m) return 0;
    p.closeUnmatchedBlocks();
    const def = p.addChild("footnote_def");
    def.label = m[1];
    p.advanceNextNonspace();
    p.advanceOffset(m[0].length, true);
    return 1;
  },

  function listStart(p, container) {
    if (p.indented && container.type !== "list") return 0;
    const data = parseListMarker(p, container);
    if (!data) return 0;
    p.closeUnmatchedBlocks();
    if (p.tip.type !== "list" || !listsMatch(p.tip, data)) {
      const list = p.addChild("list");
      Object.assign(list, data);
    }
    const item = p.addChild("item");
    Object.assign(item, data);
    return 1;
  },

  function indentedCodeStart(p) {
    if (!p.indented || p.tip.type === "paragraph" || p.blank) return 0;
    p.advanceOffset(4, true);
    p.closeUnmatchedBlocks();
    const code = p.addChild("code");
    code.fenced = false;
    return 2;
  },
];

function parseListMarker(p, container) {
  if (p.indent >= 4) return null;
  const rest = p.line.slice(p.nextNonspace);
  const data = { ordered: false, bulletChar: null, start: null, delimiter: null, padding: 0, markerOffset: p.indent };
  let m = /^[*+-]/.exec(rest);
  if (m) {
    data.bulletChar = m[0];
  } else if ((m = /^(\d{1,9})([.)])/.exec(rest)) && (container.type !== "paragraph" || m[1] === "1")) {
    data.ordered = true;
    data.start = parseInt(m[1], 10);
    data.delimiter = m[2];
  } else {
    return null;
  }
  const next = p.line[p.nextNonspace + m[0].length];
  if (!(next === undefined || next === "\t" || next === " ")) return null;
  if (container.type === "paragraph" && !/[^ \t]/.test(p.line.slice(p.nextNonspace + m[0].length))) {
    return null;
  }

  p.advanceNextNonspace();
  p.advanceOffset(m[0].length, true);
  const spacesStartCol = p.column;
  const spacesStartOffset = p.offset;
  do {
    p.advanceOffset(1, true);
  } while (p.column - spacesStartCol < 5 && isSpaceOrTab(p.line[p.offset]));
  const blankItem = p.line[p.offset] === undefined;
  const spacesAfter = p.column - spacesStartCol;
  if (spacesAfter >= 5 || spacesAfter < 1 || blankItem) {
    data.padding = m[0].length + 1;
    p.column = spacesStartCol;
    p.offset = spacesStartOffset;
    if (isSpaceOrTab(p.line[p.offset])) p.advanceOffset(1, true);
  } else {
    data.padding = m[0].length + spacesAfter;
  }
  return data;
}

function listsMatch(list, item) {
  return (
    list.ordered === item.ordered &&
    list.delimiter === item.delimiter &&
    list.bulletChar === item.bulletChar
  );
}

class BlockParser {
  constructor(state, doc, lines, lineOffset) {
    this.state = state;
    this.doc = doc;
    doc.open = true;
    this.lines = lines;
    this.lineOffset = lineOffset;
    this.tip = doc;
    this.oldtip = doc;
    this.lineNumber = lineOffset;
    this.lineIndex = 0;
    this.line = "";
    this.offset = 0;
    this.column = 0;
    this.nextNonspace = 0;
    this.nextNonspaceColumn = 0;
    this.indent = 0;
    this.indented = false;
    this.blank = false;
    this.partiallyConsumedTab = false;
    this.allClosed = true;
    this.lastMatchedContainer = doc;
  }

  run() {
    for (let i = 0; i < this.lines.length; i += 1) {
      this.lineIndex = i;
      this.incorporateLine(this.lines[i]);
    }
    while (this.tip) {
      if (this.tip.type === "code" && this.tip.fenced && !this.tip.closed) this.state.truncated = true;
      this.finalize(this.tip);
    }
    return this.doc;
  }

  hasLaterLine(re) {
    for (let i = this.lineIndex + 1; i < this.lines.length; i += 1) {
      if (re.test(this.lines[i].trim())) return true;
    }
    return false;
  }

  findNextNonspace() {
    let i = this.offset;
    let cols = this.column;
    let c;
    while ((c = this.line[i]) !== undefined) {
      if (c === " ") {
        i += 1;
        cols += 1;
      } else if (c === "\t") {
        i += 1;
        cols += 4 - (cols % 4);
      } else {
        break;
      }
    }
    this.blank = c === undefined;
    this.nextNonspace = i;
    this.nextNonspaceColumn = cols;
    this.indent = cols - this.column;
    this.indented = this.indent >= 4;
  }

  advanceNextNonspace() {
    this.offset = this.nextNonspace;
    this.column = this.nextNonspaceColumn;
    this.partiallyConsumedTab = false;
  }

  advanceOffset(count, columns) {
    let c;
    while (count > 0 && (c = this.line[this.offset]) !== undefined) {
      if (c === "\t") {
        const charsToTab = 4 - (this.column % 4);
        if (columns) {
          this.partiallyConsumedTab = charsToTab > count;
          const charsToAdvance = charsToTab > count ? count : charsToTab;
          this.column += charsToAdvance;
          this.offset += this.partiallyConsumedTab ? 0 : 1;
          count -= charsToAdvance;
        } else {
          this.partiallyConsumedTab = false;
          this.column += charsToTab;
          this.offset += 1;
          count -= 1;
        }
      } else {
        this.partiallyConsumedTab = false;
        this.offset += 1;
        this.column += 1;
        count -= 1;
      }
    }
  }

  addLine() {
    if (this.partiallyConsumedTab) {
      this.offset += 1;
      this.tip.content += " ".repeat(4 - (this.column % 4));
    }
    this.tip.content += `${this.line.slice(this.offset)}\n`;
  }

  addChild(type) {
    while (!BLOCKS[this.tip.type].canContain(type)) this.finalize(this.tip);
    const node = new Node(type, { line: this.lineNumber, open: true, content: "" });
    this.tip.appendChild(node);
    this.tip = node;
    return node;
  }

  finalize(block) {
    const above = block.parent;
    block.open = false;
    BLOCKS[block.type].finalize?.(this, block);
    this.tip = above;
  }

  closeUnmatchedBlocks() {
    if (this.allClosed) return;
    while (this.oldtip !== this.lastMatchedContainer) {
      const parent = this.oldtip.parent;
      this.finalize(this.oldtip);
      this.oldtip = parent;
    }
    this.allClosed = true;
  }

  incorporateLine(ln) {
    let container = this.doc;
    this.oldtip = this.tip;
    this.offset = 0;
    this.column = 0;
    this.blank = false;
    this.partiallyConsumedTab = false;
    this.lineNumber += 1;
    this.line = ln;

    let allMatched = true;
    let lastChild;
    while ((lastChild = container.lastChild) && lastChild.open) {
      container = lastChild;
      this.findNextNonspace();
      const res = BLOCKS[container.type].continue(this, container);
      if (res === 2) return;
      if (res === 1) {
        allMatched = false;
        break;
      }
    }
    if (!allMatched) container = container.parent;

    this.allClosed = container === this.oldtip;
    this.lastMatchedContainer = container;

    let matchedLeaf = container.type !== "paragraph" && BLOCKS[container.type].acceptsLines;
    while (!matchedLeaf) {
      this.findNextNonspace();
      let res = 0;
      for (const start of BLOCK_STARTS) {
        res = start(this, container);
        if (res) break;
      }
      if (!res) {
        this.advanceNextNonspace();
        break;
      }
      container = this.tip;
      if (res === 2) matchedLeaf = true;
    }

    if (!this.allClosed && !this.blank && this.tip.type === "paragraph") {
      this.addLine();
      return;
    }

    this.closeUnmatchedBlocks();
    if (this.blank && container.lastChild) container.lastChild.lastLineBlank = true;
    const t = container.type;
    const lastLineBlank =
      this.blank &&
      !(
        t === "blockquote" ||
        (t === "code" && container.fenced) ||
        (t === "item" && !container.firstChild && container.line === this.lineNumber)
      );
    for (let cont = container; cont; cont = cont.parent) cont.lastLineBlank = lastLineBlank;

    if (BLOCKS[t].acceptsLines) {
      this.addLine();
      if (
        t === "html" &&
        container.htmlType >= 1 &&
        container.htmlType <= 5 &&
        reHtmlBlockClose[container.htmlType].test(this.line.slice(this.offset))
      ) {
        this.finalize(container);
      }
    } else if (this.offset < ln.length && !this.blank) {
      this.addChild("paragraph");
      this.advanceNextNonspace();
      this.addLine();
    }
  }
}

// ---------------------------------------------------------------------------
// Link reference definitions

function parseReference(s, state) {
  const ip = new InlineParser(s, state);
  const labelLen = ip.parseLinkLabel();
  if (labelLen === 0) return 0;
  const rawLabel = s.slice(0, labelLen);
  if (/^\[\^/.test(rawLabel)) return 0;
  if (ip.peek() !== ":") return 0;
  ip.pos += 1;
  ip.spnl();
  const dest = ip.parseLinkDestination();
  if (dest === null) return 0;
  const beforeTitle = ip.pos;
  ip.spnl();
  let title = null;
  if (ip.pos !== beforeTitle) title = ip.parseLinkTitle();
  if (title === null) {
    title = "";
    ip.pos = beforeTitle;
  }
  let atLineEnd = true;
  if (ip.match(/^[ \t]*(?:\n|$)/) === null) {
    if (title === "") {
      atLineEnd = false;
    } else {
      title = "";
      ip.pos = beforeTitle;
      atLineEnd = ip.match(/^[ \t]*(?:\n|$)/) !== null;
    }
  }
  if (!atLineEnd) return 0;
  const key = normalizeLabel(rawLabel.slice(1, -1));
  if (!key) return 0;
  if (!state.refs.has(key)) state.refs.set(key, { dest, title });
  return ip.pos;
}

// ---------------------------------------------------------------------------
// Inlines

class InlineParser {
  constructor(subject, state) {
    this.subject = subject;
    this.state = state;
    this.pos = 0;
    this.delimiters = null;
    this.brackets = null;
    this.block = null;
  }

  peek() {
    return this.pos < this.subject.length ? this.subject[this.pos] : null;
  }

  match(re) {
    const m = re.exec(this.subject.slice(this.pos));
    if (m === null) return null;
    this.pos += m.index + m[0].length;
    return m[0];
  }

  spnl() {
    this.match(reSpnl);
    return true;
  }

  append(node) {
    this.block.appendChild(node);
    return node;
  }

  text(s) {
    return this.append(new Node("text", { literal: s }));
  }

  parse(block) {
    this.block = block;
    while (this.pos < this.subject.length) {
      const c = this.subject[this.pos];
      let res = false;
      switch (c) {
        case "\n":
          res = this.parseNewline();
          break;
        case "\\":
          res = this.parseBackslash();
          break;
        case "`":
          res = this.parseBackticks();
          break;
        case "*":
        case "_":
        case "~":
          res = this.handleDelim(c);
          break;
        case "[":
          res = this.parseDiff() || this.parseFootnoteRef() || this.parseOpenBracket();
          break;
        case "!":
          res = this.parseBang();
          break;
        case "]":
          res = this.parseCloseBracket();
          break;
        case "<":
          res = this.parseAutolink() || this.parseHtmlTag();
          break;
        case "&":
          res = this.parseEntity();
          break;
        case "$":
          res = this.parseMath();
          break;
        case ":":
          res = this.parseEmoji();
          break;
        case "{":
          res = this.parseDiff();
          break;
        default:
          res = this.parseString();
      }
      if (!res) {
        this.pos += 1;
        this.text(c);
      }
    }
    this.processEmphasis(null);
    return block;
  }

  parseNewline() {
    this.pos += 1;
    const last = this.block.lastChild;
    if (last && last.type === "text" && last.literal.endsWith(" ")) {
      const hard = last.literal.endsWith("  ");
      last.literal = last.literal.replace(/ +$/, "");
      this.append(new Node(hard ? "linebreak" : "softbreak"));
    } else {
      this.append(new Node("softbreak"));
    }
    this.match(/^[ \t]*/);
    return true;
  }

  parseBackslash() {
    this.pos += 1;
    const c = this.peek();
    if (c === "\n") {
      this.pos += 1;
      this.append(new Node("linebreak"));
    } else if (c !== null && reEscapable.test(c)) {
      this.text(c);
      this.pos += 1;
    } else {
      this.text("\\");
    }
    return true;
  }

  parseBackticks() {
    const ticks = this.match(/^`+/);
    const afterOpen = this.pos;
    let matched;
    while ((matched = this.match(/`+/)) !== null) {
      if (matched === ticks) {
        let contents = this.subject.slice(afterOpen, this.pos - ticks.length).replace(/\n/g, " ");
        if (/[^ ]/.test(contents) && contents[0] === " " && contents[contents.length - 1] === " ") {
          contents = contents.slice(1, -1);
        }
        this.append(new Node("code", { literal: contents }));
        return true;
      }
    }
    this.pos = afterOpen;
    this.text(ticks);
    return true;
  }

  scanDelims(cc) {
    const start = this.pos;
    let n = 0;
    while (this.subject[this.pos] === cc) {
      n += 1;
      this.pos += 1;
    }
    if (n === 0) return null;
    const before = start === 0 ? "\n" : this.subject[start - 1];
    const after = this.pos < this.subject.length ? this.subject[this.pos] : "\n";
    const afterWs = reWhitespaceChar.test(after);
    const afterPunct = rePunctuation.test(after);
    const beforeWs = reWhitespaceChar.test(before);
    const beforePunct = rePunctuation.test(before);
    const leftFlanking = !afterWs && (!afterPunct || beforeWs || beforePunct);
    const rightFlanking = !beforeWs && (!beforePunct || afterWs || afterPunct);
    let canOpen;
    let canClose;
    if (cc === "_") {
      canOpen = leftFlanking && (!rightFlanking || beforePunct);
      canClose = rightFlanking && (!leftFlanking || afterPunct);
    } else {
      canOpen = leftFlanking;
      canClose = rightFlanking;
    }
    this.pos = start;
    return { n, canOpen, canClose };
  }

  handleDelim(cc) {
    const res = this.scanDelims(cc);
    if (!res) return false;
    const start = this.pos;
    this.pos += res.n;
    const node = this.text(this.subject.slice(start, this.pos));
    this.delimiters = {
      cc,
      n: res.n,
      orig: res.n,
      node,
      previous: this.delimiters,
      next: null,
      canOpen: res.canOpen,
      canClose: res.canClose,
    };
    if (this.delimiters.previous) this.delimiters.previous.next = this.delimiters;
    return true;
  }

  removeDelimiter(delim) {
    if (delim.previous !== null) delim.previous.next = delim.next;
    if (delim.next !== null) delim.next.previous = delim.previous;
    else this.delimiters = delim.previous;
  }

  processEmphasis(stackBottom) {
    const openersBottom = { "*": [], _: [], "~": [] };
    for (const key of Object.keys(openersBottom)) {
      for (let i = 0; i < 6; i += 1) openersBottom[key].push(stackBottom);
    }

    let closer = this.delimiters;
    while (closer !== null && closer.previous !== stackBottom) closer = closer.previous;

    while (closer !== null) {
      if (!closer.canClose) {
        closer = closer.next;
        continue;
      }
      const cc = closer.cc;
      const bottomIdx = (closer.canOpen ? 3 : 0) + (closer.orig % 3);
      let opener = closer.previous;
      let found = false;
      while (opener !== null && opener !== stackBottom && opener !== openersBottom[cc][bottomIdx]) {
        const oddMatch =
          cc !== "~" &&
          (closer.canOpen || opener.canClose) &&
          closer.orig % 3 !== 0 &&
          (opener.orig + closer.orig) % 3 === 0;
        const sameCount = cc !== "~" || (opener.n === closer.n && opener.n <= 2);
        if (opener.cc === cc && opener.canOpen && !oddMatch && sameCount) {
          found = true;
          break;
        }
        opener = opener.previous;
      }
      const oldCloser = closer;

      if (found) {
        const use = cc === "~" ? closer.n : closer.n >= 2 && opener.n >= 2 ? 2 : 1;
        const openerNode = opener.node;
        const closerNode = closer.node;
        opener.n -= use;
        closer.n -= use;
        openerNode.literal = openerNode.literal.slice(0, -use);
        closerNode.literal = closerNode.literal.slice(0, -use);
        const wrap = new Node(cc === "~" ? "strike" : use === 1 ? "emph" : "strong");
        let tmp = openerNode.next;
        while (tmp && tmp !== closerNode) {
          const next = tmp.next;
          wrap.appendChild(tmp);
          tmp = next;
        }
        openerNode.insertAfter(wrap);

        // drop delimiters between opener and closer
        let d = closer.previous;
        while (d !== null && d !== opener) {
          const prev = d.previous;
          this.removeDelimiter(d);
          d = prev;
        }
        if (opener.n === 0) {
          openerNode.unlink();
          this.removeDelimiter(opener);
        }
        if (closer.n === 0) {
          closerNode.unlink();
          const next = closer.next;
          this.removeDelimiter(closer);
          closer = next;
        }
      } else {
        closer = closer.next;
        openersBottom[cc][bottomIdx] = oldCloser.previous;
        if (!oldCloser.canOpen) this.removeDelimiter(oldCloser);
      }
    }

    while (this.delimiters !== null && this.delimiters !== stackBottom) {
      this.removeDelimiter(this.delimiters);
    }
  }

  addBracket(node, index, image) {
    if (this.brackets !== null) this.brackets.bracketAfter = true;
    this.brackets = {
      node,
      previous: this.brackets,
      previousDelimiter: this.delimiters,
      index,
      image,
      active: true,
      bracketAfter: false,
    };
  }

  parseOpenBracket() {
    const start = this.pos;
    this.pos += 1;
    const node = this.text("[");
    this.addBracket(node, start, false);
    return true;
  }

  parseBang() {
    const start = this.pos;
    this.pos += 1;
    if (this.peek() === "[") {
      this.pos += 1;
      const node = this.text("![");
      this.addBracket(node, start + 1, true);
    } else {
      this.text("!");
    }
    return true;
  }

  parseCloseBracket() {
    this.pos += 1;
    const startpos = this.pos;
    const opener = this.brackets;
    if (opener === null) {
      this.text("]");
      return true;
    }
    if (!opener.active) {
      this.text("]");
      this.brackets = opener.previous;
      return true;
    }

    const isImage = opener.image;
    const savepos = this.pos;
    let matched = false;
    let dest;
    let title;

    if (this.peek() === "(") {
      this.pos += 1;
      this.spnl();
      dest = this.parseLinkDestination();
      if (dest !== null) {
        this.spnl();
        if (reWhitespaceChar.test(this.subject[this.pos - 1] ?? "")) title = this.parseLinkTitle();
        this.spnl();
        if (this.peek() === ")") {
          this.pos += 1;
          matched = true;
        }
      }
      if (!matched) this.pos = savepos;
    }

    if (!matched) {
      const beforeLabel = this.pos;
      const n = this.parseLinkLabel();
      let refLabel;
      if (n > 2) refLabel = this.subject.slice(beforeLabel, beforeLabel + n);
      else if (!opener.bracketAfter) refLabel = this.subject.slice(opener.index, startpos);
      if (n === 0) this.pos = savepos;
      if (refLabel) {
        const ref = this.state.refs.get(normalizeLabel(refLabel.slice(1, -1)));
        if (ref) {
          dest = ref.dest;
          title = ref.title;
          matched = true;
        }
      }
    }

    if (!matched) {
      this.brackets = opener.previous;
      this.pos = startpos;
      this.text("]");
      return true;
    }

    const node = new Node(isImage ? "image" : "link", { dest, title: title || "" });
    let tmp = opener.node.next;
    while (tmp) {
      const next = tmp.next;
      node.appendChild(tmp);
      tmp = next;
    }
    this.append(node);
    this.processEmphasis(opener.previousDelimiter);
    this.brackets = opener.previous;
    opener.node.unlink();

    if (isImage) {
      const attrs = /^\{([^}\n]*)\}/.exec(this.subject.slice(this.pos));
      if (attrs) {
        const size = parseImageAttrs(attrs[1]);
        if (size) {
          Object.assign(node, size);
          this.pos += attrs[0].length;
        }
      }
    } else {
      for (let b = this.brackets; b !== null; b = b.previous) {
        if (!b.image) b.active = false;
      }
    }
    return true;
  }

  parseLinkLabel() {
    const m = this.match(reLinkLabel);
    if (m === null || m.length > 1001) return 0;
    return m.length;
  }

  parseLinkDestination() {
    const braced = this.match(reLinkDestinationBraces);
    if (braced !== null) return normalizeURI(unescapeString(braced.slice(1, -1), this.state));
    if (this.peek() === "<") return null;
    const savepos = this.pos;
    let parens = 0;
    let c;
    while ((c = this.peek()) !== null) {
      if (c === "\\" && reEscapable.test(this.subject[this.pos + 1] ?? "")) {
        this.pos += 2;
      } else if (c === "(") {
        this.pos += 1;
        parens += 1;
      } else if (c === ")") {
        if (parens < 1) break;
        this.pos += 1;
        parens -= 1;
      } else if (/[\x00-\x20\x7f]/.test(c)) {
        break;
      } else {
        this.pos += 1;
      }
    }
    if (this.pos === savepos && c !== ")") return null;
    if (parens !== 0) return null;
    return normalizeURI(unescapeString(this.subject.slice(savepos, this.pos), this.state));
  }

  parseLinkTitle() {
    const title = this.match(reLinkTitle);
    if (title === null) return null;
    return unescapeString(title.slice(1, -1), this.state);
  }

  parseAutolink() {
    let m = this.match(reEmailAutolink);
    if (m) {
      const dest = m.slice(1, -1);
      const link = this.append(new Node("link", { dest: normalizeURI(`mailto:${dest}`), title: "" }));
      link.appendChild(new Node("text", { literal: dest }));
      return true;
    }
    m = this.match(reAutolink);
    if (m) {
      const dest = m.slice(1, -1);
      const link = this.append(new Node("link", { dest: normalizeURI(dest), title: "" }));
      link.appendChild(new Node("text", { literal: dest }));
      return true;
    }
    return false;
  }

  parseHtmlTag() {
    const m = this.match(reHtmlTag);
    if (m === null) return false;
    this.append(new Node("html_inline", { literal: m }));
    return true;
  }

  parseEntity() {
    const m = reEntityHere.exec(this.subject.slice(this.pos));
    if (!m) return false;
    const decoded = decodeEntity(m[0], this.state);
    if (decoded === null) return false;
    this.pos += m[0].length;
    this.text(decoded);
    return true;
  }

  parseString() {
    const m = this.match(reMain);
    if (m === null) return false;
    this.text(m);
    return true;
  }

  // GFM footnote reference: [^label], only when the definition exists.
  parseFootnoteRef() {
    const m = /^\[\^([^\]\s]+)\]/.exec(this.subject.slice(this.pos));
    if (!m) return false;
    const def = this.state.footnotes.get(normalizeLabel(m[1]));
    if (!def) return false;
    if (!def.n) {
      this.state.footnoteOrder.push(def);
      def.n = this.state.footnoteOrder.length;
      def.refCount = 0;
    }
    def.refCount += 1;
    this.append(new Node("footnote_ref", { label: m[1], n: def.n, ref: def.refCount }));
    this.pos += m[0].length;
    return true;
  }

  // GitLab inline diff: {+ added +}, [+ added +], {- removed -}, [- removed -].
  parseDiff() {
    const m = /^(?:\{([+-])(.+?)\1\}|\[([+-])(.+?)\3\])(?![([])/.exec(
      this.subject.slice(this.pos),
    );
    if (!m) return false;
    const sign = m[1] || m[3];
    const node = this.append(new Node(sign === "+" ? "ins" : "del"));
    new InlineParser((m[2] ?? m[4]).trim(), this.state).parse(node);
    this.pos += m[0].length;
    return true;
  }

  // $`a^2`$ (GitLab), $$a^2$$ and $a^2$ (GitHub).
  parseMath() {
    const rest = this.subject.slice(this.pos);
    let m = /^\$(`+)([\s\S]*?[^`])\1\$/.exec(rest);
    if (m) {
      this.append(new Node("math", { literal: m[2].trim(), display: false }));
      this.pos += m[0].length;
      return true;
    }
    m = /^\$\$(?!\$)((?:[^$\\]|\\[\s\S])+?)\$\$/.exec(rest);
    if (m) {
      this.append(new Node("math", { literal: m[1].trim(), display: true }));
      this.pos += m[0].length;
      return true;
    }
    const before = this.pos > 0 ? this.subject[this.pos - 1] : "";
    if (/[\p{L}\p{N}]/u.test(before)) return false;
    m = /^\$(?![\s$])((?:[^$\\]|\\[\s\S])*?[^\s\\])\$(?![\p{L}\p{N}])/u.exec(rest);
    if (!m) return false;
    this.append(new Node("math", { literal: m[1], display: false }));
    this.pos += m[0].length;
    return true;
  }

  parseEmoji() {
    const m = /^:([a-z0-9_+-]+):/i.exec(this.subject.slice(this.pos));
    if (!m || !Object.hasOwn(EMOJI, m[1])) return false;
    this.append(new Node("emoji", { literal: EMOJI[m[1]], name: m[1] }));
    this.pos += m[0].length;
    return true;
  }
}

function parseImageAttrs(raw) {
  const out = {};
  const re = /(width|height)\s*=\s*("([^"]*)"|'([^']*)'|[^\s"']+)/g;
  let m;
  while ((m = re.exec(raw))) {
    const value = m[3] ?? m[4] ?? m[2];
    if (/^\d+(?:\.\d+)?(?:px|%)?$|^auto$/.test(value)) out[m[1]] = value;
  }
  return Object.keys(out).length ? out : null;
}

// ---------------------------------------------------------------------------
// Extended autolinks (GFM): www., http(s):// and bare emails inside text.

const reAutoCandidate =
  /(https?:\/\/|ftp:\/\/|www\.)([^\s<]*)|([a-zA-Z0-9.+\-_]+@[a-zA-Z0-9\-_]+(?:\.[a-zA-Z0-9\-_]+)+)/gi;

function autolinkText(text) {
  const out = [];
  let last = 0;
  reAutoCandidate.lastIndex = 0;
  let m;
  while ((m = reAutoCandidate.exec(text))) {
    const at = m.index;
    let link = null;
    if (m[1]) {
      const before = at > 0 ? text[at - 1] : "";
      if (before && !/[\s*_~(]/.test(before)) continue;
      link = urlAutolink(m[1], m[2]);
    } else {
      const raw = m[3];
      if (!/[-_]$/.test(raw)) link = { text: raw, href: `mailto:${raw}` };
    }
    if (!link) continue;
    if (at > last) out.push({ type: "text", text: text.slice(last, at) });
    out.push({
      type: "link",
      href: normalizeURI(link.href),
      title: "",
      auto: true,
      children: [{ type: "text", text: link.text }],
    });
    last = at + link.text.length;
    reAutoCandidate.lastIndex = last;
  }
  if (last === 0) return null;
  if (last < text.length) out.push({ type: "text", text: text.slice(last) });
  return out;
}

function urlAutolink(prefix, rest) {
  const domain = /^[a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+)*/.exec(rest);
  if (!domain) return null;
  const segments = domain[0].split(".");
  if (prefix.toLowerCase() === "www." && segments.length < 1) return null;
  if (segments.slice(-2).some((seg) => seg.includes("_"))) return null;
  const raw = trimAutolink(prefix + rest);
  if (raw.length <= prefix.length) return null;
  const href = prefix.toLowerCase() === "www." ? `http://${raw}` : raw;
  return { text: raw, href };
}

function trimAutolink(s) {
  for (;;) {
    const last = s[s.length - 1];
    if (/[?!.,:*_~]/.test(last)) {
      s = s.slice(0, -1);
      continue;
    }
    if (last === ")") {
      const open = s.split("(").length - 1;
      const close = s.split(")").length - 1;
      if (close > open) {
        s = s.slice(0, -1);
        continue;
      }
    }
    if (last === ";") {
      const m = /&[a-zA-Z0-9]+;$/.exec(s);
      if (m) {
        s = s.slice(0, m.index);
        continue;
      }
    }
    return s;
  }
}

// ---------------------------------------------------------------------------
// Phase 2: inline parsing and GFM/GLFM block transforms, then plain objects.

function parseInlines(text, state) {
  const root = new Node("root");
  new InlineParser(text, state).parse(root);
  return plainInlines(root, false);
}

function plainInlines(parent, inLink) {
  const out = [];
  const pushText = (text) => {
    if (!text) return;
    const last = out[out.length - 1];
    if (last && last.type === "text") last.text += text;
    else out.push({ type: "text", text });
  };
  for (let n = parent.firstChild; n; n = n.next) {
    switch (n.type) {
      case "text":
        pushText(n.literal);
        break;
      case "softbreak":
      case "linebreak":
        out.push({ type: n.type });
        break;
      case "code":
        out.push({ type: "code", text: n.literal });
        break;
      case "html_inline":
        out.push({ type: "html", text: n.literal });
        break;
      case "emoji":
        out.push({ type: "emoji", text: n.literal, name: n.name });
        break;
      case "math":
        out.push({ type: "math", text: n.literal, display: n.display });
        break;
      case "footnote_ref":
        out.push({ type: "footnote_ref", label: n.label, n: n.n, ref: n.ref });
        break;
      case "link":
        out.push({ type: "link", href: n.dest, title: n.title, children: plainInlines(n, true) });
        break;
      case "image": {
        const children = plainInlines(n, true);
        const image = { type: "image", src: n.dest, title: n.title, alt: inlineText(children) };
        if (n.width) image.width = n.width;
        if (n.height) image.height = n.height;
        out.push(image);
        break;
      }
      default:
        out.push({ type: n.type, children: plainInlines(n, inLink) });
    }
  }
  if (inLink) return out;
  const linked = [];
  for (const node of out) {
    const parts = node.type === "text" ? autolinkText(node.text) : null;
    if (parts) linked.push(...parts);
    else linked.push(node);
  }
  return linked;
}

export function inlineText(nodes) {
  let s = "";
  for (const node of nodes) {
    if (node.type === "text" || node.type === "code" || node.type === "math" || node.type === "emoji") {
      s += node.text;
    } else if (node.type === "image") {
      s += node.alt;
    } else if (node.type === "softbreak" || node.type === "linebreak") {
      s += " ";
    } else if (node.children) {
      s += inlineText(node.children);
    }
  }
  return s;
}

export function slugify(text) {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\p{Pc}\- ]/gu, "")
    .replace(/ /g, "-");
}

function uniqueSlug(text, state) {
  const base = slugify(text) || "section";
  const seen = state.slugs.get(base) ?? 0;
  state.slugs.set(base, seen + 1);
  return seen ? `${base}-${seen}` : base;
}

function transformBlockquote(node) {
  const first = node.firstChild;
  if (!first || first.type !== "paragraph") return;
  const nl = first.content.indexOf("\n");
  const head = nl === -1 ? first.content : first.content.slice(0, nl);
  const m = reAlert.exec(head.trim());
  if (!m) return;
  node.alert = { kind: m[1].toLowerCase(), title: m[2].trim() };
  first.content = nl === -1 ? "" : first.content.slice(nl + 1);
  if (isBlankText(first.content)) first.unlink();
}

function transformItem(node) {
  const first = node.firstChild;
  if (!first || first.type !== "paragraph" || first.line !== node.line) return;
  const m = reTask.exec(first.content);
  if (!m) return;
  node.task = m[1] === "X" ? "x" : m[1];
  first.content = first.content.slice(m[0].length);
  if (isBlankText(first.content)) first.unlink();
}

function toPlain(node, state) {
  const base = { type: node.type, line: node.line };
  switch (node.type) {
    case "paragraph": {
      const text = node.content.trim();
      if (reToc.test(text)) {
        state.hasToc = true;
        return { type: "toc", line: node.line };
      }
      return { ...base, children: parseInlines(text, state) };
    }
    case "heading": {
      const children = parseInlines(node.content.trim(), state);
      const text = inlineText(children);
      const heading = { ...base, level: node.level, children, text, id: uniqueSlug(text, state) };
      state.headings.push({ level: heading.level, text, id: heading.id, line: node.line });
      return heading;
    }
    case "code": {
      const info = node.info || "";
      return {
        ...base,
        fenced: Boolean(node.fenced),
        info,
        lang: info.split(/[\s{]/)[0].toLowerCase(),
        text: node.text,
        closed: node.fenced ? Boolean(node.closed) : true,
      };
    }
    case "html":
      return { ...base, text: node.text };
    case "hr":
      return base;
    case "table":
      return {
        ...base,
        align: node.align,
        head: node.head.map((cell) => parseInlines(cell, state)),
        rows: node.rows.map((row) => row.map((cell) => parseInlines(cell, state))),
      };
    case "blockquote": {
      transformBlockquote(node);
      const quote = { ...base, children: plainChildren(node, state) };
      if (node.alert) quote.alert = node.alert;
      if (node.multiline) quote.multiline = true;
      return quote;
    }
    case "list":
      return {
        ...base,
        ordered: node.ordered,
        start: node.start,
        tight: node.tight,
        children: plainChildren(node, state),
      };
    case "item": {
      transformItem(node);
      const item = { ...base, children: plainChildren(node, state) };
      if (node.task) item.task = node.task;
      return item;
    }
    default:
      return { ...base, children: plainChildren(node, state) };
  }
}

function plainChildren(node, state) {
  const out = [];
  for (let child = node.firstChild; child; child = child.next) out.push(toPlain(child, state));
  return out;
}

function frontMatter(lines) {
  const m = /^(---|\+\+\+|;;;)([a-z]*)[ \t]*$/.exec(lines[0] ?? "");
  if (!m) return null;
  const close = m[1] === "---" ? /^(---|\.\.\.)[ \t]*$/ : new RegExp(`^${m[1].replace(/\+/g, "\\+")}[ \t]*$`);
  for (let i = 1; i < lines.length; i += 1) {
    if (!close.test(lines[i])) continue;
    const format = m[2] || { "---": "yaml", "+++": "toml", ";;;": "json" }[m[1]];
    return { format, text: lines.slice(1, i).join("\n"), end: i + 1 };
  }
  return null;
}

/**
 * Parse Markdown into a plain block tree.
 * Every block carries `line`, the 1-based source line where it starts.
 */
export function parseMarkdown(text, options = {}) {
  const source = String(text ?? "").replace(/\0/g, "\uFFFD");
  const lines = source.split(/\r\n|\n|\r/);
  if (lines.length && lines[lines.length - 1] === "") lines.pop();

  const state = {
    refs: new Map(),
    footnotes: new Map(),
    footnoteOrder: [],
    decode: options.decodeEntity,
    truncated: false,
    slugs: new Map(),
    headings: [],
    hasToc: false,
  };

  const blocks = [];
  let start = 0;
  const front = frontMatter(lines);
  if (front) {
    blocks.push({ type: "frontmatter", line: 1, format: front.format, text: front.text });
    start = front.end;
  }

  const doc = new Node("document", { line: start + 1 });
  new BlockParser(state, doc, lines.slice(start), start).run();
  blocks.push(...plainChildren(doc, state));

  const footnotes = [];
  for (let i = 0; i < state.footnoteOrder.length; i += 1) {
    const def = state.footnoteOrder[i];
    footnotes.push({
      type: "footnote",
      line: def.line,
      label: def.label,
      n: def.n,
      refs: def.refCount,
      children: plainChildren(def, state),
    });
  }

  return {
    blocks,
    footnotes,
    headings: state.headings,
    hasToc: state.hasToc,
    truncated: state.truncated,
  };
}

/** Index just past the section opened by the heading at `index` in `blocks`. */
export function sectionEnd(blocks, index) {
  const level = blocks[index].level;
  for (let i = index + 1; i < blocks.length; i += 1) {
    if (blocks[i].type === "heading" && blocks[i].level <= level) return i;
  }
  return blocks.length;
}
