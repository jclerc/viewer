export function parseCsv(text, delimiter = ",") {
  const rows = [];
  let row = [];
  let field = "";
  let i = 0;
  let inQuotes = false;
  let truncated = false;
  const src = String(text ?? "");
  const n = src.length;

  const pushRow = () => {
    row.push(field);
    rows.push(row);
    row = [];
    field = "";
  };

  while (i < n) {
    const c = src[i];

    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += c;
      i += 1;
      continue;
    }

    if (c === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }

    if (c === delimiter) {
      row.push(field);
      field = "";
      i += 1;
      continue;
    }

    if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i += 1;
      pushRow();
      i += 1;
      continue;
    }

    field += c;
    i += 1;
  }

  if (inQuotes) truncated = true;

  if (field.length || row.length || (n > 0 && !src.endsWith("\n") && !src.endsWith("\r"))) {
    pushRow();
  } else if (!rows.length && n > 0) {
    pushRow();
  }

  return { rows, delimiter, truncated };
}

export function detectDelimiter(text) {
  const candidates = ["\t", ",", ";"];
  let best = ",";
  let bestScore = -1;

  for (const delimiter of candidates) {
    const { rows } = parseCsv(text, delimiter);
    if (!rows.length) continue;
    const cols = Math.max(...rows.map((row) => row.length));
    if (cols < 2) continue;
    const match = rows.filter((row) => row.length === cols).length;
    const score = match * 100 + cols;
    if (score > bestScore) {
      bestScore = score;
      best = delimiter;
    }
  }

  return best;
}

export function serializeCsv(rows, delimiter = ",") {
  return rows.map((row) => row.map((cell) => encodeField(cell, delimiter)).join(delimiter)).join("\n");
}

function encodeField(cell, delimiter) {
  const s = String(cell ?? "");
  if (s.includes('"') || s.includes("\n") || s.includes("\r") || s.includes(delimiter)) {
    return `"${s.replaceAll('"', '""')}"`;
  }
  return s;
}

export function compareCells(a, b) {
  const left = String(a ?? "");
  const right = String(b ?? "");
  const na = Number(left);
  const nb = Number(right);
  if (left !== "" && right !== "" && Number.isFinite(na) && Number.isFinite(nb)) {
    return na - nb;
  }
  return left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" });
}

export function sortRows(rows, col, dir, headerOn) {
  if (col == null || !rows.length) return rows;
  const start = headerOn ? 1 : 0;
  const head = headerOn ? rows.slice(0, 1) : [];
  const body = rows.slice(start).map((row, i) => ({ row, i }));
  body.sort((a, b) => {
    const cmp = compareCells(a.row[col], b.row[col]) * dir;
    return cmp !== 0 ? cmp : a.i - b.i;
  });
  return [...head, ...body.map((item) => item.row)];
}
