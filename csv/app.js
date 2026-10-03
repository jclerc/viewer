import {
  parseCsv,
  detectDelimiter,
  serializeCsv,
  sortRows,
  filterRows,
  columnValues,
  compareCells,
} from "./parser.js";
import { mountViewer, tok, el } from "../assets/common.js";

let sortCol = null;
let sortDir = 1;
let filters = new Map();
let seenText = null;
let pinnedText;
let viewApi = null;
let headerRows = true;
let tableRows = [];
let openCol = null;
let viewEl = null;
let menu = null;
let searchInput = null;
let allInput = null;
let allText = null;
let anchorRow = null;
let valueList = null;

mountViewer({
  kind: "csv",
  copyToast: "csv copied ✓",
  emptyMessage: "Paste CSV on the left to view it here.",
  hashOpts: (api) => ({
    header: api.headerOn,
    sort: sortCol == null ? null : { col: sortCol, dir: sortDir },
    filters: filtersPayload(),
  }),
  applyHashExtras,
  afterRender,
  copyCells,
  extraInit(api) {
    viewEl = api.viewer;
    viewApi = api;
    api.viewer.classList.add("is-csv");
    buildMenu();

    let anchor = null;
    let dragging = false;
    let cellGesture = false;
    let rangeMode = false;

    function hitCell(clientX, clientY) {
      const elAt = document.elementFromPoint(clientX, clientY);
      const cell = elAt?.closest?.(".csv-cell");
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
      if (e.target.closest?.(".csv-filter")) return;
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

    document.addEventListener("pointerdown", (e) => {
      if (openCol == null) return;
      if (menu.contains(e.target)) return;
      if (e.target.closest?.(".csv-filter")) return;
      closeMenu();
    });

    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape" || openCol == null) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      closeMenu();
    });

    api.viewer.addEventListener(
      "scroll",
      () => {
        if (openCol == null) return;
        const btn = api.viewer.querySelector(`.csv-filter[data-col="${openCol}"]`);
        if (btn) placeMenu(btn);
      },
      { passive: true },
    );

    window.addEventListener("resize", () => {
      if (openCol == null) return;
      const btn = api.viewer.querySelector(`.csv-filter[data-col="${openCol}"]`);
      if (btn) placeMenu(btn);
    });

    api.viewer.addEventListener("click", (e) => {
      const filterBtn = e.target.closest?.(".csv-filter");
      if (filterBtn && api.viewer.contains(filterBtn)) {
        const col = Number(filterBtn.dataset.col);
        if (Number.isNaN(col)) return;
        if (openCol === col) closeMenu();
        else openMenu(col, filterBtn);
        return;
      }
      if (cellGesture) {
        cellGesture = false;
        return;
      }
      const cell = e.target.closest(".csv-cell.is-sort");
      if (!cell || !api.viewer.contains(cell)) return;
      const col = Number(cell.dataset.col);
      if (Number.isNaN(col)) return;
      if (sortCol !== col) {
        sortCol = col;
        sortDir = 1;
      } else if (sortDir === 1) {
        sortDir = -1;
      } else {
        sortCol = null;
        sortDir = 1;
      }
      api.resetSelection();
      api.render();
    });
  },
  render,
});

function render(text, api) {
  if (text === pinnedText) pinnedText = undefined;
  else if (text !== seenText) resetView();
  seenText = text;
  if (api.headerOn !== headerRows) closeMenu();
  headerRows = api.headerOn;

  const delimiter = detectDelimiter(text);
  const parsed = parseCsv(text, delimiter);
  const rows = parsed.rows;
  const has = rows.length > 0;
  const size = api.sourceSize(text);
  const trunc = parsed.truncated;
  const delimLabel = delimiter === "\t" ? "tab" : delimiter === ";" ? "semicolon" : "comma";

  if (!has) {
    tableRows = [];
    closeMenu();
    return {
      has: false,
      sourceHas: false,
      truncated: trunc,
      status: `${size} · Nothing could be parsed.`,
      empty: "Nothing could be parsed.",
    };
  }

  tableRows = rows;
  const cols = Math.max(...rows.map((row) => row.length));
  pruneFilters(cols);
  api.viewer.style.setProperty("--csv-cols", String(Math.max(cols, 1)));
  api.viewer.dataset.csvDelimiter = delimiter;

  const keepHead = api.headerOn;
  const filtered = filterRows(rows, filters, keepHead);
  let viewed = sortRows(filtered, sortCol, sortDir, keepHead);
  const totalData = rows.length - (keepHead ? 1 : 0);
  let shownData = filtered.length - (keepHead ? 1 : 0);
  if (!viewed.length) {
    viewed = [rows[0]];
    shownData = 0;
  }
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
        cell.title =
          sortCol !== c ? "Sort ascending" : sortDir === 1 ? "Sort descending" : "Clear sort";
        if (sortCol === c) cell.setAttribute("aria-sort", sortDir === 1 ? "ascending" : "descending");
        cell.append(filterButton(c, value));
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

  const shownNote = filters.size ? ` · ${shownData} of ${totalData} shown` : "";
  return {
    has: true,
    sourceHas: true,
    truncated: trunc,
    formatted: serializeCsv(filtered.length ? viewed : [], delimiter),
    fragment: root,
    status: `${size} · ${rows.length} row${rows.length === 1 ? "" : "s"} · ${cols} column${cols === 1 ? "" : "s"} · ${delimLabel}${shownNote}${trunc ? " · incomplete" : ""}`,
  };
}

function filterButton(col, name) {
  const active = filters.has(col);
  const btn = el("button", {
    type: "button",
    class: active ? "csv-filter is-on" : "csv-filter",
    "data-col": String(col),
    title: "Filter",
    "aria-label": `Filter ${name || "column"}`,
    "aria-expanded": "false",
    "aria-pressed": active ? "true" : "false",
  });
  btn.append(filterIcon());
  return btn;
}

function filterIcon() {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", "glyph");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("viewBox", "0 0 16 16");
  const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
  use.setAttribute("href", "#g-filter");
  svg.append(use);
  return svg;
}

function buildMenu() {
  searchInput = el("input", {
    type: "search",
    class: "csv-filter-search",
    placeholder: "Search",
    title: "Enter keeps only the matching values",
    "aria-label": "Search values",
    autocomplete: "off",
    spellcheck: "false",
  });
  allInput = el("input", { type: "checkbox" });
  allText = el("span", {}, "All");
  const allLabel = el("label", { class: "csv-filter-all" }, allInput, allText);
  valueList = el("div", { class: "csv-filter-list" });
  const mod = /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl";
  const hint = el(
    "p",
    { class: "csv-filter-hint" },
    "Click: only · ",
    el("kbd", {}, mod),
    " toggle · ",
    el("kbd", {}, "⇧"),
    " range",
  );
  menu = el(
    "div",
    { class: "csv-filter-pop", role: "dialog", "aria-label": "Filter column" },
    searchInput,
    allLabel,
    valueList,
    hint,
  );
  menu.hidden = true;
  document.body.append(menu);

  searchInput.addEventListener("input", applyQuery);
  searchInput.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      focusRow(visibleRows()[0]);
    } else if (e.key === "Enter" && searchInput.value.trim()) {
      e.preventDefault();
      const rows = new Set(visibleRows());
      if (!rows.size) return;
      for (const row of valueList.children) boxOf(row).checked = rows.has(row);
      commitList();
    }
  });
  allInput.addEventListener("change", () => {
    if (openCol == null) return;
    for (const row of visibleRows()) boxOf(row).checked = allInput.checked;
    commitList();
  });
  valueList.addEventListener("click", (e) => {
    const row = e.target.closest(".csv-filter-row");
    if (!row || openCol == null) return;
    const box = boxOf(row);
    if (e.target === box) {
      // The browser has already flipped the box; shift spreads its new state over the range.
      if (e.shiftKey && anchorRow) setRange(row, box.checked);
      else anchorRow = row;
      commitList();
      return;
    }
    if (e.target.closest(".csv-filter-name")) pick(row, e);
  });
  valueList.addEventListener("keydown", (e) => {
    const row = e.target.closest(".csv-filter-row");
    if (!row || openCol == null) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const rows = visibleRows();
      const next = rows[rows.indexOf(row) + (e.key === "ArrowDown" ? 1 : -1)];
      if (!next) {
        if (e.key === "ArrowUp") searchInput.focus();
        return;
      }
      focusRow(next);
      if (e.shiftKey) {
        boxOf(next).checked = boxOf(row).checked;
        anchorRow ??= row;
        commitList();
      }
      return;
    }
    // Handled here rather than via the button's click: clicks synthesized from
    // keys do not reliably carry modifiers across browsers.
    if (e.key === "Enter") {
      e.preventDefault();
      pick(row, e);
    } else if (e.key === " ") {
      e.preventDefault();
      pick(row, { shiftKey: e.shiftKey, metaKey: true });
    }
  });
  valueList.addEventListener("keyup", (e) => {
    if (e.key === " ") e.preventDefault();
  });
}

function pick(row, { shiftKey, ctrlKey, metaKey }) {
  const add = ctrlKey || metaKey;
  if (shiftKey && anchorRow) {
    if (!add) for (const other of valueList.children) boxOf(other).checked = false;
    setRange(row, true);
  } else if (add) {
    boxOf(row).checked = !boxOf(row).checked;
    anchorRow = row;
  } else {
    for (const other of valueList.children) boxOf(other).checked = other === row;
    anchorRow = row;
  }
  commitList();
}

// Ranges run over visible rows only, so a search narrows what shift sweeps.
function setRange(row, on) {
  const rows = visibleRows();
  const to = rows.indexOf(row);
  let from = rows.indexOf(anchorRow);
  if (from < 0) from = to;
  for (let i = Math.min(from, to); i <= Math.max(from, to); i += 1) boxOf(rows[i]).checked = on;
}

function focusRow(row) {
  row?.querySelector(".csv-filter-name").focus();
}

function boxOf(row) {
  return row.querySelector("input");
}

// The list holds one row per column value, so the filter is rebuilt from the
// boxes instead of patched; the boxes, "All" and the table cannot drift apart.
function commitList() {
  const set = new Set();
  for (const row of valueList.children) {
    if (boxOf(row).checked) set.add(row._value);
  }
  storeFilter(openCol, set);
  syncAllBox();
  rerender();
}

function openMenu(col, btn) {
  openCol = col;
  searchInput.value = "";
  allText.textContent = "All";
  buildList(col);
  menu.hidden = false;
  markOpen(btn);
  placeMenu(btn);
  searchInput.focus();
}

function closeMenu() {
  openCol = null;
  if (!menu) return;
  menu.hidden = true;
  viewEl?.querySelectorAll(".csv-filter.is-open").forEach((btn) => {
    btn.classList.remove("is-open");
    btn.setAttribute("aria-expanded", "false");
  });
}

function markOpen(btn) {
  btn.classList.add("is-open");
  btn.setAttribute("aria-expanded", "true");
}

function afterRender(api) {
  if (openCol == null) return;
  const btn = api.viewer.querySelector(`.csv-filter[data-col="${openCol}"]`);
  if (!btn) {
    closeMenu();
    return;
  }
  markOpen(btn);
  placeMenu(btn);
}

function placeMenu(btn) {
  if (!menu || menu.hidden) return;
  const rect = btn.getBoundingClientRect();
  const bounds = viewEl.getBoundingClientRect();
  const outside =
    rect.bottom < bounds.top ||
    rect.top > bounds.bottom ||
    rect.right < bounds.left ||
    rect.left > bounds.right;
  if (outside) {
    closeMenu();
    return;
  }
  const margin = 8;
  const width = menu.offsetWidth;
  const height = menu.offsetHeight;
  let left = Math.min(Math.max(margin, rect.left), window.innerWidth - width - margin);
  let top = rect.bottom + 4;
  if (top + height > window.innerHeight - margin && rect.top - height - 4 >= margin) {
    top = rect.top - height - 4;
  }
  menu.style.left = `${Math.round(left)}px`;
  menu.style.top = `${Math.round(top)}px`;
}

function buildList(col) {
  valueList.replaceChildren();
  anchorRow = null;
  const allowed = filters.get(col);
  for (const value of columnValues(tableRows, col, headerRows)) {
    const label = value === "" ? "(empty)" : value;
    const box = el("input", { type: "checkbox" });
    box.checked = !allowed || allowed.has(value);
    const name = el(
      "button",
      {
        type: "button",
        class: value === "" ? "csv-filter-name is-empty" : "csv-filter-name",
        title: label,
      },
      label,
    );
    const row = el("div", { class: "csv-filter-row" }, el("label", { class: "csv-filter-tick" }, box), name);
    row._value = value;
    row._label = label;
    valueList.append(row);
  }
  syncAllBox();
}

function applyQuery() {
  const q = searchInput.value.trim().toLowerCase();
  for (const row of valueList.children) {
    row.hidden = q !== "" && !row._label.toLowerCase().includes(q);
  }
  allText.textContent = q ? "All matching" : "All";
  syncAllBox();
}

function visibleRows() {
  return [...valueList.children].filter((row) => !row.hidden);
}

function syncAllBox() {
  const rows = visibleRows();
  const checked = rows.filter((row) => row.querySelector("input").checked).length;
  allInput.indeterminate = checked > 0 && checked < rows.length;
  allInput.checked = rows.length > 0 && checked === rows.length;
}

function storeFilter(col, set) {
  const values = columnValues(tableRows, col, headerRows);
  if (values.every((value) => set.has(value))) filters.delete(col);
  else filters.set(col, set);
}

function rerender() {
  viewApi.resetSelection();
  viewApi.render();
}

function applyHashExtras(fromHash) {
  pinnedText = fromHash.text ?? "";
  const nextCol = Number.isInteger(fromHash.sort?.col) ? fromHash.sort.col : null;
  const nextDir = fromHash.sort?.dir === -1 ? -1 : 1;
  const next = new Map();
  if (fromHash.filters && typeof fromHash.filters === "object" && !Array.isArray(fromHash.filters)) {
    for (const [key, values] of Object.entries(fromHash.filters)) {
      const col = Number(key);
      if (!Number.isInteger(col) || col < 0 || !Array.isArray(values)) continue;
      next.set(col, new Set(values.map((value) => String(value))));
    }
  }
  const changed = viewSig(sortCol, sortDir, filters) !== viewSig(nextCol, nextDir, next);
  sortCol = nextCol;
  sortDir = nextCol == null ? 1 : nextDir;
  filters = next;
  if (changed) closeMenu();
  return changed;
}

function viewSig(col, dir, selected) {
  const body = [...selected.keys()]
    .sort((a, b) => a - b)
    .map((key) => `${key}=${[...selected.get(key)].sort(compareCells).join("\0")}`)
    .join("|");
  return `${col ?? ""},${col == null ? "" : dir},${body}`;
}

function filtersPayload() {
  if (!filters.size) return null;
  const payload = {};
  for (const col of [...filters.keys()].sort((a, b) => a - b)) {
    payload[col] = [...filters.get(col)].sort(compareCells);
  }
  return payload;
}

function pruneFilters(colCount) {
  for (const [col, allowed] of [...filters]) {
    if (col < 0 || col >= colCount) {
      filters.delete(col);
      continue;
    }
    const values = columnValues(tableRows, col, headerRows);
    if (values.every((value) => allowed.has(value))) filters.delete(col);
  }
}

function resetView() {
  sortCol = null;
  sortDir = 1;
  filters = new Map();
  closeMenu();
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
    if (node.classList.contains("csv-sep") || node.classList.contains("trunc") || node.classList.contains("csv-filter")) {
      continue;
    }
    text += node.textContent;
  }
  return text;
}
