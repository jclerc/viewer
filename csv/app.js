import { parseCsv, detectDelimiter, serializeCsv, sortRows } from "./parser.js";
import { mountViewer, tok } from "../assets/common.js";

let sortCol = null;
let sortDir = 1;

mountViewer({
  kind: "csv",
  copyToast: "csv copied ✓",
  emptyMessage: "Paste CSV on the left to view it here.",
  hashOpts: (api) => ({ header: api.headerOn }),
  copyCells,
  extraInit(api) {
    api.viewer.classList.add("is-csv");
    api.source.addEventListener("input", () => {
      sortCol = null;
      sortDir = 1;
    });

    let anchor = null;
    let dragging = false;
    let cellGesture = false;
    let rangeMode = false;

    function hitCell(clientX, clientY) {
      const el = document.elementFromPoint(clientX, clientY);
      const cell = el?.closest?.(".csv-cell");
      if (!cell || !api.viewer.contains(cell)) return null;
      const line = cell.closest(".line");
      const col = Number(cell.dataset.col);
      const row = Number(line?.dataset.line);
      if (Number.isNaN(col) || Number.isNaN(row)) return null;
      return { cell, col, row };
    }

    function viewerTextSel() {
      const sel = getSelection();
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) return false;
      return api.viewer.contains(sel.getRangeAt(0).commonAncestorContainer);
    }

    api.viewer.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      const hit = hitCell(e.clientX, e.clientY);
      if (!hit) return;
      if (hit.cell.classList.contains("is-sort") && !e.shiftKey) return;
      dragging = true;
      rangeMode = false;
      if (e.shiftKey && anchor) {
        e.preventDefault();
        cellGesture = true;
        rangeMode = true;
        api.selectCells({ ...anchor, toRow: hit.row, toCol: hit.col });
      } else {
        anchor = { fromRow: hit.row, fromCol: hit.col };
      }
    });

    document.addEventListener("pointermove", (e) => {
      if (!dragging || !anchor) return;
      const hit = hitCell(e.clientX, e.clientY);
      if (!hit) return;
      if (hit.row === anchor.fromRow && hit.col === anchor.fromCol && !rangeMode) return;
      rangeMode = true;
      cellGesture = true;
      getSelection()?.removeAllRanges();
      api.selectCells({ ...anchor, toRow: hit.row, toCol: hit.col });
    });

    document.addEventListener("pointerup", () => {
      if (!dragging) return;
      dragging = false;
      if (rangeMode) {
        api.showCellTip();
        return;
      }
      if (viewerTextSel()) return;
      cellGesture = true;
      api.selectCells({ ...anchor, toRow: anchor.fromRow, toCol: anchor.fromCol });
      api.showCellTip();
    });

    api.viewer.addEventListener("click", (e) => {
      if (cellGesture) {
        cellGesture = false;
        return;
      }
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
  api.viewer.dataset.csvDelimiter = delimiter;

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
    if (trunc && index === viewed.length - 1) {
      (cells[cells.length - 1] ?? line.content).append(api.truncMark());
    }
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

function copyCells(sel, viewer) {
  const delimiter = viewer.dataset.csvDelimiter || ",";
  const rows = [];
  for (let row = sel.fromRow; row <= sel.toRow; row += 1) {
    const line = viewer.querySelector(`.line[data-line="${row}"]`);
    const cells = [];
    for (let col = sel.fromCol; col <= sel.toCol; col += 1) {
      cells.push(cellCopyText(line?.querySelector(`.csv-cell[data-col="${col}"]`)));
    }
    rows.push(cells);
  }
  return serializeCsv(rows, delimiter);
}

function cellCopyText(cell) {
  if (!cell) return "";
  let text = "";
  for (const node of cell.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      text += node.textContent;
      continue;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) continue;
    if (node.classList.contains("csv-sep") || node.classList.contains("trunc")) continue;
    text += node.textContent;
  }
  return text;
}
