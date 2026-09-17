import {
  nestGroups,
  groupHasTrailingComma,
  splitCommaItems,
  spaces,
  sp,
  isOpen,
  isClose,
  rewriteString,
  nodesToFormatted,
  splitStringParts,
} from "../assets/code-view.js";

const WIDTH = 88;
const INDENT = 4;

const STDLIB = new Set([
  "__future__",
  "abc",
  "argparse",
  "array",
  "ast",
  "asyncio",
  "base64",
  "binascii",
  "builtins",
  "calendar",
  "cmath",
  "codecs",
  "collections",
  "contextlib",
  "copy",
  "csv",
  "ctypes",
  "dataclasses",
  "datetime",
  "decimal",
  "difflib",
  "enum",
  "errno",
  "fnmatch",
  "fractions",
  "functools",
  "gc",
  "getpass",
  "glob",
  "gzip",
  "hashlib",
  "heapq",
  "hmac",
  "html",
  "http",
  "importlib",
  "inspect",
  "io",
  "ipaddress",
  "itertools",
  "json",
  "keyword",
  "linecache",
  "locale",
  "logging",
  "math",
  "mimetypes",
  "multiprocessing",
  "numbers",
  "operator",
  "os",
  "pathlib",
  "pickle",
  "pkgutil",
  "platform",
  "pprint",
  "queue",
  "random",
  "re",
  "reprlib",
  "secrets",
  "select",
  "selectors",
  "shlex",
  "shutil",
  "signal",
  "socket",
  "sqlite3",
  "ssl",
  "stat",
  "string",
  "struct",
  "subprocess",
  "sys",
  "tempfile",
  "textwrap",
  "threading",
  "time",
  "timeit",
  "token",
  "tokenize",
  "traceback",
  "types",
  "typing",
  "unicodedata",
  "unittest",
  "urllib",
  "uuid",
  "warnings",
  "weakref",
  "xml",
  "zipfile",
  "zoneinfo",
]);

const KEYWORDS = new Set([
  "False",
  "None",
  "True",
  "and",
  "as",
  "assert",
  "async",
  "await",
  "break",
  "class",
  "continue",
  "def",
  "del",
  "elif",
  "else",
  "except",
  "finally",
  "for",
  "from",
  "global",
  "if",
  "import",
  "in",
  "is",
  "lambda",
  "nonlocal",
  "not",
  "or",
  "pass",
  "raise",
  "return",
  "try",
  "while",
  "with",
  "yield",
]);

const COMPOUND = new Set([
  "def",
  "class",
  "if",
  "elif",
  "else",
  "for",
  "while",
  "with",
  "try",
  "except",
  "finally",
  "match",
  "case",
]);

const BINARY = new Set([
  "=",
  "==",
  "!=",
  "<=",
  ">=",
  "<",
  ">",
  "+",
  "-",
  "*",
  "/",
  "//",
  "%",
  "@",
  "**",
  "|",
  "&",
  "^",
  "<<",
  ">>",
  "+=",
  "-=",
  "*=",
  "/=",
  "//=",
  "%=",
  "@=",
  "**=",
  "|=",
  "&=",
  "^=",
  "<<=",
  ">>=",
  ":=",
  "->",
  "is",
  "in",
  "and",
  "or",
]);

const MULTI_OPS = [
  "...",
  "//=",
  "**=",
  "<<=",
  ">>=",
  ":=",
  "->",
  "//",
  "**",
  "==",
  "!=",
  "<=",
  ">=",
  "+=",
  "-=",
  "*=",
  "/=",
  "%=",
  "@=",
  "|=",
  "&=",
  "^=",
  "<<",
  ">>",
];

export function viewPython(text) {
  const parsed = parsePython(text);
  const nodes = formatModule(parsed.body, parsed.truncated);
  return {
    nodes,
    formatted: nodesToFormatted(nodes),
    truncated: parsed.truncated,
  };
}

export function formatPython(text) {
  return viewPython(text).formatted;
}

export function parsePython(text) {
  const lexer = new Lexer(String(text ?? ""));
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens, lexer.truncated);
  return parser.parseModule();
}

export function tokenizePython(text) {
  return new Lexer(String(text ?? "")).tokenize();
}

class Lexer {
  constructor(text) {
    this.text = text;
    this.n = text.length;
    this.i = 0;
    this.line = 1;
    this.indent = 0;
    this.atLineStart = true;
    this.lineHasCode = false;
    this.paren = 0;
    this.truncated = false;
    this.tokens = [];
  }

  tokenize() {
    while (this.i < this.n) this.step();
    this.tokens.push(this.make("end", ""));
    return this.tokens;
  }

  peek(n = 0) {
    return this.text[this.i + n];
  }

  advance() {
    const c = this.text[this.i];
    this.i += 1;
    if (c === "\n") {
      this.line += 1;
    }
    return c;
  }

  make(type, value, extra = {}) {
    return { type, value, indent: this.indent, line: this.line, ...extra };
  }

  emit(token) {
    this.tokens.push(token);
    if (token.type !== "nl" && token.type !== "comment") this.lineHasCode = true;
  }

  lastCode() {
    for (let i = this.tokens.length - 1; i >= 0; i -= 1) {
      const t = this.tokens[i];
      if (t.type !== "nl" && t.type !== "comment") return t;
    }
    return null;
  }

  step() {
    const c = this.peek();
    if (c === " " || c === "\t") {
      if (this.atLineStart && this.paren === 0) this.indent += c === "\t" ? INDENT : 1;
      this.advance();
      return;
    }

    if (c === "\\" && (this.peek(1) === "\n" || (this.peek(1) === "\r" && this.peek(2) === "\n"))) {
      this.advance();
      if (this.peek() === "\r") this.advance();
      if (this.peek() === "\n") this.advance();
      this.atLineStart = false;
      return;
    }

    if (c === "\r") {
      this.advance();
      return;
    }

    if (c === "\n") {
      this.advance();
      if (this.paren === 0) this.emit(this.make("nl", "\n"));
      this.atLineStart = true;
      this.lineHasCode = false;
      this.indent = 0;
      return;
    }

    this.atLineStart = false;
    if (c === "#") {
      this.readComment();
      return;
    }

    const prefix = this.stringPrefix() || "";
    if (prefix || isQuote(c)) {
      this.readString(prefix);
      return;
    }

    if (isDigit(c) || (c === "." && isDigit(this.peek(1)))) {
      this.readNumber();
      return;
    }

    if (isIdStart(c)) {
      this.readName();
      return;
    }

    this.readOp();
  }

  stringPrefix() {
    const two = this.text.slice(this.i, this.i + 2);
    const twoL = two.toLowerCase();
    if (["rf", "fr", "rb", "br"].includes(twoL) && isQuote(this.peek(2))) return two;
    const one = this.peek();
    if (one && "rfuRbFuB".includes(one) && isQuote(this.peek(1))) return one;
    return null;
  }

  readComment() {
    const start = this.i;
    while (this.i < this.n && this.peek() !== "\n") this.advance();
    this.emit(this.make("comment", this.text.slice(start, this.i).trimEnd(), { inline: this.lineHasCode }));
  }

  readString(prefix) {
    for (let i = 0; i < prefix.length; i += 1) this.advance();
    const q = this.peek();
    const triple = this.peek(1) === q && this.peek(2) === q;
    const quote = triple ? q + q + q : q;
    for (let i = 0; i < quote.length; i += 1) this.advance();
    const start = this.i;
    while (this.i < this.n) {
      const c = this.peek();
      if (c === "\\") {
        this.advance();
        if (this.i < this.n) this.advance();
        continue;
      }
      if (triple) {
        if (c === q && this.peek(1) === q && this.peek(2) === q) break;
        this.advance();
        continue;
      }
      if (c === "\n") break;
      if (c === q) break;
      this.advance();
    }
    const value = this.text.slice(start, this.i);
    let closed = false;
    if (triple && this.peek() === q && this.peek(1) === q && this.peek(2) === q) {
      closed = true;
      this.advance();
      this.advance();
      this.advance();
    } else if (!triple && this.peek() === q) {
      closed = true;
      this.advance();
    }
    if (!closed) this.truncated = true;
    this.emit(this.make("string", value, { prefix, quote }));
  }

  readNumber() {
    const start = this.i;
    if (this.peek() === "0" && "xXoObB".includes(this.peek(1))) {
      this.advance();
      this.advance();
      while (this.i < this.n && /[0-9a-fA-F_]/.test(this.peek())) this.advance();
    } else {
      while (this.i < this.n && /[0-9_]/.test(this.peek())) this.advance();
      if (this.peek() === "." && isDigit(this.peek(1))) {
        this.advance();
        while (this.i < this.n && /[0-9_]/.test(this.peek())) this.advance();
      } else if (this.peek() === "." && !isIdStart(this.peek(1)) && this.peek(1) !== ".") {
        this.advance();
      }
      if (this.peek() === "e" || this.peek() === "E") {
        this.advance();
        if (this.peek() === "+" || this.peek() === "-") this.advance();
        while (this.i < this.n && /[0-9_]/.test(this.peek())) this.advance();
      }
    }
    if (this.peek() === "j" || this.peek() === "J") this.advance();
    this.emit(this.make("number", this.text.slice(start, this.i)));
  }

  readName() {
    const start = this.i;
    this.advance();
    while (this.i < this.n && isIdCont(this.peek())) this.advance();
    const value = this.text.slice(start, this.i);
    let type = "name";
    if (KEYWORDS.has(value)) {
      if (value === "True" || value === "False") type = "bool";
      else if (value === "None") type = "null";
      else type = "keyword";
    }
    const prev = this.lastCode();
    if (prev && prev.type === "keyword" && (prev.value === "def" || prev.value === "class")) {
      type = "defname";
    }
    this.emit(this.make(type, value));
  }

  readOp() {
    for (const op of MULTI_OPS) {
      if (this.text.startsWith(op, this.i)) {
        for (let i = 0; i < op.length; i += 1) this.advance();
        this.bumpParen(op);
        this.emit(this.make("op", op));
        return;
      }
    }
    const c = this.peek();
    this.advance();
    this.bumpParen(c);
    if (c == null) {
      this.truncated = true;
      return;
    }
    const type = c === "@" && !this.lineHasCode ? "punct" : "op";
    this.emit(this.make(type, c));
  }

  bumpParen(op) {
    if (op === "(" || op === "[" || op === "{") this.paren += 1;
    else if (op === ")" || op === "]" || op === "}") this.paren = Math.max(0, this.paren - 1);
  }
}

class Parser {
  constructor(tokens, truncated) {
    this.tokens = tokens;
    this.i = 0;
    this.truncated = truncated;
  }

  parseModule() {
    return { type: "module", body: this.parseStmts(0, true), truncated: this.truncated };
  }

  peek(n = 0) {
    return this.tokens[Math.min(this.i + n, this.tokens.length - 1)];
  }

  eat() {
    const t = this.peek();
    if (t.type !== "end") this.i += 1;
    return t;
  }

  skipNl() {
    while (this.peek().type === "nl") this.eat();
  }

  parseStmts(indent, top) {
    const stmts = [];
    while (this.peek().type !== "end") {
      this.skipNl();
      const t = this.peek();
      if (t.type === "end") break;
      if (!top && t.indent < indent) break;
      stmts.push(this.parseStmt(top ? t.indent : indent));
    }
    return stmts;
  }

  parseStmt(indent) {
    const leading = [];
    while (this.peek().type === "comment" && !this.peek().inline) {
      if (this.peek().indent < indent) break;
      leading.push(this.eat());
      this.skipNl();
    }
    this.skipNl();
    const start = this.peek();
    if (start.type === "end") {
      this.truncated = true;
      return { type: "comment", token: { type: "comment", value: "#", indent }, leading };
    }
    if (start.type === "comment") {
      const token = this.eat();
      return { type: "comment", token, leading, indent: token.indent };
    }
    if (start.value === "@") return this.parseDecorated(indent, leading);
    if (this.isCompoundStart()) return this.parseCompound(indent, leading);
    return this.parseSimple(indent, leading);
  }

  isCompoundStart() {
    const t = this.peek();
    if (t.type === "keyword" && COMPOUND.has(t.value)) return true;
    if (t.value === "match" || t.value === "case") return true;
    if (t.value === "async") {
      const n = this.peek(1);
      return Boolean(n && (n.value === "def" || n.value === "for" || n.value === "with"));
    }
    return false;
  }

  parseDecorated(indent, leading) {
    const decorators = [];
    while (this.peek().value === "@") {
      decorators.push(this.parseSimple(indent, []));
      this.skipNl();
    }
    if (!this.isCompoundStart()) {
      this.truncated = true;
      return { type: "simple", tokens: [], leading, decorators, indent };
    }
    const stmt = this.parseCompound(indent, leading);
    stmt.decorators = decorators;
    return stmt;
  }

  parseSimple(indent, leading) {
    const tokens = [];
    while (this.peek().type !== "end" && this.peek().type !== "nl") {
      tokens.push(this.eat());
    }
    if (this.peek().type === "nl") this.eat();
    return { type: "simple", tokens, leading, indent };
  }

  parseCompound(indent, leading) {
    const header = [];
    let paren = 0;
    let sawColon = false;
    while (this.peek().type !== "end" && this.peek().type !== "nl") {
      const t = this.peek();
      if (t.value === "(" || t.value === "[" || t.value === "{") paren += 1;
      if (t.value === ")" || t.value === "]" || t.value === "}") paren = Math.max(0, paren - 1);
      header.push(this.eat());
      if (paren === 0 && t.value === ":") {
        sawColon = true;
        break;
      }
    }

    let oneLine = false;
    let body = [];
    if (!sawColon) {
      this.truncated = true;
      if (this.peek().type === "nl") this.eat();
      return { type: "compound", header, body, leading, indent, truncated: true, oneLine };
    }

    if (this.peek().type !== "nl" && this.peek().type !== "end") {
      oneLine = true;
      body = [this.parseSimple(indent, [])];
    } else {
      this.skipNl();
      const next = this.peek();
      if (next.type === "end" || (next.type !== "comment" && next.indent <= indent)) {
        this.truncated = true;
        return { type: "compound", header, body, leading, indent, truncated: true, oneLine };
      }
      const bodyIndent = next.indent;
      body = this.parseStmts(bodyIndent, false);
    }
    return { type: "compound", header, body, leading, indent, oneLine, truncated: false };
  }
}

function formatModule(body, truncated) {
  body = sortPythonImports(body);
  const nodes = [];
  let prev = null;
  for (const stmt of body) {
    const blanks = blankLinesBefore(prev, stmt, true);
    for (let i = 0; i < blanks; i += 1) nodes.push({ type: "line", tokens: [] });
    nodes.push(...formatStmt(stmt, 0));
    prev = stmt;
  }
  if (truncated && nodes.length) nodes[nodes.length - 1].truncated = true;
  else if (truncated) nodes.push({ type: "line", tokens: [], truncated: true });
  return nodes;
}

function formatStmt(stmt, indent) {
  const nodes = [];
  for (const comment of stmt.leading || []) {
    nodes.push(commentLine(comment, indent));
  }
  for (const deco of stmt.decorators || []) {
    nodes.push(...formatStmt(deco, indent));
  }
  if (stmt.type === "comment") {
    nodes.push(commentLine(stmt.token, indent));
    return nodes;
  }
  if (stmt.type === "simple") {
    nodes.push(...formatSimple(stmt.tokens, indent));
    return nodes;
  }

  const headerLines = printTokens(stmt.header, indent);
  const fold = isFoldable(stmt);

  if (stmt.oneLine && stmt.body.length === 1 && stmt.body[0].type === "simple" && !fold) {
    const bodyLines = printTokens(stmt.body[0].tokens, 0);
    if (headerLines.length === 1 && bodyLines.length === 1) {
      const combined = [...headerLines[0], sp(), ...stripIndent(bodyLines[0])];
      if (tokensLen(combined) <= WIDTH) {
        nodes.push({ type: "line", tokens: combined });
        return nodes;
      }
    }
  }

  const children = [];
  let prev = null;
  const childIndent = indent + INDENT;
  for (const child of stmt.body) {
    const blanks = blankLinesBefore(prev, child, false);
    for (let i = 0; i < blanks; i += 1) children.push({ type: "line", tokens: [] });
    children.push(...formatStmt(child, childIndent));
    prev = child;
  }
  if (!stmt.body.length) {
    children.push({
      type: "line",
      tokens: [...spaces(childIndent), { type: "keyword", value: "pass" }],
    });
  }

  if (fold) {
    const header = headerLines[0] || spaces(indent);
    for (let i = 1; i < headerLines.length; i += 1) children.unshift({ type: "line", tokens: headerLines[i] });
    nodes.push({ type: "block", header, children, truncated: stmt.truncated });
    return nodes;
  }

  for (const line of headerLines) nodes.push({ type: "line", tokens: line });
  nodes.push(...children);
  return nodes;
}

function formatSimple(tokens, indent) {
  return printTokens(tokens, indent).map((line) => ({ type: "line", tokens: line }));
}

function commentLine(token, indent) {
  const text = String(token.value || "").replace(/^#\s?/, "");
  return {
    type: "line",
    tokens: [...spaces(indent), { type: "comment", value: text ? `# ${text}` : "#" }],
  };
}

function printTokens(tokens, indent) {
  const rewritten = (tokens || []).map((t) => rewriteString(t, "double"));
  const tree = nestGroups(rewritten.filter((t) => t.type !== "nl"));
  const out = printSeq(tree.items, indent, indent, null);
  return splitPrinted(out, indent);
}

function printSeq(items, indent, col, parent) {
  const out = [];
  let prev = parent?.open || null;
  let argAnn = false;
  const ctx = { parent, argAnn: () => argAnn };
  for (const item of items) {
    if (item.kind === "group") {
      const groupToks = printGroup(item, indent, col + tokensLen(out), ctx);
      joinToken(out, prev, firstAtom(groupToks), ctx);
      out.push(...groupToks);
      prev = lastAtom(groupToks);
      continue;
    }
    if (item.type === "comment") {
      if (prev) out.push({ type: "space", value: "  " });
      out.push(formatComment(item));
      prev = item;
      continue;
    }
    if (item.value === ",") argAnn = false;
    if (item.value === ":") argAnn = true;
    if (item.type === "string") {
      const colNow = col + tokensLen(out) + (prev && spaceBetween(prev, item, { ...ctx, argAnn }) ? 1 : 0);
      const wrapped = wrapPythonString(item, indent, colNow, parent) || expandPythonTriple(item, indent);
      if (wrapped) {
        joinToken(out, prev, firstAtom(wrapped), { ...ctx, argAnn });
        out.push(...wrapped);
        prev = lastAtom(wrapped);
        continue;
      }
    }
    joinToken(out, prev, item, { ...ctx, argAnn });
    out.push(item);
    prev = item;
  }
  return out;
}

function printGroup(group, indent, col, ctx) {
  const innerIndent = indent + INDENT;
  const compactInner = printSeq(group.items, innerIndent, col + 1, group);
  const close = group.close || { type: "op", value: closerFor(group.open.value) };
  const compact = [group.open, ...compactInner, close];
  const magic = groupHasTrailingComma(group);
  const tooLong = col + tokensLen(compact) > WIDTH;
  const hasComment = group.items.some((item) => item.type === "comment");
  if (!magic && !tooLong && !hasComment && !group.truncated) return compact;

  const chunks = splitCommaItems(group.items);
  const exploded = [group.open, { type: "nl", value: "\n" }];
  if (!chunks.length) {
    exploded.push(...spaces(indent), close);
    return exploded;
  }
  for (let i = 0; i < chunks.length; i += 1) {
    const chunk = chunks[i];
    if (!chunk.items.length && !chunk.comma) continue;
    const piece = printSeq(chunk.items, innerIndent, innerIndent, group);
    exploded.push(...spaces(innerIndent), ...piece, { type: "op", value: "," }, { type: "nl", value: "\n" });
  }
  exploded.push(...spaces(indent), close);
  if (group.truncated) exploded.push({ type: "nl", value: "\n" });
  return exploded;
}

function joinToken(out, prev, next, ctx) {
  if (!prev || !next) return;
  if (spaceBetween(prev, next, ctx)) out.push(sp());
}

function spaceBetween(a, b, ctx = {}) {
  const av = a.value;
  const bv = b.value;
  if (a.type === "comment" || b.type === "comment") return true;
  if (isClose(b) || bv === "," || bv === ";" || bv === ".") return false;
  if (isOpen(a) || av === ".") return false;
  if (bv === ":") return false;
  if (av === ":") return ctx.parent?.open?.value !== "[";
  if (av === "@") return a.type !== "punct";
  if (bv === "@") return b.type !== "punct";
  if ((bv === "*" || bv === "**") && (isOpen(a) || av === ",")) return false;
  if ((av === "*" || av === "**") && b.type === "name") return false;
  if (bv === "=" || av === "=") {
    if (ctx.parent?.open?.value === "(") return Boolean(ctx.argAnn);
    return true;
  }
  if (bv === "(") {
    if (a.type === "keyword") {
      return av !== "lambda";
    }
    if (a.type === "name" || a.type === "defname" || isClose(a) || a.type === "string" || a.type === "number") {
      return false;
    }
    return true;
  }
  if (bv === "[") {
    if (a.type === "name" || a.type === "defname" || isClose(a) || a.type === "string" || a.type === "number") {
      return false;
    }
    return true;
  }
  if (bv === "{") return true;
  if (av === ",") return true;
  if (BINARY.has(av) || BINARY.has(bv)) return true;
  if (a.type === "keyword" || b.type === "keyword") return true;
  if (a.type === "bool" || b.type === "bool" || a.type === "null" || b.type === "null") return true;
  if (a.type === "name" && b.type === "name") return true;
  if (a.type === "defname" && b.type === "keyword") return true;
  return false;
}

function formatComment(token) {
  const text = String(token.value || "").replace(/^#\s?/, "");
  return { type: "comment", value: text ? `# ${text}` : "#" };
}

function splitPrinted(tokens, indent) {
  const lines = [];
  let current = [...spaces(indent)];
  for (const token of tokens) {
    if (token.type === "nl") {
      lines.push(current);
      current = [];
      continue;
    }
    current.push(token);
  }
  lines.push(current);
  while (lines.length > 1 && !lines[lines.length - 1].length) lines.pop();
  return lines;
}

function stripIndent(tokens) {
  let i = 0;
  while (i < tokens.length && tokens[i].type === "space") i += 1;
  return tokens.slice(i);
}

function tokensLen(tokens) {
  return tokens.reduce((n, t) => n + (t.type === "string" ? (t.prefix || "").length + t.quote.length * 2 + t.value.length : t.value.length), 0);
}

function firstAtom(tokens) {
  return tokens.find((t) => t.type !== "space" && t.type !== "nl") || null;
}

function lastAtom(tokens) {
  for (let i = tokens.length - 1; i >= 0; i -= 1) {
    const t = tokens[i];
    if (t.type !== "space" && t.type !== "nl") return t;
  }
  return null;
}

function closerFor(open) {
  return open === "(" ? ")" : open === "[" ? "]" : "}";
}

function blankLinesBefore(prev, stmt, top) {
  if (!prev) return 0;
  if (stmt.type === "comment" || prev.type === "comment") return 0;
  if (top) {
    if (prev.importSection != null && stmt.importSection != null) {
      return prev.importSection === stmt.importSection ? 0 : 1;
    }
    if (isDefLike(stmt) || isDefLike(prev)) return 2;
    if (prev.importSection != null && stmt.importSection == null) return 1;
    if (isDocstring(prev)) return 1;
    return 0;
  }
  if (isDefLike(stmt) || isDefLike(prev)) return 1;
  if (isDocstring(prev)) return 1;
  return 0;
}

function isDefLike(stmt) {
  if (!stmt || stmt.type !== "compound") return false;
  const key = compoundKeyword(stmt);
  return key === "def" || key === "class" || key === "async";
}

function isDocstring(stmt) {
  if (!stmt || stmt.type !== "simple") return false;
  const code = (stmt.tokens || []).filter((t) => t.type !== "comment" && t.type !== "nl");
  return code.length === 1 && code[0].type === "string";
}

function isFoldable(stmt) {
  return isDefLike(stmt);
}

function compoundKeyword(stmt) {
  for (const token of stmt.header || []) {
    if (token.type === "keyword" || token.value === "match" || token.value === "case") return token.value;
  }
  return "";
}

function expandPythonTriple(token, indent) {
  if ((token.quote || "").length <= 1) return null;
  const raw = String(token.value);
  if (!raw.includes("\n")) return null;
  const closeAlone = /\n[ \t]*$/.test(raw);
  const lines = cleanDocstringLines(raw);
  const out = [{ ...token, value: lines[0] || "", side: "open" }];
  for (let i = 1; i < lines.length; i += 1) {
    out.push({ type: "nl", value: "\n" });
    if (lines[i]) out.push(...spaces(indent), { type: "string", value: lines[i], quote: "", prefix: "" });
  }
  if (closeAlone) {
    out.push({ type: "nl", value: "\n" }, ...spaces(indent), { ...token, value: "", side: "close" });
  } else {
    out.push({ ...token, value: "", side: "close" });
  }
  return out;
}

function cleanDocstringLines(value) {
  const lines = String(value).replace(/\t/g, "    ").split("\n");
  if (lines.length) lines[0] = lines[0].replace(/^[ \t]+/, "");
  let margin = Infinity;
  for (let i = 1; i < lines.length; i += 1) {
    const stripped = lines[i].replace(/^[ \t]+/, "");
    if (stripped) margin = Math.min(margin, lines[i].length - stripped.length);
  }
  if (margin !== Infinity) {
    for (let i = 1; i < lines.length; i += 1) lines[i] = lines[i].slice(margin);
  }
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  while (lines.length && !lines[0].trim()) lines.shift();
  return lines.map((line) => line.replace(/[ \t]+$/, ""));
}

function wrapPythonString(token, indent, col, parent) {
  if (parent) return null;
  const prefix = (token.prefix || "").toLowerCase();
  if ((token.quote || "").length > 1) return null;
  if (prefix.includes("f") || prefix.includes("b")) return null;
  const quote = token.quote || '"';
  const overhead = (token.prefix || "").length + quote.length * 2;
  const firstBudget = WIDTH - col - overhead;
  const nextBudget = WIDTH - (indent + INDENT) - overhead;
  const parts = splitStringParts(token.value, firstBudget, nextBudget);
  if (!parts) return null;
  const strings = parts.map((value, i) => ({
    ...token,
    value,
    prefix: i === 0 ? token.prefix || "" : token.prefix || "",
  }));
  const inParen = parent?.open?.value === "(";
  const out = [];
  if (!inParen) {
    out.push({ type: "op", value: "(" }, { type: "nl", value: "\n" }, ...spaces(indent + INDENT));
  } else {
    out.push({ type: "nl", value: "\n" }, ...spaces(indent + INDENT));
  }
  strings.forEach((str, i) => {
    if (i) out.push({ type: "nl", value: "\n" }, ...spaces(indent + INDENT));
    out.push(str);
  });
  if (!inParen) out.push({ type: "nl", value: "\n" }, ...spaces(indent), { type: "op", value: ")" });
  return out;
}

function sortPythonImports(body) {
  let i = 0;
  while (i < body.length && body[i].type === "comment") i += 1;
  const start = i;
  while (i < body.length && isImportStmt(body[i])) i += 1;
  if (i === start) return body;
  const parsed = [];
  for (const stmt of body.slice(start, i)) {
    const item = parseImportStmt(stmt);
    if (!item) return body;
    parsed.push(item);
  }
  const split = parsed.flatMap(splitImportItem);
  split.sort(comparePythonImport);
  return [...body.slice(0, start), ...split.map(importItemToStmt), ...body.slice(i)];
}

function isImportStmt(stmt) {
  if (stmt.type !== "simple") return false;
  const t = (stmt.tokens || []).find((tok) => tok.type !== "comment");
  return Boolean(t && (t.value === "import" || t.value === "from"));
}

function parseImportStmt(stmt) {
  const tokens = (stmt.tokens || []).filter((t) => t.type !== "comment" && t.type !== "nl");
  if (!tokens.length) return null;
  if (tokens[0].value === "import") {
    const parts = splitTokenComma(tokens.slice(1));
    return { kind: "import", names: parts.map(parseImportedName), leading: stmt.leading };
  }
  if (tokens[0].value === "from") {
    let i = 1;
    let module = "";
    while (i < tokens.length && tokens[i].value !== "import") {
      module += tokens[i].value;
      i += 1;
    }
    i += 1;
    if (tokens[i]?.value === "(") i += 1;
    const inner = tokens.slice(i).filter((t) => t.value !== ")");
    const parts = splitTokenComma(inner).filter((p) => p.length);
    return { kind: "from", module, names: parts.map(parseImportedName), leading: stmt.leading };
  }
  return null;
}

function splitTokenComma(tokens) {
  const parts = [];
  let current = [];
  for (const token of tokens) {
    if (token.value === ",") {
      if (current.length) parts.push(current);
      current = [];
      continue;
    }
    current.push(token);
  }
  if (current.length) parts.push(current);
  return parts;
}

function parseImportedName(tokens) {
  const aliasAt = tokens.findIndex((t) => t.value === "as");
  if (aliasAt >= 0) {
    return { code: tokens.slice(0, aliasAt), alias: tokens[aliasAt + 1] || null };
  }
  return { code: tokens, alias: null };
}

function importedNameKey(name) {
  return name.code.map((t) => t.value).join("");
}

function splitImportItem(item) {
  if (item.kind !== "import" || item.names.length <= 1) {
    item.section = pythonImportSection(item);
    return [item];
  }
  return item.names.map((name, i) => {
    const next = { kind: "import", names: [name], leading: i === 0 ? item.leading : [] };
    next.section = pythonImportSection(next);
    return next;
  });
}

function pythonImportSection(item) {
  const mod = item.kind === "from" ? item.module : importedNameKey(item.names[0]);
  if (mod.startsWith(".")) return 3;
  const top = mod.replace(/^\.+/, "").split(".")[0];
  if (top === "__future__") return 0;
  if (STDLIB.has(top)) return 1;
  return 2;
}

function comparePythonImport(a, b) {
  if (a.section !== b.section) return a.section - b.section;
  const am = a.kind === "from" ? a.module : importedNameKey(a.names[0]);
  const bm = b.kind === "from" ? b.module : importedNameKey(b.names[0]);
  const byMod = am.localeCompare(bm);
  if (byMod) return byMod;
  if (a.kind !== b.kind) return a.kind === "import" ? -1 : 1;
  return importedNameKey(a.names[0]).localeCompare(importedNameKey(b.names[0]));
}

function importItemToStmt(item) {
  item.names.sort((a, b) => importedNameKey(a).localeCompare(importedNameKey(b)));
  const tokens = item.kind === "import" ? tokensForImport(item) : tokensForFromImport(item);
  return { type: "simple", tokens, leading: item.leading, indent: 0, importSection: item.section };
}

function tokensForImportedName(name) {
  const out = [...name.code];
  if (name.alias) out.push({ type: "keyword", value: "as" }, name.alias);
  return out;
}

function tokensForImport(item) {
  const tokens = [{ type: "keyword", value: "import" }];
  item.names.forEach((name, i) => {
    if (i) tokens.push({ type: "op", value: "," });
    tokens.push(...tokensForImportedName(name));
  });
  return tokens;
}

function tokensForFromImport(item) {
  const tokens = [{ type: "keyword", value: "from" }, ...dottedTokens(item.module), { type: "keyword", value: "import" }];
  const names = [];
  item.names.forEach((name, i) => {
    if (i) names.push({ type: "op", value: "," });
    names.push(...tokensForImportedName(name));
  });
  const compact = [...tokens, ...names];
  if (tokensLen(compact) <= WIDTH) return compact;
  return [...tokens, { type: "op", value: "(" }, ...names, { type: "op", value: "," }, { type: "op", value: ")" }];
}

function dottedTokens(module) {
  const tokens = [];
  for (const part of module.split(/(\.)/)) {
    if (!part) continue;
    tokens.push({ type: part === "." ? "op" : "name", value: part });
  }
  return tokens;
}

function isDigit(c) {
  return c >= "0" && c <= "9";
}

function isQuote(c) {
  return c === "'" || c === '"';
}

function isIdStart(c) {
  return c === "_" || (c >= "A" && c <= "Z") || (c >= "a" && c <= "z");
}

function isIdCont(c) {
  return isIdStart(c) || isDigit(c);
}
