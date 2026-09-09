import { parseCsv, detectDelimiter, serializeCsv, sortRows } from "./parser.js";
import { mountViewer, tok } from "../assets/common.js";

let sortCol = null;
let sortDir = 1;

mountViewer({
  kind: "csv",
  copyToast: "csv copied ✓",
  emptyMessage: "Paste CSV on the left to view it here.",
  hashOpts: (api) => ({ header: api.headerOn }),
  extraInit(api) {
    api.viewer.classList.add("is-csv");
    api.source.addEventListener("input", () => {
      sortCol = null;
      sortDir = 1;
    });
    api.viewer.addEventListener("click", (e) => {
      const cell = e.target.closest(".csv-cell.is-sort");
      if (!cell || !api.viewer.contains(cell)) return;
      const col = Number(cell.dataset.col);
      if (Number.isNaN(col)) return;
      if (sortCol === col) sortDir *= -1;
      else {
        sortCol = col;
        sortDir = 1;
      }
      api.resetSelection();
      api.render();
    });
  },
  render,
});

function render(text, api) {
  const delimiter = detectDelimiter(text);
  const parsed = parseCsv(text, delimiter);
  const rows = parsed.rows;
  const has = rows.length > 0;
  const size = api.sourceSize(text);
  const trunc = parsed.truncated;
  const delimLabel = delimiter === "\t" ? "tab" : delimiter === ";" ? "semicolon" : "comma";

  if (!has) {
    return {
      has: false,
      sourceHas: false,
      truncated: trunc,
      status: `${size} · Nothing could be parsed.`,
      empty: "Nothing could be parsed.",
    };
  }

  const cols = Math.max(...rows.map((row) => row.length));
  api.viewer.style.setProperty("--csv-cols", String(Math.max(cols, 1)));

  const viewed = sortRows(rows, sortCol, sortDir, api.headerOn);
  const root = document.createDocumentFragment();

  viewed.forEach((row, index) => {
    const isTop = index === 0;
    const line = api.newLine(0, root);
    if (isTop && api.headerOn) line.line.classList.add("is-header");
    const cells = [];
    for (let c = 0; c < cols; c += 1) {
      const value = row[c] ?? "";
      const cls = ["csv-cell"];
      if (isTop) cls.push("is-sort");
      if (isTop && sortCol === c) cls.push(sortDir === 1 ? "is-asc" : "is-desc");
      const cell = tok(cls.join(" "), value);
      cell.dataset.col = String(c);
      if (isTop) {
        cell.title = sortCol === c && sortDir === 1 ? "Sort descending" : "Sort ascending";
        if (sortCol === c) cell.setAttribute("aria-sort", sortDir === 1 ? "ascending" : "descending");
      }
      cells.push(cell);
    }
    cells.forEach((cell, i) => {
      if (i) cell.prepend(tok("csv-sep", "\t"));
      line.content.append(cell);
    });
    if (trunc && index === viewed.length - 1) line.content.append(api.truncMark());
  });

  return {
    has: true,
    sourceHas: true,
    truncated: trunc,
    formatted: serializeCsv(viewed, delimiter),
    fragment: root,
    status: `${size} · ${rows.length} row${rows.length === 1 ? "" : "s"} · ${cols} column${cols === 1 ? "" : "s"} · ${delimLabel}${trunc ? " · incomplete" : ""}`,
  };
}
