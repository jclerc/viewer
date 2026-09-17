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

const WIDTH = 100;
const INDENT = 2;

const NODE_BUILTINS = new Set([
  "assert",
  "buffer",
  "child_process",
  "cluster",
  "crypto",
  "dgram",
  "dns",
  "events",
  "fs",
  "http",
  "http2",
  "https",
  "module",
  "net",
  "os",
  "path",
  "perf_hooks",
  "process",
  "punycode",
  "querystring",
  "readline",
  "stream",
  "string_decoder",
  "timers",
  "tls",
  "tty",
  "url",
  "util",
  "v8",
  "vm",
  "worker_threads",
  "zlib",
]);

const KEYWORDS = new Set([
  "break",
  "case",
  "catch",
  "class",
  "const",
  "continue",
  "debugger",
  "default",
  "delete",
  "do",
  "else",
  "export",
  "extends",
  "finally",
  "for",
  "function",
  "if",
  "import",
  "in",
  "instanceof",
  "let",
  "new",
  "return",
  "super",
  "switch",
  "this",
  "throw",
  "try",
  "typeof",
  "var",
  "void",
  "while",
  "with",
  "yield",
  "enum",
  "await",
  "async",
  "static",
]);

const BINARY = new Set([
  "=",
  "==",
  "===",
  "!=",
  "!==",
  "<=",
  ">=",
  "<",
  ">",
  "+",
  "-",
  "*",
  "/",
  "%",
  "**",
  "|",
  "&",
  "^",
  "<<",
  ">>",
  ">>>",
  "+=",
  "-=",
  "*=",
  "/=",
  "%=",
  "**=",
  "|=",
  "&=",
  "^=",
  "<<=",
  ">>=",
  ">>>=",
  "&&",
  "||",
  "??",
  "&&=",
  "||=",
  "??=",
  "=>",
  "in",
  "instanceof",
  "?",
  ":",
]);

const MULTI_OPS = [
  ">>>=",
  "===",
  "!==",
  ">>>",
  "<<=",
  ">>=",
  "**=",
  "&&=",
  "||=",
  "??=",
  "...",
  "=>",
  "?.",
  "??",
  "==",
  "!=",
  "<=",
  ">=",
  "&&",
  "||",
  "++",
  "--",
  "<<",
  ">>",
  "+=",
  "-=",
  "*=",
  "/=",
  "%=",
  "&=",
  "|=",
  "^=",
  "**",
];

const REGEX_PREV = new Set([
  "return",
  "throw",
  "case",
  "else",
  "do",
  "in",
  "of",
  "typeof",
  "instanceof",
  "void",
  "delete",
  "new",
  "await",
  "yield",
  "extends",
]);

export function viewJavaScript(text) {
  const parsed = parseJavaScript(text);
  const nodes = formatModule(parsed.body, parsed.truncated);
  return {
    nodes,
    formatted: nodesToFormatted(nodes),
    truncated: parsed.truncated,
  };
}

export function formatJavaScript(text) {
  return viewJavaScript(text).formatted;
}

export function parseJavaScript(text) {
  const lexer = new Lexer(String(text ?? ""));
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens, lexer.truncated);
  return parser.parseModule();
}

export function tokenizeJavaScript(text) {
  return new Lexer(String(text ?? "")).tokenize();
}

class Lexer {
  constructor(text) {
    this.text = text;
    this.n = text.length;
    this.i = 0;
    this.line = 1;
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
    if (c === "\n") this.line += 1;
    return c;
  }

  make(type, value, extra = {}) {
    return { type, value, line: this.line, ...extra };
  }

  emit(token) {
    this.tokens.push(token);
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
      this.advance();
      return;
    }
    if (c === "\r") {
      this.advance();
      return;
    }
    if (c === "\n") {
      this.advance();
      this.emit(this.make("nl", "\n"));
      return;
    }
    if (c === "/" && this.peek(1) === "/") {
      this.readLineComment();
      return;
    }
    if (c === "/" && this.peek(1) === "*") {
      this.readBlockComment();
      return;
    }
    if (c === "/" && this.canBeRegex()) {
      this.readRegex();
      return;
    }
    if (c === "<" && this.canBeJsx()) {
      this.emit(this.readJsxElement());
      return;
    }
    if (c === "`") {
      this.readTemplate();
      return;
    }
    if (c === "'" || c === '"') {
      this.readString(c);
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

  canBeJsx() {
    const next = this.peek(1);
    if (next === ">" || next === "/") return this.jsxContext();
    if (!next || !isIdStart(next)) return false;
    return this.jsxContext();
  }

  jsxContext() {
    const prev = this.lastCode();
    if (!prev) return true;
    if (prev.type === "keyword") {
      return ["return", "throw", "case", "default", "else", "typeof", "void", "yield", "await", "new", "delete"].includes(
        prev.value,
      );
    }
    if (prev.type === "op") {
      return ["(", "{", "[", ",", "=", "=>", "?", ":", "&&", "||", "??", ";", "!"].includes(prev.value);
    }
    return false;
  }

  skipJsxSpace() {
    while (this.i < this.n && /\s/.test(this.peek())) this.advance();
  }

  readJsxName() {
    if (this.peek() === ">" || this.peek() === "/") return "";
    const start = this.i;
    if (!isIdStart(this.peek())) return "";
    this.advance();
    while (this.i < this.n && (isIdCont(this.peek()) || this.peek() === "." || this.peek() === "-")) this.advance();
    return this.text.slice(start, this.i);
  }

  readJsxElement() {
    this.advance();
    const closing = this.peek() === "/";
    if (closing) this.advance();
    const name = this.readJsxName();
    if (closing) {
      this.skipJsxSpace();
      if (this.peek() === ">") this.advance();
      return this.make("jsx-el", name, { name, attrs: [], selfClosing: false, children: [], closing: true });
    }
    const attrs = [];
    while (this.i < this.n) {
      this.skipJsxSpace();
      if (this.peek() === "/" && this.peek(1) === ">") {
        this.advance();
        this.advance();
        return this.make("jsx-el", name, { name, attrs, selfClosing: true, children: [] });
      }
      if (this.peek() === ">") {
        this.advance();
        break;
      }
      if (this.peek() === "{") {
        attrs.push({ spread: true, tokens: this.readJsxBraced() });
        continue;
      }
      const attr = this.readJsxAttr();
      if (!attr) break;
      attrs.push(attr);
    }
    const children = [];
    while (this.i < this.n) {
      this.skipJsxSpace();
      if (this.peek() === "<" && this.peek(1) === "/") {
        this.advance();
        this.advance();
        this.readJsxName();
        this.skipJsxSpace();
        if (this.peek() === ">") this.advance();
        break;
      }
      if (this.peek() === "<") {
        children.push(this.readJsxElement());
        continue;
      }
      if (this.peek() === "{") {
        children.push({ type: "jsx-expr", tokens: this.readJsxBraced() });
        continue;
      }
      const text = this.readJsxText();
      if (text) children.push(text);
      else break;
    }
    return this.make("jsx-el", name, { name, attrs, selfClosing: false, children });
  }

  readJsxAttr() {
    const name = this.readJsxName();
    if (!name) return null;
    this.skipJsxSpace();
    if (this.peek() !== "=") return { name, tokens: null };
    this.advance();
    this.skipJsxSpace();
    if (this.peek() === "'" || this.peek() === '"') {
      const quote = this.peek();
      this.advance();
      const start = this.i;
      while (this.i < this.n && this.peek() !== quote) this.advance();
      const value = this.text.slice(start, this.i);
      if (this.peek() === quote) this.advance();
      else this.truncated = true;
      return { name, string: this.make("string", value, { prefix: "", quote }) };
    }
    if (this.peek() === "{") return { name, tokens: this.readJsxBraced() };
    return { name, tokens: null };
  }

  readJsxText() {
    const start = this.i;
    while (this.i < this.n && this.peek() !== "<" && this.peek() !== "{") this.advance();
    const raw = this.text.slice(start, this.i).replace(/\s+/g, " ").trim();
    if (!raw) return null;
    return { type: "jsx-text", value: raw };
  }

  readJsxBraced() {
    this.advance();
    const inner = [];
    const saved = this.tokens;
    this.tokens = inner;
    let depth = 1;
    while (this.i < this.n && depth > 0) {
      const before = this.i;
      const from = inner.length;
      this.step();
      if (this.i === before) break;
      for (let i = from; i < inner.length; i += 1) {
        const t = inner[i];
        if (t.type === "jsx-el" || t.type === "nl" || t.type === "comment") continue;
        if (t.value === "{" || t.value === "(" || t.value === "[") depth += 1;
        else if (t.value === "}" || t.value === ")" || t.value === "]") depth -= 1;
      }
    }
    this.tokens = saved;
    if (inner.length && inner[inner.length - 1].value === "}") inner.pop();
    return inner.filter((t) => t.type !== "nl");
  }

  canBeRegex() {
    const prev = this.lastCode();
    if (!prev) return true;
    if (prev.type === "keyword") return REGEX_PREV.has(prev.value);
    if (prev.type === "op") {
      if (prev.value === ")" || prev.value === "]" || prev.value === "++" || prev.value === "--") return false;
      return true;
    }
    return false;
  }

  readLineComment() {
    const start = this.i;
    while (this.i < this.n && this.peek() !== "\n") this.advance();
    this.emit(this.make("comment", this.text.slice(start, this.i).trimEnd(), { inline: Boolean(this.lastCode()) }));
  }

  readBlockComment() {
    const start = this.i;
    this.advance();
    this.advance();
    while (this.i < this.n && !(this.peek() === "*" && this.peek(1) === "/")) this.advance();
    if (this.i >= this.n) this.truncated = true;
    else {
      this.advance();
      this.advance();
    }
    this.emit(this.make("comment", this.text.slice(start, this.i).trim(), { inline: Boolean(this.lastCode()) }));
  }

  readString(quote) {
    this.advance();
    const start = this.i;
    while (this.i < this.n) {
      const c = this.peek();
      if (c === "\\") {
        this.advance();
        if (this.i < this.n) this.advance();
        continue;
      }
      if (c === "\n") break;
      if (c === quote) break;
      this.advance();
    }
    const value = this.text.slice(start, this.i);
    if (this.peek() === quote) this.advance();
    else this.truncated = true;
    this.emit(this.make("string", value, { prefix: "", quote }));
  }

  readTemplate() {
    this.advance();
    const start = this.i;
    let depth = 0;
    while (this.i < this.n) {
      const c = this.peek();
      if (c === "\\") {
        this.advance();
        if (this.i < this.n) this.advance();
        continue;
      }
      if (c === "`" && depth === 0) break;
      if (c === "$" && this.peek(1) === "{") {
        depth += 1;
        this.advance();
        this.advance();
        continue;
      }
      if (c === "{" && depth) depth += 1;
      if (c === "}" && depth) depth -= 1;
      this.advance();
    }
    const value = this.text.slice(start, this.i);
    if (this.peek() === "`") this.advance();
    else this.truncated = true;
    this.emit(this.make("string", value, { prefix: "", quote: "`" }));
  }

  readRegex() {
    const start = this.i;
    this.advance();
    while (this.i < this.n) {
      const c = this.peek();
      if (c === "\\") {
        this.advance();
        if (this.i < this.n) this.advance();
        continue;
      }
      if (c === "\n") break;
      if (c === "/") break;
      if (c === "[") {
        this.advance();
        while (this.i < this.n && this.peek() !== "]" && this.peek() !== "\n") {
          if (this.peek() === "\\") this.advance();
          this.advance();
        }
        if (this.peek() === "]") this.advance();
        continue;
      }
      this.advance();
    }
    if (this.peek() === "/") this.advance();
    else this.truncated = true;
    while (this.i < this.n && /[a-z]/i.test(this.peek())) this.advance();
    this.emit(this.make("regex", this.text.slice(start, this.i)));
  }

  readNumber() {
    const start = this.i;
    if (this.peek() === "0" && "xXbBoO".includes(this.peek(1))) {
      this.advance();
      this.advance();
      while (this.i < this.n && /[0-9a-fA-F_]/i.test(this.peek())) this.advance();
    } else {
      while (this.i < this.n && /[0-9_]/.test(this.peek())) this.advance();
      if (this.peek() === ".") {
        this.advance();
        while (this.i < this.n && /[0-9_]/.test(this.peek())) this.advance();
      }
      if (this.peek() === "e" || this.peek() === "E") {
        this.advance();
        if (this.peek() === "+" || this.peek() === "-") this.advance();
        while (this.i < this.n && /[0-9_]/.test(this.peek())) this.advance();
      }
    }
    if (this.peek() === "n") this.advance();
    this.emit(this.make("number", this.text.slice(start, this.i)));
  }

  readName() {
    const start = this.i;
    this.advance();
    while (this.i < this.n && isIdCont(this.peek())) this.advance();
    const value = this.text.slice(start, this.i);
    let type = "name";
    if (value === "true" || value === "false") type = "bool";
    else if (value === "null" || value === "undefined") type = "null";
    else if (KEYWORDS.has(value)) type = "keyword";
    const prev = this.lastCode();
    if (prev && prev.type === "keyword" && prev.value === "function") type = "defname";
    if (prev && prev.type === "keyword" && prev.value === "class" && value !== "extends") type = "defname";
    this.emit(this.make(type, value));
  }

  readOp() {
    for (const op of MULTI_OPS) {
      if (this.text.startsWith(op, this.i)) {
        for (let i = 0; i < op.length; i += 1) this.advance();
        this.emit(this.make("op", op));
        return;
      }
    }
    const c = this.peek();
    this.advance();
    if (c == null) {
      this.truncated = true;
      return;
    }
    this.emit(this.make("op", c));
  }
}

class Parser {
  constructor(tokens, truncated) {
    this.tokens = tokens;
    this.i = 0;
    this.truncated = truncated;
  }

  parseModule() {
    return { type: "module", body: this.parseStmts(false), truncated: this.truncated };
  }

  peek(n = 0) {
    return this.tokens[Math.min(this.i + n, this.tokens.length - 1)];
  }

  eat() {
    const t = this.peek();
    if (t.type !== "end") this.i += 1;
    return t;
  }

  eof() {
    return this.peek().type === "end";
  }

  skipNl() {
    while (this.peek().type === "nl") this.eat();
  }

  parseStmts(inBlock) {
    const stmts = [];
    while (!this.eof()) {
      this.skipNl();
      const t = this.peek();
      if (t.type === "end") break;
      if (inBlock && t.value === "}") break;
      const before = this.i;
      stmts.push(this.parseStmt());
      if (this.i === before) this.eat();
    }
    return stmts;
  }

  parseStmt() {
    this.skipNl();
    const leading = [];
    while (this.peek().type === "comment" && !this.peek().inline) {
      leading.push(this.eat());
      this.skipNl();
    }
    this.skipNl();
    const t = this.peek();
    if (t.type === "end") {
      this.truncated = true;
      return { type: "simple", tokens: [], leading };
    }
    if (t.type === "comment") return { type: "comment", token: this.eat(), leading };
    if (t.value === "{") return this.parseBlock(leading);
    if (t.value === "export") return this.parseExport(leading);
    if (t.value === "async" && this.peek(1).value === "function") return this.parseFunction(leading, []);
    if (t.value === "function") return this.parseFunction(leading, []);
    if (t.value === "class") return this.parseClass(leading, []);
    if (t.value === "if") return this.parseIf(leading);
    if (t.value === "for" || t.value === "while") return this.parseForWhile(leading);
    if (t.value === "do") return this.parseDo(leading);
    if (t.value === "try") return this.parseTry(leading);
    if (t.value === "switch") return this.parseSwitch(leading);
    return this.parseSimple(leading);
  }

  parseExport(leading) {
    const prefix = [this.eat()];
    this.skipNl();
    if (this.peek().value === "default") prefix.push(this.eat());
    this.skipNl();
    if (this.peek().value === "async" && this.peek(1).value === "function") return this.parseFunction(leading, prefix);
    if (this.peek().value === "function") return this.parseFunction(leading, prefix);
    if (this.peek().value === "class") return this.parseClass(leading, prefix);
    return this.parseSimple(leading, prefix);
  }

  parseBlock(leading) {
    this.eat();
    const body = this.parseStmts(true);
    if (this.peek().value === "}") this.eat();
    else this.truncated = true;
    return { type: "block", body, leading };
  }

  parseFunction(leading, prefix = []) {
    const header = [...prefix];
    if (this.peek().value === "async") header.push(this.eat());
    this.skipNl();
    header.push(this.eat());
    this.skipNl();
    if (this.peek().value === "*") header.push(this.eat());
    this.skipNl();
    if (this.peek().type === "name" || this.peek().type === "defname") header.push(this.eat());
    this.skipNl();
    header.push(...this.takeGroup("(", ")"));
    this.skipNl();
    let body = [];
    if (this.peek().value === "{") {
      this.eat();
      body = this.parseStmts(true);
      if (this.peek().value === "}") this.eat();
      else this.truncated = true;
    } else {
      this.truncated = true;
    }
    return { type: "function", header, body, leading };
  }

  parseClass(leading, prefix = []) {
    const header = [...prefix];
    header.push(this.eat());
    this.skipNl();
    while (!this.eof() && this.peek().value !== "{" && this.peek().type !== "nl") {
      header.push(this.eat());
    }
    this.skipNl();
    let body = [];
    if (this.peek().value === "{") {
      this.eat();
      body = this.parseStmts(true);
      if (this.peek().value === "}") this.eat();
      else this.truncated = true;
    } else this.truncated = true;
    return { type: "class", header, body, leading };
  }

  parseIf(leading) {
    const cond = [this.eat(), ...this.takeGroup("(", ")")];
    this.skipNl();
    const consequent = wrapBlock(this.parseStmt());
    this.skipNl();
    let alternate = null;
    if (this.peek().value === "else") {
      this.eat();
      this.skipNl();
      alternate = this.peek().value === "if" ? this.parseIf([]) : wrapBlock(this.parseStmt());
    }
    return { type: "if", cond, consequent, alternate, leading };
  }

  parseForWhile(leading) {
    const header = [this.eat(), ...this.takeGroup("(", ")")];
    this.skipNl();
    const body = wrapBlock(this.parseStmt());
    return { type: "loop", header, body, leading };
  }

  parseDo(leading) {
    this.eat();
    this.skipNl();
    const body = wrapBlock(this.parseStmt());
    this.skipNl();
    const trailer = [];
    if (this.peek().value === "while") {
      trailer.push(this.eat(), ...this.takeGroup("(", ")"));
      if (this.peek().value === ";") trailer.push(this.eat());
    }
    return { type: "do", body, trailer, leading };
  }

  parseTry(leading) {
    this.eat();
    this.skipNl();
    const body = wrapBlock(this.parseStmt());
    const handlers = [];
    this.skipNl();
    while (this.peek().value === "catch") {
      const header = [this.eat()];
      this.skipNl();
      if (this.peek().value === "(") header.push(...this.takeGroup("(", ")"));
      this.skipNl();
      handlers.push({ header, body: wrapBlock(this.parseStmt()) });
      this.skipNl();
    }
    let fin = null;
    if (this.peek().value === "finally") {
      this.eat();
      this.skipNl();
      fin = wrapBlock(this.parseStmt());
    }
    return { type: "try", body, handlers, fin, leading };
  }

  parseSwitch(leading) {
    const header = [this.eat(), ...this.takeGroup("(", ")")];
    this.skipNl();
    const body = this.peek().value === "{" ? this.parseBlock([]) : wrapBlock(this.parseStmt());
    return { type: "switch", header, body, leading };
  }

  parseSimple(leading, prefix = []) {
    const tokens = [...prefix];
    let paren = 0;
    while (!this.eof()) {
      const t = this.peek();
      if (t.type === "nl") {
        this.eat();
        if (paren === 0) break;
        continue;
      }
      if (paren === 0 && t.value === "}") break;
      if (paren === 0 && t.value === ";") {
        tokens.push(this.eat());
        break;
      }
      if (t.value === "(" || t.value === "[" || t.value === "{") paren += 1;
      if (t.value === ")" || t.value === "]" || t.value === "}") paren = Math.max(0, paren - 1);
      tokens.push(this.eat());
    }
    return { type: "simple", tokens, leading };
  }

  takeGroup(open, close) {
    this.skipNl();
    const tokens = [];
    if (this.peek().value !== open) {
      this.truncated = true;
      return tokens;
    }
    let depth = 0;
    while (!this.eof()) {
      const t = this.peek();
      if (t.value === open) depth += 1;
      if (t.value === close) {
        depth -= 1;
        tokens.push(this.eat());
        if (depth === 0) break;
        continue;
      }
      if (t.type === "nl") {
        this.eat();
        continue;
      }
      tokens.push(this.eat());
    }
    return tokens;
  }
}

function wrapBlock(stmt) {
  if (stmt.type === "block") return stmt;
  return { type: "block", body: [stmt], added: true };
}

function formatModule(body, truncated) {
  body = sortJavaScriptImports(body);
  const nodes = [];
  let prev = null;
  for (const stmt of body) {
    const blanks = blankLinesBefore(prev, stmt);
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
  for (const comment of stmt.leading || []) nodes.push(commentLine(comment, indent));
  if (stmt.type === "comment") {
    nodes.push(commentLine(stmt.token, indent));
    return nodes;
  }
  if (stmt.type === "simple") {
    nodes.push(...formatSimple(stmt.tokens, indent));
    return nodes;
  }
  if (stmt.type === "block") {
    nodes.push({ type: "line", tokens: [...spaces(indent), { type: "op", value: "{" }] });
    nodes.push(...formatBody(stmt.body, indent + INDENT));
    nodes.push({ type: "line", tokens: [...spaces(indent), { type: "op", value: "}" }] });
    return nodes;
  }
  if (stmt.type === "function" || stmt.type === "class") {
    const header = ensureHeaderBrace(printTokens(stmt.header, indent)[0] || spaces(indent));
    const children = [...formatBody(stmt.body, indent + INDENT), { type: "line", tokens: [...spaces(indent), { type: "op", value: "}" }] }];
    nodes.push({ type: "block", header, children });
    return nodes;
  }
  if (stmt.type === "if") return formatIf(stmt, indent, nodes);
  if (stmt.type === "loop") {
    const header = printTokens(stmt.header, indent)[0] || spaces(indent);
    nodes.push({ type: "line", tokens: [...header, sp(), { type: "op", value: "{" }] });
    nodes.push(...formatBody(stmt.body.body, indent + INDENT));
    nodes.push({ type: "line", tokens: [...spaces(indent), { type: "op", value: "}" }] });
    return nodes;
  }
  if (stmt.type === "do") {
    nodes.push({ type: "line", tokens: [...spaces(indent), { type: "keyword", value: "do" }, sp(), { type: "op", value: "{" }] });
    nodes.push(...formatBody(stmt.body.body, indent + INDENT));
    const trailer = printTokens(stmt.trailer, 0)[0] || [];
    const whileLine = [...spaces(indent), { type: "op", value: "}" }, sp(), ...stripIndent(trailer)];
    if (!endsWithSemi(whileLine)) whileLine.push({ type: "op", value: ";" });
    nodes.push({ type: "line", tokens: whileLine });
    return nodes;
  }
  if (stmt.type === "try") {
    nodes.push({ type: "line", tokens: [...spaces(indent), { type: "keyword", value: "try" }, sp(), { type: "op", value: "{" }] });
    nodes.push(...formatBody(stmt.body.body, indent + INDENT));
    for (const handler of stmt.handlers || []) {
      const catchHeader = printTokens(handler.header, indent)[0] || spaces(indent);
      nodes.push({ type: "line", tokens: [...spaces(indent), { type: "op", value: "}" }, sp(), ...stripIndent(catchHeader), sp(), { type: "op", value: "{" }] });
      nodes.push(...formatBody(handler.body.body, indent + INDENT));
    }
    if (stmt.fin) {
      nodes.push({
        type: "line",
        tokens: [...spaces(indent), { type: "op", value: "}" }, sp(), { type: "keyword", value: "finally" }, sp(), { type: "op", value: "{" }],
      });
      nodes.push(...formatBody(stmt.fin.body, indent + INDENT));
    }
    nodes.push({ type: "line", tokens: [...spaces(indent), { type: "op", value: "}" }] });
    return nodes;
  }
  if (stmt.type === "switch") {
    const header = printTokens(stmt.header, indent)[0] || spaces(indent);
    nodes.push({ type: "line", tokens: [...header, sp(), { type: "op", value: "{" }] });
    nodes.push(...formatBody(stmt.body.body || [], indent + INDENT));
    nodes.push({ type: "line", tokens: [...spaces(indent), { type: "op", value: "}" }] });
    return nodes;
  }
  return nodes;
}

function formatIf(stmt, indent, nodes) {
  const cond = printTokens(stmt.cond, indent)[0] || spaces(indent);
  nodes.push({ type: "line", tokens: [...cond, sp(), { type: "op", value: "{" }] });
  nodes.push(...formatBody(stmt.consequent.body, indent + INDENT));
  let alt = stmt.alternate;
  while (alt && alt.type === "if") {
    const nextCond = printTokens(alt.cond, 0)[0] || [];
    nodes.push({
      type: "line",
      tokens: [
        ...spaces(indent),
        { type: "op", value: "}" },
        sp(),
        { type: "keyword", value: "else" },
        sp(),
        ...stripIndent(nextCond),
        sp(),
        { type: "op", value: "{" },
      ],
    });
    nodes.push(...formatBody(alt.consequent.body, indent + INDENT));
    alt = alt.alternate;
  }
  if (alt) {
    nodes.push({
      type: "line",
      tokens: [...spaces(indent), { type: "op", value: "}" }, sp(), { type: "keyword", value: "else" }, sp(), { type: "op", value: "{" }],
    });
    nodes.push(...formatBody(alt.body || [], indent + INDENT));
  }
  nodes.push({ type: "line", tokens: [...spaces(indent), { type: "op", value: "}" }] });
  return nodes;
}

function formatBody(body, indent) {
  const nodes = [];
  let prev = null;
  for (const stmt of body || []) {
    const blanks = blankLinesBefore(prev, stmt);
    for (let i = 0; i < blanks; i += 1) nodes.push({ type: "line", tokens: [] });
    nodes.push(...formatStmt(stmt, indent));
    prev = stmt;
  }
  return nodes;
}

function formatSimple(tokens, indent) {
  const withSemi = ensureSemi(tokens.filter((t) => t.type !== "nl"));
  return printTokens(withSemi, indent).map((line) => ({ type: "line", tokens: line }));
}

function ensureSemi(tokens) {
  const code = tokens.filter((t) => t.type !== "comment" && t.type !== "space");
  if (!code.length) return tokens;
  if (code[code.length - 1].value === ";") return tokens;
  return [...tokens, { type: "op", value: ";" }];
}

function ensureHeaderBrace(tokens) {
  const last = lastAtom(tokens);
  if (last && last.value === "{") return tokens;
  return [...tokens, sp(), { type: "op", value: "{" }];
}

function endsWithSemi(tokens) {
  const last = lastAtom(tokens);
  return last && last.value === ";";
}

function commentLine(token, indent) {
  const value = String(token.value || "");
  const text = value.startsWith("/*") ? value : value.replace(/^\/\/\s?/, "");
  const rendered = value.startsWith("/*") ? value : text ? `// ${text}` : "//";
  return { type: "line", tokens: [...spaces(indent), { type: "comment", value: rendered }] };
}

function printTokens(tokens, indent) {
  const rewritten = (tokens || []).map((t) => rewriteString(t, "single"));
  const tree = nestGroups(rewritten.filter((t) => t.type !== "nl"));
  const out = printSeq(tree.items, indent, indent, null);
  return splitPrinted(out, indent);
}

function printSeq(items, indent, col, parent) {
  const out = [];
  let prev = parent?.open || null;
  let ternary = false;
  for (const item of items) {
    if (item.kind === "group") {
      const groupToks = printGroup(item, indent, col + tokensLen(out), prev);
      joinToken(out, prev, firstAtom(groupToks), { parent, ternary });
      out.push(...groupToks);
      prev = lastAtom(groupToks);
      continue;
    }
    if (item.type === "jsx-el") {
      const jsxToks = printJsx(item, indent, col + tokensLen(out), parent);
      joinToken(out, prev, firstAtom(jsxToks), { parent, ternary });
      out.push(...jsxToks);
      prev = lastAtom(jsxToks);
      continue;
    }
    if (item.type === "comment") {
      if (prev) out.push({ type: "space", value: "  " });
      out.push(formatComment(item));
      prev = item;
      continue;
    }
    if (item.value === "?") ternary = true;
    if (item.value === ",") ternary = false;
    if (item.type === "string") {
      const wrapped = wrapJsString(
        item,
        indent,
        col + tokensLen(out) + (prev && spaceBetween(prev, item, { parent, ternary }) ? 1 : 0),
        parent,
      );
      if (wrapped) {
        joinToken(out, prev, firstAtom(wrapped), { parent, ternary });
        out.push(...wrapped);
        prev = lastAtom(wrapped);
        continue;
      }
    }
    joinToken(out, prev, item, { parent, ternary });
    if (item.value === ":") ternary = false;
    out.push(item);
    prev = item;
  }
  return out;
}

function printGroup(group, indent, col, prev) {
  const innerIndent = indent + INDENT;
  const compactInner = printSeq(group.items, innerIndent, col + 1, group);
  const close = group.close || { type: "op", value: closerFor(group.open.value) };
  const block = isBlockGroup(prev);
  const inner = block ? ensureSemi(compactInner) : compactInner;
  const innerSpaces = group.open.value === "{" && inner.length;
  const compact = innerSpaces ? [group.open, sp(), ...inner, sp(), close] : [group.open, ...inner, close];
  const magic = groupHasTrailingComma(group);
  const tooLong = col + tokensLen(compact) > WIDTH;
  const hasComment = group.items.some((item) => item.type === "comment");
  if (!magic && !tooLong && !hasComment && !group.truncated) return compact;

  if (block) {
    return [
      group.open,
      { type: "nl", value: "\n" },
      ...spaces(innerIndent),
      ...inner,
      { type: "nl", value: "\n" },
      ...spaces(indent),
      close,
    ];
  }

  const chunks = splitCommaItems(group.items);
  const exploded = [group.open, { type: "nl", value: "\n" }];
  if (!chunks.length) {
    exploded.push(...spaces(indent), close);
    return exploded;
  }
  for (const chunk of chunks) {
    if (!chunk.items.length && !chunk.comma) continue;
    const piece = printSeq(chunk.items, innerIndent, innerIndent, group);
    exploded.push(...spaces(innerIndent), ...piece, { type: "op", value: "," }, { type: "nl", value: "\n" });
  }
  exploded.push(...spaces(indent), close);
  return exploded;
}

function isBlockGroup(prev) {
  if (!prev) return false;
  return (
    prev.value === ")" ||
    prev.value === "=>" ||
    prev.value === "else" ||
    prev.value === "try" ||
    prev.value === "finally" ||
    prev.value === "do" ||
    prev.value === "catch"
  );
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
  if (isOpen(a) || av === "." || av === "?.") return false;
  if (bv === ":") return Boolean(ctx.ternary);
  if (av === ":") return true;
  if (av === "++" || av === "--" || bv === "++" || bv === "--") return false;
  if (bv === "!" || bv === "~") return true;
  if (bv === "(") {
    if (a.type === "keyword") {
      return [
        "if",
        "for",
        "while",
        "switch",
        "catch",
        "with",
        "function",
        "async",
        "await",
        "typeof",
        "new",
        "delete",
        "void",
        "return",
        "throw",
        "in",
        "of",
        "instanceof",
        "yield",
      ].includes(av);
    }
    if (a.type === "op" && !isClose(a)) return true;
    return false;
  }
  if (bv === "[") {
    if (a.type === "name" || a.type === "defname" || isClose(a) || a.type === "string" || a.type === "number") return false;
    return true;
  }
  if (bv === "{") {
    if (av === ")" || av === "else" || av === "try" || av === "finally" || av === "do" || av === "=>") return true;
    return true;
  }
  if (av === ")") return bv === "{" || bv === "=>" || b.type === "keyword" || BINARY.has(bv);
  if (av === "}" && (b.type === "name" || b.type === "keyword" || b.type === "defname")) return true;
  if (b.type === "string" && (a.type === "name" || a.type === "keyword" || a.type === "defname")) return true;
  if (av === ",") return true;
  if (BINARY.has(av) || BINARY.has(bv)) return true;
  if (a.type === "keyword" || b.type === "keyword") return true;
  if (a.type === "bool" || b.type === "bool" || a.type === "null" || b.type === "null") return true;
  if (a.type === "name" && b.type === "name") return true;
  return false;
}

function formatComment(token) {
  const value = String(token.value || "");
  if (value.startsWith("/*")) return { type: "comment", value };
  const text = value.replace(/^\/\/\s?/, "");
  return { type: "comment", value: text ? `// ${text}` : "//" };
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
  return lines.filter((line, i) => i === 0 || line.length);
}

function stripIndent(tokens) {
  let i = 0;
  while (i < tokens.length && tokens[i].type === "space") i += 1;
  return tokens.slice(i);
}

function tokensLen(tokens) {
  return tokens.reduce((n, t) => {
    if (t.type === "string") return n + (t.prefix || "").length + t.quote.length * 2 + t.value.length;
    return n + t.value.length;
  }, 0);
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

function blankLinesBefore(prev, stmt) {
  if (!prev) return 0;
  if (stmt.type === "comment" || prev.type === "comment") return 0;
  if (prev.importSection != null && stmt.importSection != null) {
    return prev.importSection === stmt.importSection ? 0 : 1;
  }
  if (prev.importSection != null && stmt.importSection == null) return 1;
  if (isFnLike(stmt) || isFnLike(prev)) return 1;
  return 0;
}

function isFnLike(stmt) {
  return stmt && (stmt.type === "function" || stmt.type === "class");
}

function wrapJsString(token, indent, col, parent) {
  if (parent) return null;
  if (token.quote === "`") return null;
  const quote = token.quote || "'";
  const overhead = quote.length * 2;
  const firstBudget = WIDTH - col - overhead;
  const nextBudget = WIDTH - (indent + INDENT) - overhead;
  const parts = splitStringParts(token.value, firstBudget, nextBudget);
  if (!parts) return null;
  const out = [];
  parts.forEach((value, i) => {
    if (i) out.push(sp(), { type: "op", value: "+" }, { type: "nl", value: "\n" }, ...spaces(indent + INDENT));
    out.push({ ...token, value });
  });
  return out;
}

function printJsx(el, indent, col, parent) {
  const compact = jsxCompact(el);
  const kids = el.children || [];
  const nested = kids.some((c) => c.type === "jsx-el");
  const fits = col + tokensLen(compact) <= WIDTH;
  if (fits && !nested && kids.length <= 1 && (el.attrs || []).length <= 3) return compact;

  const innerIndent = parent?.open?.value === "(" ? indent : indent + INDENT;
  const body = jsxExploded(el, innerIndent);
  if (parent?.open?.value === "(") return body;
  return [
    { type: "op", value: "(" },
    { type: "nl", value: "\n" },
    ...spaces(innerIndent),
    ...body,
    { type: "nl", value: "\n" },
    ...spaces(indent),
    { type: "op", value: ")" },
  ];
}

function jsxPunct(value) {
  return { type: "jsx-tag", value };
}

function jsxTagName(name) {
  if (!name) return [];
  if (/^[A-Z]/.test(name)) return [{ type: "defname", value: name }];
  return [{ type: "jsx-tag", value: name }];
}

function jsxAttrTokens(attr, indent) {
  if (attr.spread) {
    return [{ type: "op", value: "{" }, ...printJsxExpr(attr.tokens, indent, indent), { type: "op", value: "}" }];
  }
  const name = { type: "jsx-attr", value: attr.name };
  if (attr.string) return [name, { type: "op", value: "=" }, rewriteString(attr.string, "double")];
  if (attr.tokens) {
    return [
      name,
      { type: "op", value: "=" },
      { type: "op", value: "{" },
      ...printJsxExpr(attr.tokens, indent, indent),
      { type: "op", value: "}" },
    ];
  }
  return [name];
}

function jsxCompact(el) {
  const out = [jsxPunct("<"), ...jsxTagName(el.name)];
  for (const attr of el.attrs || []) out.push(sp(), ...jsxAttrTokens(attr, 0));
  if (el.selfClosing) {
    out.push(sp(), jsxPunct("/>"));
    return out;
  }
  out.push(jsxPunct(">"));
  for (const child of el.children || []) out.push(...jsxChildInline(child));
  out.push(jsxPunct("</"), ...jsxTagName(el.name), jsxPunct(">"));
  return out;
}

function jsxChildInline(child) {
  if (child.type === "jsx-text") return [{ type: "text", value: child.value }];
  if (child.type === "jsx-expr") {
    return [{ type: "op", value: "{" }, ...printJsxExpr(child.tokens, 0, 0), { type: "op", value: "}" }];
  }
  if (child.type === "jsx-el") return jsxCompact(child);
  return [];
}

function jsxExploded(el, indent) {
  const out = [jsxPunct("<"), ...jsxTagName(el.name)];
  const attrs = el.attrs || [];
  if (attrs.length) {
    for (const attr of attrs) {
      out.push({ type: "nl", value: "\n" }, ...spaces(indent + INDENT), ...jsxAttrTokens(attr, indent + INDENT));
    }
    out.push({ type: "nl", value: "\n" }, ...spaces(indent));
  }
  if (el.selfClosing) {
    if (!attrs.length) out.push(sp());
    out.push(jsxPunct("/>"));
    return out;
  }
  out.push(jsxPunct(">"));
  for (const child of el.children || []) {
    out.push({ type: "nl", value: "\n" }, ...spaces(indent + INDENT), ...jsxChildBlock(child, indent + INDENT));
  }
  if ((el.children || []).length) out.push({ type: "nl", value: "\n" }, ...spaces(indent));
  out.push(jsxPunct("</"), ...jsxTagName(el.name), jsxPunct(">"));
  return out;
}

function jsxChildBlock(child, indent) {
  if (child.type === "jsx-text") return [{ type: "text", value: child.value }];
  if (child.type === "jsx-expr") {
    return [{ type: "op", value: "{" }, ...printJsxExpr(child.tokens, indent, indent), { type: "op", value: "}" }];
  }
  if (child.type === "jsx-el") return jsxExploded(child, indent);
  return [];
}

function printJsxExpr(tokens, indent, col) {
  const rewritten = (tokens || []).map((t) => (t.type === "string" ? rewriteString(t, "single") : t));
  const tree = nestGroups(rewritten.filter((t) => t.type !== "nl"));
  return printSeq(tree.items, indent, col, null);
}

function sortJavaScriptImports(body) {
  let i = 0;
  while (i < body.length && body[i].type === "comment") i += 1;
  const start = i;
  while (i < body.length && isImportLike(body[i])) i += 1;
  if (i === start) return body;
  const items = [];
  for (const stmt of body.slice(start, i)) {
    const item = parseJsImport(stmt);
    if (!item) return body;
    items.push(item);
  }
  items.sort(compareJsImport);
  return [...body.slice(0, start), ...items.map(jsImportToStmt), ...body.slice(i)];
}

function isImportLike(stmt) {
  if (stmt.type !== "simple") return false;
  const code = (stmt.tokens || []).filter((t) => t.type !== "comment" && t.type !== "nl");
  if (!code.length) return false;
  if (code[0].value === "import") return true;
  return code[0].value === "export" && code.some((t) => t.value === "from");
}

function parseJsImport(stmt) {
  const tokens = (stmt.tokens || []).filter((t) => t.type !== "comment" && t.type !== "nl" && t.value !== ";");
  const sourceTok = [...tokens].reverse().find((t) => t.type === "string");
  if (!sourceTok) return null;
  const named = parseNamedSpecifiers(tokens);
  named.sort((a, b) => a.key.localeCompare(b.key));
  const source = sourceTok.value;
  return {
    tokens,
    source,
    named,
    leading: stmt.leading,
    section: jsImportSection(source),
    exported: tokens[0]?.value === "export",
  };
}

function parseNamedSpecifiers(tokens) {
  const start = tokens.findIndex((t) => t.value === "{");
  const end = tokens.findIndex((t) => t.value === "}");
  if (start < 0 || end < 0) return [];
  const parts = [];
  let current = [];
  for (const token of tokens.slice(start + 1, end)) {
    if (token.value === ",") {
      if (current.length) parts.push(current);
      current = [];
      continue;
    }
    current.push(token);
  }
  if (current.length) parts.push(current);
  return parts.map((part) => ({
    tokens: part,
    key: part.find((t) => t.type === "name" || t.type === "defname" || t.type === "keyword")?.value || "",
  }));
}

function jsImportSection(source) {
  if (source.startsWith("node:") || NODE_BUILTINS.has(source)) return 0;
  if (source.startsWith(".")) return source.startsWith("..") ? 3 : 4;
  if (source.startsWith("/")) return 2;
  return 1;
}

function compareJsImport(a, b) {
  if (a.section !== b.section) return a.section - b.section;
  return a.source.localeCompare(b.source);
}

function jsImportToStmt(item) {
  const tokens = rebuildJsImport(item);
  return { type: "simple", tokens, leading: item.leading, importSection: item.section };
}

function rebuildJsImport(item) {
  const tokens = [...item.tokens];
  const start = tokens.findIndex((t) => t.value === "{");
  const end = tokens.findIndex((t) => t.value === "}");
  if (start >= 0 && end > start && item.named.length) {
    const inner = [];
    item.named.forEach((name, i) => {
      if (i) inner.push({ type: "op", value: "," });
      inner.push(...name.tokens);
    });
    const rebuilt = [...tokens.slice(0, start + 1), ...inner, ...tokens.slice(end)];
    if (tokensLen(rebuilt) + 1 > WIDTH) {
      return [...tokens.slice(0, start + 1), ...inner, { type: "op", value: "," }, ...tokens.slice(end)];
    }
    return rebuilt;
  }
  return tokens;
}

function isDigit(c) {
  return c >= "0" && c <= "9";
}

function isIdStart(c) {
  return c === "_" || c === "$" || (c >= "A" && c <= "Z") || (c >= "a" && c <= "z");
}

function isIdCont(c) {
  return isIdStart(c) || isDigit(c);
}
