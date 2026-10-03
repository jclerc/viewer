// Small, table-driven syntax highlighter for fenced code blocks. It only
// colours tokens (comments, strings, numbers, keywords, calls, types); it
// never reformats, so the code reads exactly as written.

const words = (s) => new Set(s.split(/\s+/).filter(Boolean));

const C_FAMILY = {
  line: ["//"],
  block: [["/*", "*/"]],
  strings: ['"', "'"],
  capTypes: true,
};

const JS_KW =
  "async await break case catch class const continue debugger default delete do else export extends finally for from function get if import in instanceof let new of return set static switch throw try typeof var void while with yield as";
const JS_LIT = "true false null undefined NaN Infinity this super";
const TS_KW = `${JS_KW} abstract declare enum implements interface keyof infer is namespace private protected public readonly satisfies type override module`;
const TS_TYPES = "string number boolean any unknown never void object symbol bigint";

const LANGS = {
  js: { ...C_FAMILY, strings: ['"', "'", "`"], keywords: words(JS_KW), literals: words(JS_LIT), regex: true },
  ts: {
    ...C_FAMILY,
    strings: ['"', "'", "`"],
    keywords: words(TS_KW),
    literals: words(JS_LIT),
    types: words(TS_TYPES),
    meta: "@",
    regex: true,
  },
  py: {
    line: ["#"],
    strings: ['"""', "'''", '"', "'"],
    stringPrefix: /^[rbuf]{1,2}(?=["'])/i,
    keywords: words(
      "and as assert async await break class continue def del elif else except finally for from global if import in is lambda match case nonlocal not or pass raise return try while with yield print",
    ),
    literals: words("True False None self cls"),
    types: words("int float str bool list dict set tuple bytes object type Exception"),
    meta: "@",
    capTypes: true,
  },
  sh: {
    line: ["#"],
    strings: ['"', "'"],
    keywords: words(
      "if then else elif fi for while until do done case esac function in return export local readonly declare unset shift break continue exit source alias set trap eval exec",
    ),
    builtins: words(
      "echo printf cd ls cat grep sed awk find xargs curl wget git npm npx yarn pnpm node python python3 pip docker kubectl make mkdir rm cp mv chmod chown sudo tar ssh scp export test true false brew apt go cargo",
    ),
    vars: true,
  },
  sql: {
    line: ["--"],
    block: [["/*", "*/"]],
    strings: ["'", '"'],
    nocase: true,
    keywords: words(
      "select from where and or not insert into values update set delete create table index view drop alter add column primary key foreign references join left right inner outer full cross on as group by order having limit offset union all distinct case when then else end is null like in between exists returning with recursive asc desc default unique constraint begin commit rollback transaction if grant revoke cascade database schema",
    ),
    literals: words("true false null"),
    types: words(
      "int integer bigint smallint serial varchar char text boolean bool date time timestamp timestamptz numeric decimal float double real json jsonb uuid bytea",
    ),
  },
  go: {
    ...C_FAMILY,
    strings: ['"', "'", "`"],
    keywords: words(
      "break case chan const continue default defer else fallthrough for func go goto if import interface map package range return select struct switch type var",
    ),
    literals: words("true false nil iota"),
    types: words(
      "bool byte complex64 complex128 error float32 float64 int int8 int16 int32 int64 rune string uint uint8 uint16 uint32 uint64 uintptr any",
    ),
  },
  java: {
    ...C_FAMILY,
    keywords: words(
      "abstract assert break case catch class continue default do else enum extends final finally for if implements import instanceof interface native new package private protected public return static strictfp super switch synchronized throw throws transient try volatile while var record sealed permits yield",
    ),
    literals: words("true false null this"),
    types: words("boolean byte char double float int long short void String Object"),
    meta: "@",
  },
  kotlin: {
    ...C_FAMILY,
    strings: ['"""', '"', "'"],
    keywords: words(
      "as break class continue do else for fun if in interface is object package return super throw try typealias val var when while by catch constructor data enum finally import init internal open override private protected public sealed suspend companion lateinit",
    ),
    literals: words("true false null this it"),
    meta: "@",
  },
  c: {
    ...C_FAMILY,
    keywords: words(
      "auto break case const continue default do else enum extern for goto if inline register restrict return sizeof static struct switch typedef union volatile while class namespace template typename public private protected virtual override new delete using try catch throw constexpr nullptr operator friend explicit noexcept",
    ),
    literals: words("true false NULL nullptr this"),
    types: words(
      "void char short int long float double signed unsigned bool size_t int8_t int16_t int32_t int64_t uint8_t uint16_t uint32_t uint64_t std string vector auto",
    ),
    preproc: true,
  },
  cs: {
    ...C_FAMILY,
    keywords: words(
      "abstract as async await base break case catch checked class const continue default delegate do else enum event explicit extern finally fixed for foreach goto if implicit in interface internal is lock namespace new operator out override params private protected public readonly ref return sealed sizeof stackalloc static struct switch throw try typeof unchecked unsafe using virtual volatile while var record get set init",
    ),
    literals: words("true false null this"),
    types: words("bool byte char decimal double float int long object sbyte short string uint ulong ushort void dynamic"),
    meta: "[",
  },
  rust: {
    ...C_FAMILY,
    strings: ['"'],
    keywords: words(
      "as async await break const continue crate dyn else enum extern fn for if impl in let loop match mod move mut pub ref return static struct super trait type unsafe use where while macro_rules",
    ),
    literals: words("true false self Self None Some Ok Err"),
    types: words("i8 i16 i32 i64 i128 isize u8 u16 u32 u64 u128 usize f32 f64 bool char str String Vec Option Result Box"),
    macros: true,
  },
  php: {
    ...C_FAMILY,
    line: ["//", "#"],
    keywords: words(
      "abstract and array as break callable case catch class clone const continue declare default do echo else elseif empty enddeclare endfor endforeach endif endswitch endwhile extends final finally fn for foreach function global goto if implements include include_once instanceof insteadof interface isset list match namespace new or print private protected public readonly require require_once return static switch throw trait try unset use var while yield",
    ),
    literals: words("true false null TRUE FALSE NULL"),
    vars: true,
  },
  ruby: {
    line: ["#"],
    strings: ['"', "'"],
    keywords: words(
      "alias and begin break case class def defined? do else elsif end ensure for if in module next not or redo rescue retry return then undef unless until when while yield require attr_accessor attr_reader private protected public puts",
    ),
    literals: words("true false nil self"),
    symbols: true,
    capTypes: true,
  },
  swift: {
    ...C_FAMILY,
    keywords: words(
      "associatedtype class deinit enum extension fileprivate func import init inout internal let open operator private protocol public static struct subscript typealias var break case continue default defer do else fallthrough for guard if in repeat return switch where while as catch is rethrows throw throws try async await",
    ),
    literals: words("true false nil self Self"),
    meta: "@",
  },
  lua: {
    line: ["--"],
    strings: ['"', "'"],
    keywords: words("and break do else elseif end for function goto if in local not or repeat return then until while"),
    literals: words("true false nil self"),
  },
  css: {
    block: [["/*", "*/"]],
    line: [],
    strings: ['"', "'"],
    css: true,
  },
  json: {
    strings: ['"'],
    line: ["//"],
    block: [["/*", "*/"]],
    literals: words("true false null"),
    jsonKeys: true,
  },
  yaml: {
    line: ["#"],
    strings: ['"', "'"],
    literals: words("true false null yes no on off True False Null ~"),
    yaml: true,
  },
  toml: {
    line: ["#", ";"],
    strings: ['"""', "'''", '"', "'"],
    literals: words("true false"),
    ini: true,
  },
  dockerfile: {
    line: ["#"],
    strings: ['"', "'"],
    nocase: true,
    keywords: words(
      "from run cmd label maintainer expose env add copy entrypoint volume user workdir arg onbuild stopsignal healthcheck shell as",
    ),
    vars: true,
  },
  graphql: {
    line: ["#"],
    strings: ['"""', '"'],
    keywords: words("query mutation subscription fragment on type input enum interface union scalar schema extend implements directive"),
    literals: words("true false null"),
    capTypes: true,
    vars: true,
  },
  makefile: {
    line: ["#"],
    strings: ['"', "'"],
    keywords: words("ifeq ifneq ifdef ifndef else endif include define endef export"),
    vars: true,
  },
};

const ALIASES = {
  javascript: "js",
  jsx: "js",
  mjs: "js",
  cjs: "js",
  node: "js",
  typescript: "ts",
  tsx: "ts",
  mts: "ts",
  python: "py",
  py3: "py",
  python3: "py",
  bash: "sh",
  shell: "sh",
  zsh: "sh",
  ksh: "sh",
  fish: "sh",
  shellscript: "sh",
  psql: "sql",
  mysql: "sql",
  postgres: "sql",
  postgresql: "sql",
  plsql: "sql",
  sqlite: "sql",
  golang: "go",
  kt: "kotlin",
  kts: "kotlin",
  scala: "java",
  groovy: "java",
  gradle: "java",
  dart: "java",
  h: "c",
  cpp: "c",
  "c++": "c",
  cc: "c",
  hpp: "c",
  cxx: "c",
  objc: "c",
  csharp: "cs",
  "c#": "cs",
  rs: "rust",
  rb: "ruby",
  scss: "css",
  sass: "css",
  less: "css",
  jsonc: "json",
  json5: "json",
  geojson: "json",
  yml: "yaml",
  ini: "toml",
  cfg: "toml",
  conf: "toml",
  properties: "toml",
  env: "toml",
  docker: "dockerfile",
  gql: "graphql",
  make: "makefile",
  mk: "makefile",
  html: "markup",
  htm: "markup",
  xml: "markup",
  svg: "markup",
  xhtml: "markup",
  vue: "markup",
  svelte: "markup",
  plist: "markup",
  patch: "diff",
  udiff: "diff",
  "shell-session": "console",
  sh_session: "console",
  terminal: "console",
};

export function canonicalLang(lang) {
  const key = String(lang ?? "").toLowerCase();
  return ALIASES[key] ?? key;
}

/** Split `code` into `[{ cls, text }]`; `cls` is null for plain text. */
export function highlight(code, lang) {
  const key = canonicalLang(lang);
  if (key === "diff") return highlightDiff(code);
  if (key === "markup") return highlightMarkup(code);
  if (key === "console") return highlightConsole(code);
  const def = LANGS[key];
  if (!def) return [{ cls: null, text: code }];
  return tokenize(code, def);
}

export function supportsLang(lang) {
  const key = canonicalLang(lang);
  return Boolean(LANGS[key]) || key === "diff" || key === "markup" || key === "console";
}

function push(out, cls, text) {
  if (!text) return;
  const last = out[out.length - 1];
  if (last && last.cls === cls) last.text += text;
  else out.push({ cls, text });
}

function readString(code, i, quote) {
  let j = i + quote.length;
  const multi = quote.length === 3 || quote === "`";
  while (j < code.length) {
    if (code[j] === "\\") {
      j += 2;
      continue;
    }
    if (code.startsWith(quote, j)) return j + quote.length;
    if (!multi && code[j] === "\n") return j;
    j += 1;
  }
  return code.length;
}

function tokenize(code, def) {
  const out = [];
  const n = code.length;
  let i = 0;
  let lineStart = true;
  let prevSignificant = "";

  while (i < n) {
    const c = code[i];
    const rest = code.slice(i, i + 64);

    if (c === "\n") {
      push(out, null, c);
      i += 1;
      lineStart = true;
      continue;
    }
    if (c === " " || c === "\t") {
      push(out, null, c);
      i += 1;
      continue;
    }

    const block = def.block?.find(([open]) => code.startsWith(open, i));
    if (block) {
      const end = code.indexOf(block[1], i + block[0].length);
      const stop = end === -1 ? n : end + block[1].length;
      push(out, "com", code.slice(i, stop));
      i = stop;
      continue;
    }

    const line = def.line?.find((mark) => code.startsWith(mark, i));
    if (line && !(line === "#" && def.preproc)) {
      const end = code.indexOf("\n", i);
      const stop = end === -1 ? n : end;
      push(out, "com", code.slice(i, stop));
      i = stop;
      continue;
    }

    if (def.preproc && lineStart && c === "#") {
      const m = /^#\s*[a-z]+/.exec(rest);
      if (m) {
        push(out, "meta", m[0]);
        i += m[0].length;
        lineStart = false;
        continue;
      }
    }

    if (def.yaml && lineStart) {
      const m = /^(-\s+)?([\w.$/-][\w .$/-]*?|"[^"\n]*"|'[^'\n]*')(\s*:)(?=\s|$)/.exec(code.slice(i, code.indexOf("\n", i) === -1 ? n : code.indexOf("\n", i)));
      if (m) {
        push(out, null, m[1] ?? "");
        push(out, "key", m[2]);
        push(out, null, m[3]);
        i += m[0].length;
        lineStart = false;
        continue;
      }
      if (/^(---|\.\.\.)\s*$/.test(code.slice(i, code.indexOf("\n", i) === -1 ? n : code.indexOf("\n", i)))) {
        push(out, "meta", code.slice(i, i + 3));
        i += 3;
        continue;
      }
    }

    if (def.ini && lineStart) {
      const lineEnd = code.indexOf("\n", i) === -1 ? n : code.indexOf("\n", i);
      const lineText = code.slice(i, lineEnd);
      const section = /^\[\[?[^\]\n]+\]\]?/.exec(lineText);
      if (section) {
        push(out, "type", section[0]);
        i += section[0].length;
        lineStart = false;
        continue;
      }
      const key = /^([\w.$"'-]+)(\s*[=:])/.exec(lineText);
      if (key) {
        push(out, "key", key[1]);
        push(out, null, key[2]);
        i += key[0].length;
        lineStart = false;
        continue;
      }
    }

    if (def.css) {
      const at = /^@[\w-]+/.exec(rest);
      if (at) {
        push(out, "kw", at[0]);
        i += at[0].length;
        lineStart = false;
        continue;
      }
      const prop = /^(--?[\w-]+|[a-z-]+)(\s*:)(?![:\w]*\s*[{,])/.exec(code.slice(i, i + 200));
      if (prop && /[;{\s]$|^$/.test(prevSignificant)) {
        push(out, "key", prop[1]);
        push(out, null, prop[2]);
        i += prop[0].length;
        prevSignificant = ":";
        lineStart = false;
        continue;
      }
      const hex = /^#[0-9a-f]{3,8}\b/i.exec(rest);
      if (hex && prevSignificant !== "" && prevSignificant !== "}" && prevSignificant !== "{" && prevSignificant !== ";") {
        push(out, "num", hex[0]);
        i += hex[0].length;
        continue;
      }
      const num = /^-?(?:\d+\.?\d*|\.\d+)(?:%|[a-z]+)?/i.exec(rest);
      if (num && !/[\w-]/.test(code[i - 1] ?? "")) {
        push(out, "num", num[0]);
        i += num[0].length;
        continue;
      }
      const sel = /^[.#][\w-]+|^::?[\w-]+/.exec(rest);
      if (sel && prevSignificant !== ":") {
        push(out, "fn", sel[0]);
        i += sel[0].length;
        continue;
      }
    }

    let prefixLen = 0;
    if (def.stringPrefix) {
      const m = def.stringPrefix.exec(rest);
      if (m) prefixLen = m[0].length;
    }
    const quote = def.strings?.find((q) => code.startsWith(q, i + prefixLen));
    if (quote) {
      const stop = readString(code, i + prefixLen, quote);
      const text = code.slice(i, stop);
      const isKey = def.jsonKeys && /^\s*:/.test(code.slice(stop, stop + 32));
      push(out, isKey ? "key" : "str", text);
      i = stop;
      prevSignificant = quote;
      lineStart = false;
      continue;
    }

    if (def.regex && c === "/" && /^$|[(,=:[!&|?{};]$/.test(prevSignificant)) {
      const m = /^\/(?![*/])(?:\\.|\[(?:\\.|[^\]\n])*\]|[^/\\\n[])+\/[dgimsuyv]*/.exec(code.slice(i, i + 400));
      if (m) {
        push(out, "str", m[0]);
        i += m[0].length;
        prevSignificant = "r";
        continue;
      }
    }

    if (def.vars && c === "$") {
      const m = /^\$(?:\{[^}\n]*\}|\([^)\n]*\)|[A-Za-z_][\w]*|[0-9@#?$!*-])/.exec(rest);
      if (m) {
        push(out, "var", m[0]);
        i += m[0].length;
        prevSignificant = "v";
        lineStart = false;
        continue;
      }
    }

    if (def.meta && c === def.meta) {
      const m = def.meta === "[" ? /^\[[A-Z][\w.]*(?=[\](])/.exec(rest) : /^@[A-Za-z_][\w.]*/.exec(rest);
      if (m) {
        push(out, "meta", m[0]);
        i += m[0].length;
        lineStart = false;
        continue;
      }
    }

    if (def.symbols && c === ":" && /^:[A-Za-z_]\w*[?!]?/.test(rest) && code[i - 1] !== ":") {
      const m = /^:[A-Za-z_]\w*[?!]?/.exec(rest);
      push(out, "lit", m[0]);
      i += m[0].length;
      continue;
    }

    const num = /^(?:0x[\da-f_]+n?|0b[01_]+n?|0o[0-7_]+n?|(?:\d[\d_]*\.?[\d_]*|\.\d[\d_]*)(?:e[+-]?\d+)?[a-z]*)/i.exec(rest);
    if (num && !/[\w$]/.test(code[i - 1] ?? "")) {
      push(out, "num", num[0]);
      i += num[0].length;
      prevSignificant = "0";
      lineStart = false;
      continue;
    }

    const ident = /^[A-Za-z_$\u00c0-\uffff][\w$\u00c0-\uffff]*[?!]?/.exec(rest);
    if (ident) {
      let word = ident[0];
      if (/[?!]$/.test(word) && !def.symbols && !def.macros) word = word.slice(0, -1);
      const probe = def.nocase ? word.toLowerCase() : word;
      const after = code.slice(i + word.length, i + word.length + 2);
      let cls = null;
      if (def.keywords?.has(probe)) cls = "kw";
      else if (def.literals?.has(probe)) cls = "lit";
      else if (def.types?.has(probe)) cls = "type";
      else if (def.macros && (after[0] === "!" || word.endsWith("!"))) cls = "fn";
      else if (/^\s?\(/.test(after) && code[i - 1] !== ".") cls = "fn";
      else if (/^\(/.test(after)) cls = "fn";
      else if (def.builtins?.has(word) && (lineStart || /[|;&]$/.test(prevSignificant))) cls = "fn";
      else if (def.capTypes && /^[A-Z][a-z0-9]\w*$/.test(word)) cls = "type";
      push(out, cls, word);
      i += word.length;
      prevSignificant = "a";
      lineStart = false;
      continue;
    }

    push(out, null, c);
    prevSignificant = c;
    i += 1;
    lineStart = false;
  }
  return out;
}

function highlightDiff(code) {
  const out = [];
  for (const line of code.split(/(?<=\n)/)) {
    let cls = null;
    if (/^(?:diff |index |\+\+\+ |--- )/.test(line)) cls = "meta";
    else if (line.startsWith("@@")) cls = "type";
    else if (line.startsWith("+")) cls = "ins";
    else if (line.startsWith("-")) cls = "del";
    push(out, cls, line);
  }
  return out;
}

function highlightConsole(code) {
  const out = [];
  for (const line of code.split(/(?<=\n)/)) {
    const m = /^(\s*(?:[\w@.~:/-]*[$#%>]|PS[^>]*>)\s)(.*)$/s.exec(line);
    if (m) {
      push(out, "com", m[1]);
      for (const token of tokenize(m[2], LANGS.sh)) push(out, token.cls, token.text);
    } else {
      push(out, "out", line);
    }
  }
  return out;
}

function highlightMarkup(code) {
  const out = [];
  const re = /<!--[\s\S]*?(?:-->|$)|<!\[CDATA\[[\s\S]*?(?:\]\]>|$)|<![^>]*>|<\?[\s\S]*?\?>|<\/?[A-Za-z][^\s/>]*(?:\s+[^\s=/>]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*\s*\/?>|&[#\w]+;/g;
  let last = 0;
  let m;
  while ((m = re.exec(code))) {
    push(out, null, code.slice(last, m.index));
    const text = m[0];
    if (text.startsWith("<!--") || text.startsWith("<![CDATA[")) push(out, "com", text);
    else if (text.startsWith("<!") || text.startsWith("<?")) push(out, "meta", text);
    else if (text.startsWith("&")) push(out, "lit", text);
    else tagTokens(out, text);
    last = m.index + text.length;
  }
  push(out, null, code.slice(last));
  return out;
}

function tagTokens(out, tag) {
  const head = /^<\/?[^\s/>]+/.exec(tag)[0];
  push(out, null, head.startsWith("</") ? "</" : "<");
  push(out, "tag", head.replace(/^<\/?/, ""));
  const attrRe = /(\s+)([^\s=/>]+)(?:(\s*=\s*)("[^"]*"|'[^']*'|[^\s>]+))?|(\s*\/?>)/g;
  attrRe.lastIndex = head.length;
  let m;
  while ((m = attrRe.exec(tag))) {
    if (m[5]) {
      push(out, null, m[5]);
      continue;
    }
    push(out, null, m[1]);
    push(out, "attr", m[2]);
    if (m[3]) {
      push(out, null, m[3]);
      push(out, "str", m[4]);
    }
  }
}
