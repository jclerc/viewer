import { formatPython, parsePython, tokenizePython } from "./parser.js";

function eq(a, b, msg) {
  const left = JSON.stringify(a);
  const right = JSON.stringify(b);
  if (left !== right) throw new Error(`${msg}\n  got  ${left}\n  want ${right}`);
}

{
  const types = tokenizePython("def foo(x=1):\n    return x\n").map((t) => t.type);
  eq(types.includes("defname"), true, "def name token");
  eq(types.includes("keyword"), true, "keyword token");
}

{
  const n = parsePython("def foo():\n    return 1\n");
  eq(n.body[0].type, "compound", "def is compound");
  eq(n.body[0].body[0].type, "simple", "body simple");
}

{
  eq(formatPython("x=1"), "x = 1\n", "spaces around assign");
  eq(formatPython("x='hi'"), 'x = "hi"\n', "black double quotes");
  eq(formatPython('x="a\'b"'), 'x = "a\'b"\n', "keep double if single inside");
  eq(formatPython("x='a\"b'"), "x = 'a\"b'\n", "single when double inside");
}

{
  eq(
    formatPython("def f():\n  return 1\n"),
    "def f():\n    return 1\n",
    "four space indent",
  );
}

{
  const out = formatPython("def a():\n    pass\ndef b():\n    pass\n");
  eq(out.includes("pass\n\n\ndef b"), true, "two blank lines between top-level defs");
}

{
  eq(formatPython("f(a=1)"), "f(a=1)\n", "keyword arg equals");
  eq(formatPython("def f(a: int=1):\n    pass\n"), "def f(a: int = 1):\n    pass\n", "annotated default");
}

{
  eq(formatPython("if x: y\n"), "if x: y\n", "short if stays one line");
}

{
  eq(formatPython("@foo\ndef f():\n    pass\n"), "@foo\ndef f():\n    pass\n", "decorator glued");
}

{
  eq(
    formatPython("import sys, json\nfrom os.path import join, exists\nimport requests\n"),
    "import json\nfrom os.path import exists, join\nimport sys\n\nimport requests\n",
    "isort-style import sections",
  );
}

{
  const long = `x = "${"word ".repeat(20).trim()}"`;
  const out = formatPython(long);
  eq(out.includes("(\n"), true, "long string wraps in parens");
  eq(out.split("\n").every((line) => line.length <= 88), true, "wrapped lines fit 88");
}

{
  eq(formatPython("def f()->int:\n    return 1\n"), "def f() -> int:\n    return 1\n", "return annotation");
}

{
  eq(
    formatPython('class A:\n  """doc"""\n  x:int=1\n  def f(self)->str:\n    return "a"\n'),
    'class A:\n    """doc"""\n\n    x: int = 1\n\n    def f(self) -> str:\n        return "a"\n',
    "class docstring, attribute annotation, method return type",
  );
}

{
  const src = 'class A:\n  """hello\n\n  world\n  """\n  x=1\n';
  eq(
    formatPython(src),
    'class A:\n    """hello\n\n    world\n    """\n\n    x = 1\n',
    "multiline class docstring",
  );
}

{
  const n = parsePython("'oops");
  eq(n.truncated, true, "unclosed string");
}

console.log("ok");
