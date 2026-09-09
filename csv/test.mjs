import { parseCsv, detectDelimiter, serializeCsv, sortRows, compareCells } from "./parser.js";
import { detectKind } from "../assets/common.js";

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

console.log("ok");
