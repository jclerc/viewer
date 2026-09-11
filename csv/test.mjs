import { parseCsv, detectDelimiter, serializeCsv, sortRows, compareCells } from "./parser.js";
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
  eq(hash.startsWith("gz|"), typeof CompressionStream === "function", "gzip when available");
  const got = await readHash(hash);
  eq(got.text, "{}", "gzip roundtrip");
  const legacy = await readHash("e30");
  eq(got.text, legacy.text, "legacy uncompressed hash");
}

console.log("ok");
