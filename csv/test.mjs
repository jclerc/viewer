import { parseCsv, detectDelimiter, serializeCsv, sortRows, filterRows, columnValues, compareCells } from "./parser.js";
import { detectKind, formatSpec, parseSpec, buildHash, readHash } from "../assets/common.js";

function eq(a, b, msg) {
  const left = JSON.stringify(a);
  const right = JSON.stringify(b);
  if (left !== right) throw new Error(`${msg}\n  got  ${left}\n  want ${right}`);
}

{
  const { rows, truncated } = parseCsv("a,b\nc,d\n");
  eq(rows, [["a", "b"], ["c", "d"]], "simple rows");
  eq(truncated, false, "complete");
}

{
  const { rows } = parseCsv('name,city\n"Hopper, Grace","Washington, DC"\n');
  eq(rows[1], ["Hopper, Grace", "Washington, DC"], "quoted commas");
}

{
  const { rows } = parseCsv('a,"b\nc",d\n');
  eq(rows, [["a", "b\nc", "d"]], "newline in quotes");
}

{
  const { rows, truncated } = parseCsv('a,"b');
  eq(rows[0][0], "a", "partial first field");
  eq(truncated, true, "unclosed quote");
}

{
  eq(detectDelimiter("a,b\nc,d"), ",", "comma");
  eq(detectDelimiter("a\tb\nc\td"), "\t", "tab");
  eq(detectDelimiter("a;b\nc;d"), ";", "semicolon");
}

{
  const rows = [
    ["name", "n"],
    ["Ada", "10"],
    ["Bea", "2"],
  ];
  eq(sortRows(rows, 1, 1, true), [["name", "n"], ["Bea", "2"], ["Ada", "10"]], "header stays, numeric asc");
  eq(sortRows(rows, 0, 1, false)[0][0], "Ada", "no header sorts first row");
  const cities = [
    ["city"],
    ["Paris"],
    ["Lyon"],
    ["Paris"],
  ];
  eq(columnValues(cities, 0, true), ["Lyon", "Paris"], "unique column values");
  eq(
    filterRows(cities, new Map([[0, new Set(["Paris"])]]), true),
    [["city"], ["Paris"], ["Paris"]],
    "filter keeps header",
  );
  eq(filterRows(cities, new Map([[0, new Set()]]), true), [["city"]], "empty selection hides data");
  eq(filterRows(cities, new Map(), true), cities, "no filter");
}

{
  eq(compareCells("10", "2") > 0, true, "numeric compare");
  eq(serializeCsv([["a", "b,c"]]), 'a,"b,c"', "serialize quotes");
  eq(serializeCsv([["a", "b"]], ";"), "a;b", "horizontal copy");
  eq(serializeCsv([["a"], ["b"]], ";"), "a\nb", "vertical copy");
  eq(serializeCsv([["a", "b"], ["c", "d"]], ","), "a,b\nc,d", "block copy");
}

{
  eq(detectKind('{"a":1}'), "json", "json object");
  eq(detectKind("// hi\n[1]"), "json", "jsonc");
  eq(detectKind("name,age\nAda,3"), "csv", "csv");
  eq(detectKind("# Title\nHello"), "md", "markdown");
  eq(detectKind("hello world"), "md", "prose is markdown");
  eq(detectKind("x", "notes.md"), "md", "extension wins");
  eq(detectKind("a,b", "data.json"), "json", "json extension wins");
  eq(detectKind("def foo():\n    return 1\n"), "py", "python def");
  eq(detectKind("from os import path\n"), "py", "python import");
  eq(detectKind("const x = 1;\n"), "js", "javascript const");
  eq(detectKind("function hello() {}\n"), "js", "javascript function");
  eq(detectKind("x", "app.py"), "py", "py extension wins");
  eq(detectKind("x", "app.js"), "js", "js extension wins");
  eq(detectKind("x", "app.jsx"), "js", "jsx extension wins");
  eq(detectKind("() => { return 1; }"), "js", "javascript arrow");
  eq(detectKind("x => y is a mapping"), "md", "arrow in prose stays markdown");
  eq(detectKind("# Title\n```python\ndef foo():\n    pass\n```\n"), "md", "fenced python stays markdown");
}

{
  eq(formatSpec({ kind: "cells", fromCol: 1, fromRow: 3, toCol: 1, toRow: 6 }), "B3:B6", "vertical cells");
  eq(formatSpec({ kind: "cells", fromCol: 1, fromRow: 3, toCol: 3, toRow: 3 }), "B3:D3", "horizontal cells");
  eq(formatSpec({ kind: "cells", fromCol: 0, fromRow: 1, toCol: 0, toRow: 1 }), "A1", "single cell");
  eq(formatSpec({ kind: "cells", fromCol: 26, fromRow: 10, toCol: 27, toRow: 12 }), "AA10:AB12", "double letters");
  eq(parseSpec("B3:B6"), { kind: "cells", fromCol: 1, fromRow: 3, toCol: 1, toRow: 6 }, "parse vertical");
  eq(parseSpec("D3:B3"), { kind: "cells", fromCol: 1, fromRow: 3, toCol: 3, toRow: 3 }, "normalize rectangle");
  eq(parseSpec("A1"), { kind: "cells", fromCol: 0, fromRow: 1, toCol: 0, toRow: 1 }, "parse single");
  eq(parseSpec("L3"), { kind: "lines", from: 3, to: 3 }, "L3 stays a line");
  eq(formatSpec({ kind: "cells", fromCol: 11, fromRow: 3, toCol: 11, toRow: 3 }), "L3:L3", "column L single cell");
  eq(parseSpec("L3:L3"), { kind: "cells", fromCol: 11, fromRow: 3, toCol: 11, toRow: 3 }, "parse L3:L3 as cells");
  eq(parseSpec("L3:L6"), { kind: "cells", fromCol: 11, fromRow: 3, toCol: 11, toRow: 6 }, "L column range");
  eq(parseSpec("L3-6"), { kind: "lines", from: 3, to: 6 }, "line range");
}

{
  const hash = await buildHash("{}", null);
  eq(hash.startsWith("gz:"), typeof CompressionStream === "function", "gzip when available");
  eq(hash.includes("|"), false, "no pipe in hash");
  const got = await readHash(hash);
  eq(got.text, "{}", "gzip roundtrip");
  const legacy = await readHash("e30");
  eq(got.text, legacy.text, "legacy uncompressed hash");
}

{
  const cells = { kind: "cells", fromCol: 1, fromRow: 3, toCol: 1, toRow: 6 };
  const hash = await buildHash("{}", cells, { nest: true, header: true });
  const got = await readHash(hash);
  eq(got.sel, cells, "cell spec with colons");
  eq(got.nest, true, "nest flag");
  eq(got.header, true, "header flag");
}

{
  const pipe = await readHash("e30|n1|B3:B6");
  eq(pipe.text, "{}", "pipe body");
  eq(pipe.nest, true, "pipe nest");
  eq(pipe.sel, { kind: "cells", fromCol: 1, fromRow: 3, toCol: 1, toRow: 6 }, "pipe spec");
  const encoded = await readHash("e30%7Cn1%7CB3:B6");
  eq(encoded.sel, pipe.sel, "percent-encoded pipe");
}

{
  const cells = { kind: "cells", fromCol: 1, fromRow: 3, toCol: 1, toRow: 6 };
  const hash = await buildHash("a,b\n", cells, {
    header: true,
    sort: { col: 1, dir: -1 },
    filters: { 0: ["Ada", "a:b,c"] },
  });
  const got = await readHash(hash);
  eq(got.text, "a,b\n", "view hash keeps text");
  eq(got.header, true, "view hash keeps header");
  eq(got.sort, { col: 1, dir: -1 }, "sort roundtrip");
  eq(got.filters, { 0: ["Ada", "a:b,c"] }, "filter roundtrip");
  eq(got.sel, cells, "cell spec survives sort and filters");
  const plain = await readHash(await buildHash("a", null, { header: false }));
  eq(plain.sort, null, "no sort when unset");
  eq(plain.filters, null, "no filters when unset");
}

console.log("ok");
