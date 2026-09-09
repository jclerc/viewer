import { parseMarkdown, sectionEnd, tokenizeInline } from "./parser.js";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function eq(a, b, msg) {
  const left = JSON.stringify(a);
  const right = JSON.stringify(b);
  if (left !== right) throw new Error(`${msg}\n  got  ${left}\n  want ${right}`);
}

{
  const { lines } = parseMarkdown("# Title\npara\n## Sub\nmore\n# Next\n");
  eq(lines[0].kind, "heading", "h1 kind");
  eq(lines[0].level, 1, "h1 level");
  eq(lines[2].level, 2, "h2 level");
  eq(sectionEnd(lines, 0), 4, "h1 section ends at next h1");
  eq(sectionEnd(lines, 2), 4, "h2 section ends at next h1");
}

{
  const { lines } = parseMarkdown("## Only\nbody\n");
  eq(sectionEnd(lines, 0), 3, "h2 to eof");
}

{
  const { lines, truncated } = parseMarkdown("```js\nconst x = 1;\n");
  eq(lines[0].kind, "fence-start", "fence opens");
  eq(lines[1].kind, "code", "fence body");
  eq(truncated, true, "unclosed fence");
}

{
  const { lines, truncated } = parseMarkdown("```\nhi\n```\n");
  eq(truncated, false, "closed fence");
  eq(lines[2].kind, "fence-end", "fence closes");
}

{
  const tokens = tokenizeInline("say **bold** and `code` and [a](https://x.test)");
  eq(
    tokens.map((t) => t.kind),
    ["text", "strong", "text", "code", "text", "link"],
    "inline kinds",
  );
  eq(tokens[1].text, "bold", "strong text");
  eq(tokens[5].url, "https://x.test", "link url");
}

{
  const { lines } = parseMarkdown("#foo\n");
  eq(lines[0].kind, "text", "hash without space is not a heading");
}

console.log("ok");
