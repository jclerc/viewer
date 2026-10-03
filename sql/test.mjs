import { formatSql, splitSql, tokenizeSql, viewSql } from "./parser.js";

function eq(a, b, msg) {
  const left = JSON.stringify(a);
  const right = JSON.stringify(b);
  if (left !== right) throw new Error(`${msg}\n  got  ${left}\n  want ${right}`);
}

function has(text, part, msg) {
  if (!text.includes(part)) throw new Error(`${msg}\n  missing ${JSON.stringify(part)}\n  in\n${text}`);
}

{
  const toks = tokenizeSql("select count(*), 'it''s', $1, @v from t -- c\n");
  const kinds = toks.map((t) => `${t.type}:${t.k || ""}`);
  eq(kinds[0], "word:kw", "keyword");
  eq(kinds[1], "word:fn", "function");
  eq(toks.find((t) => t.type === "string").value, "it''s", "doubled quote kept");
  eq(toks.filter((t) => t.type === "param").map((t) => t.value), ["$1", "@v"], "params");
  eq(toks.at(-1).type, "comment", "line comment");
}

{
  eq(
    formatSql("select a, b from t where x = 1 and y = 2"),
    "SELECT\n  a,\n  b\nFROM\n  t\nWHERE\n  x = 1\n  AND y = 2\n",
    "mozilla clause layout",
  );
}

{
  eq(formatSql("select 1;select 2;"), "SELECT\n  1;\n\nSELECT\n  2;\n", "statements split by blank line");
  eq(splitSql("select ';'; select 2"), ["select ';'", "select 2"], "semicolon in string");
}

{
  const out = formatSql("with a as (select 1) select * from a");
  has(out, "WITH a AS (\n  SELECT\n    1\n)\nSELECT", "cte layout");
}

{
  const out = formatSql("select * from t where id in (select id from u)");
  has(out, "id IN (\n    SELECT\n      id\n    FROM\n      u\n  )", "subquery broken");
}

{
  const out = formatSql("select case when a then 1 when b then 2 else 3 end as c from t");
  has(out, "  CASE\n    WHEN a THEN 1\n    WHEN b THEN 2\n    ELSE 3\n  END AS c", "case broken");
  has(formatSql("select case when a then 1 else 0 end from t"), "CASE WHEN a THEN 1 ELSE 0 END", "short case inline");
}

{
  const out = formatSql("select a from t left join u on u.id = t.id and u.x = 1");
  has(out, "LEFT JOIN\n  u\n  ON u.id = t.id\n  AND u.x = 1", "join layout");
}

{
  has(formatSql("select 1 from t where x between 1 and 2 and y"), "  x BETWEEN 1 AND 2\n  AND y", "between keeps its AND");
  has(formatSql("select a::int, b->>'k', -1, t.* from t"), "a::INT,\n  b ->> 'k',\n  -1,\n  t.*", "operators");
}

{
  const out = formatSql("create table t (id serial primary key, name text not null, created_at timestamp)");
  eq(
    out,
    "CREATE TABLE t (\n  id SERIAL PRIMARY KEY,\n  name TEXT NOT NULL,\n  created_at TIMESTAMP\n)\n",
    "create table columns one per line",
  );
}

{
  const out = formatSql("select name, type, date from t");
  has(out, "  name,\n  type,\n  date\n", "soft keywords stay identifiers in queries");
}

{
  const out = formatSql("create function f(a int) returns int language plpgsql as $$ begin if a > 0 then return a; end if; return 0; end; $$;");
  has(out, "RETURNS INT\nLANGUAGE plpgsql\nAS $$\n  BEGIN\n    IF a > 0 THEN\n      RETURN a;\n    END IF;", "plpgsql body");
  has(out, "  END;\n$$;", "body closed");
}

{
  const out = formatSql("DELIMITER //\nCREATE PROCEDURE p() BEGIN SELECT 1; SELECT 2; END//\nDELIMITER ;");
  has(out, "BEGIN\n  SELECT\n    1;\n  SELECT\n    2;\nEND//", "mysql delimiter");
}

{
  const out = formatSql("select a, -- note\n b from t");
  has(out, "  a, -- note\n  b\n", "trailing comment kept on its line");
  has(formatSql("select 1 -- end\n;"), "SELECT\n  1; -- end", "terminator before comment");
}

{
  const out = formatSql("COPY t (a) FROM stdin;\n1\n2\n\\.\n");
  has(out, "COPY t (a) FROM stdin;\n1\n2\n\\.", "copy data kept verbatim");
}

{
  const v = viewSql("select 'oops");
  eq(v.truncated, true, "unterminated string");
  eq(viewSql("select (1").truncated, true, "unclosed paren");
  eq(viewSql("select 1").truncated, false, "complete");
}

{
  const out = formatSql("select a from t where id in (1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27)");
  has(out, "id IN (\n    1, 2, 3,", "literal lists fill lines");
  eq(out.split("\n").every((line) => line.length <= 80), true, "fits 80 columns");
}

console.log("ok");
