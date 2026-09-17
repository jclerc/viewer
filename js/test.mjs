import { formatJavaScript, parseJavaScript, tokenizeJavaScript } from "./parser.js";

function eq(a, b, msg) {
  const left = JSON.stringify(a);
  const right = JSON.stringify(b);
  if (left !== right) throw new Error(`${msg}\n  got  ${left}\n  want ${right}`);
}

{
  const types = tokenizeJavaScript("function foo(x = 1) { return x; }\n").map((t) => t.type);
  eq(types.includes("defname"), true, "function name token");
  eq(types.includes("keyword"), true, "keyword token");
}

{
  const n = parseJavaScript("function foo() { return 1; }\n");
  eq(n.body[0].type, "function", "function statement");
}

{
  eq(formatJavaScript("const x=1"), "const x = 1;\n", "spaces and semicolon");
  eq(formatJavaScript('const x="hi"'), "const x = 'hi';\n", "airbnb single quotes");
  eq(formatJavaScript("const x='a\"b'"), "const x = 'a\"b';\n", "keep single if double inside");
  eq(formatJavaScript('const x="a\'b"'), 'const x = "a\'b";\n', "double when single inside");
}

{
  eq(
    formatJavaScript("function f(){return 1}"),
    "function f() {\n  return 1;\n}\n",
    "two space indent and braces",
  );
}

{
  eq(
    formatJavaScript("if(x) foo()"),
    "if (x) {\n  foo();\n}\n",
    "airbnb braces on if",
  );
}

{
  eq(formatJavaScript("const x = {a:1}"), "const x = { a: 1 };\n", "spaces inside object");
}

{
  eq(
    formatJavaScript("const x=name+(excited?'!':'')"),
    "const x = name + (excited ? '!' : '');\n",
    "spaces around plus, paren, and ternary",
  );
}

{
  eq(
    formatJavaScript("import b from './b'\nimport {z, a} from 'react'\nimport fs from 'fs'\n"),
    "import fs from 'fs';\n\nimport { a, z } from 'react';\n\nimport b from './b';\n",
    "airbnb import groups and named sort",
  );
}

{
  eq(
    formatJavaScript('const x=<div className="a">{name}</div>'),
    "const x = <div className=\"a\">{name}</div>;\n",
    "jsx compact",
  );
}

{
  const out = formatJavaScript("function App(){return <div><span>hi</span></div>}");
  eq(out.includes("<div>"), true, "jsx nested renders");
  eq(out.includes("<span>"), true, "jsx child");
  eq(out.includes("</div>"), true, "jsx close");
}

{
  const long = `const x = '${"word ".repeat(20).trim()}'`;
  const out = formatJavaScript(long);
  eq(out.includes("+\n"), true, "long string concatenates");
  eq(out.split("\n").every((line) => line.length <= 100), true, "wrapped lines fit 100");
}

{
  eq(formatJavaScript("const greet=(n)=>`hi ${n}`"), "const greet = (n) => `hi ${n}`;\n", "arrow and template");
  eq(formatJavaScript("const [a,...b]=xs"), "const [a, ...b] = xs;\n", "destructure rest");
  eq(formatJavaScript("x()??y"), "x() ?? y;\n", "nullish after call");
  eq(formatJavaScript("x?.y"), "x?.y;\n", "optional chaining");
}

{
  const n = parseJavaScript("'oops");
  eq(n.truncated, true, "unclosed string");
}

console.log("ok");
