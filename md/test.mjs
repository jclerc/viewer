import { inlineText, parseMarkdown, sectionEnd, slugify } from "./parser.js";
import { highlight } from "./highlight.js";

function eq(a, b, msg) {
  const left = JSON.stringify(a);
  const right = JSON.stringify(b);
  if (left !== right) throw new Error(`${msg}\n  got  ${left}\n  want ${right}`);
}

const blocks = (md) => parseMarkdown(md).blocks;
const inlines = (md) => blocks(md)[0].children;
const kinds = (nodes) => nodes.map((n) => n.type);

{
  const b = blocks("# Title\npara\n## Sub\nmore\n# Next\n");
  eq(kinds(b), ["heading", "paragraph", "heading", "paragraph", "heading"], "block kinds");
  eq(b.map((x) => x.line), [1, 2, 3, 4, 5], "source lines");
  eq(sectionEnd(b, 0), 4, "h1 section ends at next h1");
  eq(sectionEnd(b, 2), 4, "h2 section ends at next h1");
}

{
  const b = blocks("Title\n=====\n\nSub\n---\n");
  eq(b.map((x) => [x.type, x.level]), [["heading", 1], ["heading", 2]], "setext headings");
}

{
  eq(blocks("#foo\n")[0].type, "paragraph", "hash without space is not a heading");
  eq(blocks("## Hi ##\n")[0].text, "Hi", "closing hashes stripped");
}

{
  const { blocks: b, truncated } = parseMarkdown("```js\nconst x = 1;\n");
  eq([b[0].type, b[0].lang, b[0].text, b[0].closed], ["code", "js", "const x = 1;\n", false], "open fence");
  eq(truncated, true, "unclosed fence marks input as truncated");
  eq(parseMarkdown("```\nhi\n```\n").truncated, false, "closed fence");
  eq(blocks("    code\n")[0].text, "code\n", "indented code");
}

{
  eq(
    kinds(inlines("say **bold** and `code` and [a](https://x.test)")),
    ["text", "strong", "text", "code", "text", "link"],
    "inline kinds",
  );
  eq(kinds(inlines("*a **b** c*")[0].children), ["text", "strong", "text"], "nested emphasis");
  eq(inlines("foo*bar*")[1].type, "emph", "intraword star emphasis");
  eq(inlines("snake_case_name").length, 1, "intraword underscore stays text");
  eq(inlines("\\*not\\*")[0].text, "*not*", "backslash escapes");
  eq(inlines("&copy; &#65;")[0].text, "© A", "entities");
  eq(kinds(inlines("a  \nb")), ["text", "linebreak", "text"], "hard break");
  eq(kinds(inlines("a\nb")), ["text", "softbreak", "text"], "soft break");
}

{
  const link = inlines("[with `code` inside](/u \"T\")")[0];
  eq([link.href, link.title, kinds(link.children)], ["/u", "T", ["text", "code", "text"]], "code inside link");
  const ref = inlines("[x][Ref]\n\n[ref]: /target 'title'")[0];
  eq([ref.type, ref.href, ref.title], ["link", "/target", "title"], "reference link");
  eq(inlines("<https://a.b/c>")[0].href, "https://a.b/c", "angle autolink");
  const img = inlines("![alt *x*](/i.png){width=40}")[0];
  eq([img.type, img.alt, img.width], ["image", "alt x", "40"], "image alt and GitLab size");
}

{
  const nodes = inlines("see www.example.com, https://a.b/c?q=(1) or me@x.org.");
  const links = nodes.filter((n) => n.type === "link").map((n) => n.href);
  eq(links, ["http://www.example.com", "https://a.b/c?q=(1)", "mailto:me@x.org"], "extended autolinks");
}

{
  const list = blocks("- a\n- b\n  - c\n\n3. x\n4. y\n");
  eq([list[0].ordered, list[0].tight, list[0].children.length], [false, true, 2], "bullet list");
  eq(list[0].children[1].children[1].type, "list", "nested list");
  eq([list[1].ordered, list[1].start], [true, 3], "ordered start");
  eq(blocks("- a\n\n- b\n")[0].tight, false, "loose list");
  const tasks = blocks("- [x] done\n- [ ] todo\n- [~] skip\n")[0].children.map((i) => i.task);
  eq(tasks, ["x", " ", "~"], "task items");
}

{
  const quote = blocks("> a\nlazy\n> > b\n")[0];
  eq(quote.type, "blockquote", "blockquote");
  eq(inlineText(quote.children[0].children), "a lazy", "lazy continuation");
  const alert = blocks("> [!WARNING]\n> careful\n")[0];
  eq([alert.alert.kind, alert.children.length], ["warning", 1], "GitHub alert");
  eq(blocks("> [!note] Heads up\n> x\n")[0].alert.title, "Heads up", "GitLab alert title");
  const ml = blocks(">>>\none\n\ntwo\n>>>\n")[0];
  eq([ml.type, ml.multiline, ml.children.length], ["blockquote", true, 2], "GitLab multi-line quote");
}

{
  const t = blocks("| Name | Qty |\n| :--- | ---: |\n| pens | 2 |\n| a \\| b |\n")[0];
  eq(t.type, "table", "table");
  eq(t.align, ["left", "right"], "alignment");
  eq(t.head.map(inlineText), ["Name", "Qty"], "header cells");
  eq(t.rows.map((r) => r.map(inlineText)), [["pens", "2"], ["a | b", ""]], "body cells, escaped pipe, padding");
  eq(blocks("| a |\n| --- | --- |\n")[0].type, "paragraph", "mismatched delimiter is not a table");
}

{
  const doc = parseMarkdown("Text[^1] and[^n].\n\n[^1]: First.\n[^n]: Second.\n");
  eq(doc.footnotes.map((f) => [f.n, f.label]), [[1, "1"], [2, "n"]], "footnotes in reference order");
  eq(doc.blocks.length, 1, "footnote definitions leave the flow");
  eq(parseMarkdown("No[^x]\n").blocks[0].children.length, 1, "undefined footnote stays text");
}

{
  const doc = parseMarkdown("---\ntitle: x\n---\n# A\n[[_TOC_]]\n");
  eq(kinds(doc.blocks), ["frontmatter", "heading", "toc"], "front matter and TOC");
  eq(doc.blocks[0].format, "yaml", "front matter format");
  eq(doc.blocks[1].line, 4, "lines count front matter");
}

{
  eq(kinds(inlines("{+ add +} [- del -]")), ["ins", "text", "del"], "GitLab inline diff");
  eq(inlines("$`x^2`$ and $y$ but $5 and $6")[0], { type: "math", text: "x^2", display: false }, "math");
  eq(inlines("$5 and $6").length, 1, "dollar amounts are not math");
  eq(inlines("hi :tada:")[1], { type: "emoji", text: "🎉", name: "tada" }, "emoji");
  eq(kinds(inlines("~~gone~~ ~one~")), ["strike", "text", "strike"], "strikethrough");
}

{
  eq(slugify("Hello, World! `code`"), "hello-world-code", "GitHub slug");
  const ids = parseMarkdown("# A\n# A\n").headings.map((h) => h.id);
  eq(ids, ["a", "a-1"], "duplicate slugs");
}

{
  const cls = highlight('const x = "s"; // c', "javascript").map((t) => t.cls);
  eq(cls, ["kw", null, "str", null, "com"], "js highlight");
  eq(highlight("+a\n-b\n", "diff").map((t) => t.cls), ["ins", "del"], "diff highlight");
  eq(highlight("plain", "nope"), [{ cls: null, text: "plain" }], "unknown language stays plain");
}

console.log("ok");
