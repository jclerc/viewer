export const THEMES = ["light", "default", "dark"];
export const LS_THEME = "viewer.theme";
export const INPUT_DEBOUNCE_MS = 200;

export function ns(kind) {
  return {
    text: `viewer.${kind}.text`,
    wrap: `viewer.${kind}.wrap`,
    regex: `viewer.${kind}.regex`,
    nest: `viewer.${kind}.nest`,
    jq: `viewer.${kind}.jq`,
    jqOn: `viewer.${kind}.jq-on`,
    header: `viewer.${kind}.header`,
  };
}

export function migrateLegacyJson() {
  const pairs = [
    ["json-viewer.text", "viewer.json.text"],
    ["json-viewer.theme", "viewer.theme"],
    ["json-viewer.nest", "viewer.json.nest"],
    ["json-viewer.wrap", "viewer.json.wrap"],
    ["json-viewer.regex", "viewer.json.regex"],
    ["json-viewer.jq", "viewer.json.jq"],
    ["json-viewer.jq-on", "viewer.json.jq-on"],
  ];
  for (const [from, to] of pairs) {
    const value = localStorage.getItem(from);
    if (value != null && localStorage.getItem(to) == null) {
      localStorage.setItem(to, value);
    }
  }
}

export function sourceSize(text) {
  const chars = text.length;
  const lines = text.split(/\r\n|\n|\r/).length;
  return `${chars} char${chars === 1 ? "" : "s"} · ${lines} line${lines === 1 ? "" : "s"}`;
}

export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === "class") node.className = value;
    else if (value === false || value == null) continue;
    else if (value === true) node.setAttribute(key, "");
    else node.setAttribute(key, String(value));
  }
  for (const child of children) {
    if (child == null || child === false) continue;
    node.append(typeof child === "string" ? document.createTextNode(child) : child);
  }
  return node;
}

export function tok(cls, text) {
  return el("span", { class: cls }, text);
}

export function newLine(ctx, depth, parent) {
  ctx.line += 1;
  const n = ctx.line;
  const line = el("div", { class: "line", "data-line": String(n) });
  const gutter = el("button", {
    type: "button",
    class: "gutter",
    "data-line": String(n),
    "aria-label": `Select line ${n}`,
  });
  gutter.textContent = String(n);
  const foldSlot = el("span", { class: "fold-slot" });
  const content = el("span", { class: "content" });
  if (depth) content.append("  ".repeat(depth));
  line.append(gutter, foldSlot, content);
  parent.append(line);
  return { line, foldSlot, content, n };
}

export function foldButton() {
  return el("button", {
    type: "button",
    class: "fold",
    "aria-expanded": "true",
    "aria-label": "Collapse",
  });
}

export function toggleBlock(block) {
  setCollapsed(block, !block.classList.contains("is-collapsed"));
}

export function setCollapsed(block, collapsed) {
  block.classList.toggle("is-collapsed", collapsed);
  const btn = block.querySelector(":scope > .line .fold");
  if (btn) {
    btn.setAttribute("aria-expanded", String(!collapsed));
    btn.setAttribute("aria-label", collapsed ? "Expand" : "Collapse");
  }
}

export function setAllCollapsed(viewer, collapsed) {
  viewer.querySelectorAll(".block").forEach((block) => setCollapsed(block, collapsed));
}

export function truncMark(text = "Input ended here", title = "Input ended while parsing") {
  return errorMark(text, title);
}

export function errorMark(text, title) {
  return el("span", { class: "trunc", title }, text);
}

export function escapeRe(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function stripBom(text) {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

export function detectKind(text, filename = "") {
  const ext = String(filename).split(".").pop().toLowerCase();
  const byExt = {
    json: "json",
    jsonl: "json",
    jsonc: "json",
    md: "md",
    markdown: "md",
    mdown: "md",
    csv: "csv",
    tsv: "csv",
  };
  if (byExt[ext]) return byExt[ext];

  const raw = stripBom(String(text ?? ""));
  if (!raw.trim()) return null;
  if (looksLikeJson(raw)) return "json";
  if (looksLikeCsv(raw)) return "csv";
  return "md";
}

function looksLikeJson(text) {
  const t = stripJsoncLead(text);
  return t.startsWith("{") || t.startsWith("[");
}

function stripJsoncLead(text) {
  let i = 0;
  const n = text.length;
  while (i < n) {
    const c = text[i];
    if (c === " " || c === "\t" || c === "\n" || c === "\r") {
      i += 1;
      continue;
    }
    if (c === "/" && text[i + 1] === "/") {
      i += 2;
      while (i < n && text[i] !== "\n") i += 1;
      continue;
    }
    if (c === "/" && text[i + 1] === "*") {
      i += 2;
      while (i < n && !(text[i] === "*" && text[i + 1] === "/")) i += 1;
      i = Math.min(n, i + 2);
      continue;
    }
    break;
  }
  return text.slice(i);
}

function looksLikeCsv(text) {
  const lines = text
    .trim()
    .split(/\r\n|\n|\r/)
    .filter((line) => line.length);
  if (!lines.length) return false;
  if (looksLikeJson(text)) return false;

  for (const delim of ["\t", ",", ";"]) {
    const counts = lines.slice(0, 24).map((line) => naiveFieldCount(line, delim));
    const cols = counts[0];
    if (cols < 2) continue;
    const consistent = counts.filter((n) => n === cols).length >= Math.ceil(counts.length * 0.8);
    if (!consistent) continue;
    if (lines.length >= 2) return true;
    if (lines[0].includes(" ")) continue;
    if (cols >= 2) return true;
  }
  return false;
}

function naiveFieldCount(line, delim) {
  let n = 1;
  let quotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const c = line[i];
    if (c === '"') quotes = !quotes;
    else if (!quotes && c === delim) n += 1;
  }
  return n;
}

export function readTheme() {
  const stored = localStorage.getItem(LS_THEME);
  if (stored === "blue") {
    localStorage.setItem(LS_THEME, "default");
    return "default";
  }
  if (THEMES.includes(stored)) return stored;
  return "default";
}

export function applyTheme(theme, themeBtns = []) {
  const next = THEMES.includes(theme) ? theme : "default";
  document.documentElement.dataset.theme = next;
  themeBtns.forEach((btn) => {
    btn.classList.toggle("is-on", btn.dataset.theme === next);
    btn.setAttribute("aria-pressed", String(btn.dataset.theme === next));
  });
}

export function applyShortcutLabels() {
  const mac = /Mac|iPhone|iPad/.test(navigator.platform);
  const mod = mac ? "⌘ " : "Ctrl+";
  document.querySelectorAll("[data-shortcut]").forEach((node) => {
    node.textContent = `${mod}${node.dataset.shortcut}`;
  });
}

export function applyWrap(viewer, on) {
  viewer.classList.toggle("no-wrap", !on);
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.append(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
  }
}

export function formatSpec(spec) {
  if (spec.kind === "lines") {
    return spec.from === spec.to ? `L${spec.from}` : `L${spec.from}-${spec.to}`;
  }
  if (spec.fromLine === spec.toLine) {
    return `L${spec.fromLine}:${spec.fromCol}-${spec.toCol}`;
  }
  return `L${spec.fromLine}:${spec.fromCol}-${spec.toLine}:${spec.toCol}`;
}

export function parseSpec(spec) {
  if (!spec) return null;
  let m = /^L(\d+):(\d+)-(\d+):(\d+)$/.exec(spec);
  if (m) {
    return {
      kind: "cols",
      fromLine: Number(m[1]),
      fromCol: Number(m[2]),
      toLine: Number(m[3]),
      toCol: Number(m[4]),
    };
  }
  m = /^L(\d+):(\d+)-(\d+)$/.exec(spec);
  if (m) {
    return {
      kind: "cols",
      fromLine: Number(m[1]),
      fromCol: Number(m[2]),
      toLine: Number(m[1]),
      toCol: Number(m[3]),
    };
  }
  m = /^L(\d+)-(\d+)$/.exec(spec);
  if (m) {
    return { kind: "lines", from: Number(m[1]), to: Number(m[2]) };
  }
  m = /^L(\d+)$/.exec(spec);
  if (m) {
    const n = Number(m[1]);
    return { kind: "lines", from: n, to: n };
  }
  return null;
}

export function bytesToB64(bytes) {
  let bin = "";
  for (const byte of bytes) bin += String.fromCharCode(byte);
  return btoa(bin).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

export function b64ToBytes(b64) {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const bin = atob(b64.replaceAll("-", "+").replaceAll("_", "/") + pad);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

export async function gzipBytes(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function gunzipBytes(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new TextDecoder().decode(await new Response(stream).arrayBuffer());
}

export async function buildHash(text, spec, opts = {}) {
  let body;
  if (text.length > 1000) {
    body = `gz|${bytesToB64(await gzipBytes(new TextEncoder().encode(text)))}`;
  } else {
    body = bytesToB64(new TextEncoder().encode(text));
  }
  const extras = [];
  if (opts.nest != null) extras.push(opts.nest ? "n1" : "n0");
  if (opts.header != null) extras.push(opts.header ? "h1" : "h0");
  if (opts.jq) extras.push(`j${bytesToB64(new TextEncoder().encode(opts.jq))}`);
  if (spec) extras.push(formatSpec(spec));
  return extras.length ? `${body}|${extras.join("|")}` : body;
}

export async function readHash(hash) {
  let raw = hash.startsWith("#") ? hash.slice(1) : hash;
  if (!raw) return null;

  const gzipped = raw.startsWith("gz|");
  if (gzipped) raw = raw.slice(3);

  const bar = raw.indexOf("|");
  const b64 = bar === -1 ? raw : raw.slice(0, bar);
  const rest = bar === -1 ? "" : raw.slice(bar + 1);

  try {
    const bytes = b64ToBytes(b64);
    const text = gzipped ? await gunzipBytes(bytes) : new TextDecoder().decode(bytes);
    let nest = null;
    let header = null;
    let selRaw = "";
    let jq = null;
    for (const part of rest ? rest.split("|") : []) {
      if (part === "n0" || part === "n1") nest = part === "n1";
      else if (part === "h0" || part === "h1") header = part === "h1";
      else if (part.startsWith("j") && part.length > 1) {
        jq = new TextDecoder().decode(b64ToBytes(part.slice(1)));
      } else if (part) selRaw = part;
    }
    return { text, sel: parseSpec(selRaw), nest, jq, header };
  } catch {
    return null;
  }
}

export function saveText(kind, text) {
  localStorage.setItem(ns(kind).text, text);
}

export function mountViewer(options) {
  const {
    kind,
    copyToast,
    emptyMessage,
    extraInit,
    hashOpts,
    applyHashExtras,
    render: renderBody,
  } = options;

  migrateLegacyJson();

  const ls = ns(kind);
  const source = document.querySelector("#source");
  const sourceWrap = source.closest(".source-wrap");
  const viewer = document.querySelector("#viewer");
  const statusEl = document.querySelector("#status");
  const fileInput = document.querySelector("#file");
  const shareDialog = document.querySelector("#share-dialog");
  const shareUrl = document.querySelector("#share-url");
  const shareWarn = document.querySelector("#share-warn");
  const copyBtn = document.querySelector("#copy-btn");
  const selTip = document.querySelector("#sel-tip");
  const toastEl = document.querySelector("#toast");
  const expandBtn = document.querySelector("#expand-btn");
  const collapseBtn = document.querySelector("#collapse-btn");
  const shareBtn = document.querySelector("#share-btn");
  const fullscreenBtn = document.querySelector("#fullscreen-btn");
  const fsExitBtn = document.querySelector("#fs-exit-btn");
  const mobileLayout = matchMedia(
    "(max-width: 720px), (max-width: 960px) and (max-height: 500px)",
  );
  const searchInput = document.querySelector("#search-input");
  const searchBtn = document.querySelector("#search-btn");
  const searchCount = document.querySelector("#search-count");
  const jqInput = document.querySelector("#jq-input");
  const jqBtn = document.querySelector("#jq-btn");
  const jqMeta = document.querySelector("#jq-meta");
  const jqField = jqInput?.closest(".tool-field");
  const nestToggle = document.querySelector("#nest-toggle");
  const wrapToggle = document.querySelector("#wrap-toggle");
  const regexToggle = document.querySelector("#regex-toggle");
  const headerToggle = document.querySelector("#header-toggle");
  const themeBtns = [...document.querySelectorAll(".theme-row [data-theme]")];

  const ctx = { line: 0 };
  let lineSel = null;
  let lastClicked = null;
  let pendingSel = null;
  let lastTipSpec = null;
  let searchHits = [];
  let searchIndex = 0;
  let jqTimer = null;
  let searchTimer = null;
  let jqEnabled = true;
  let lastFormatted = "";
  let toastTimer = null;
  let dragDepth = 0;

  const api = {
    kind,
    ls,
    source,
    viewer,
    ctx,
    el,
    tok,
    newLine: (depth, parent) => newLine(ctx, depth, parent),
    foldButton,
    toggleBlock,
    setCollapsed,
    truncMark,
    errorMark,
    get nestOn() {
      return nestToggle ? nestToggle.checked : true;
    },
    get headerOn() {
      return headerToggle ? headerToggle.checked : true;
    },
    get jqEnabled() {
      return jqEnabled;
    },
    get jqFilter() {
      return jqInput?.value.trim() ?? "";
    },
    setJqGlobalError,
    sourceSize,
    resetSelection() {
      lineSel = null;
      lastClicked = null;
      pendingSel = null;
    },
  };

  init();

  function init() {
    applyTheme(readTheme(), themeBtns);
    if (nestToggle) nestToggle.checked = localStorage.getItem(ls.nest) !== "0";
    wrapToggle.checked = localStorage.getItem(ls.wrap) !== "0";
    regexToggle.checked = localStorage.getItem(ls.regex) !== "0";
    if (headerToggle) headerToggle.checked = localStorage.getItem(ls.header) !== "0";
    applyWrap(viewer, wrapToggle.checked);
    if (jqInput) applyJqOn(localStorage.getItem(ls.jqOn) !== "0");

    extraInit?.(api);

    bootFromHashOrStorage().then(() => {
      render();
      bind();
    });
  }

  async function bootFromHashOrStorage() {
    const fromHash = await readHash(location.hash);
    if (fromHash?.text) {
      source.value = fromHash.text;
      localStorage.setItem(ls.text, fromHash.text);
      applyHashExtras?.(fromHash, api);
      pendingSel = fromHash.sel;
      if (fromHash.jq != null && jqInput) {
        setJq(fromHash.jq);
        if (fromHash.jq) applyJqOn(true);
      }
      if (fromHash.nest != null && nestToggle) applyNest(fromHash.nest);
      if (fromHash.header != null && headerToggle) applyHeader(fromHash.header);
      return;
    }
    const saved = localStorage.getItem(ls.text);
    if (saved) source.value = saved;
    if (jqInput) {
      const savedJq = localStorage.getItem(ls.jq);
      if (savedJq) setJq(savedJq);
    }
  }

  function bind() {
    source.addEventListener("input", onSourceInput);
    document.querySelector("#example-link")?.addEventListener("click", onExample);
    document.querySelector("#upload-btn").addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", onFile);
    document.addEventListener("dragenter", onDragEnter);
    document.addEventListener("dragover", onDragOver);
    document.addEventListener("dragleave", onDragLeave);
    document.addEventListener("drop", onDrop);
    document.addEventListener("dragend", clearDropTarget);
    document.querySelector("#clear-btn").addEventListener("click", clearAll);
    expandBtn?.addEventListener("click", () => setAllCollapsed(viewer, false));
    collapseBtn?.addEventListener("click", () => setAllCollapsed(viewer, true));
    fullscreenBtn.addEventListener("click", toggleFullscreen);
    fsExitBtn.addEventListener("click", () => setLayoutFullscreen(false));
    document.addEventListener("fullscreenchange", syncFullscreenBtn);
    document.addEventListener("webkitfullscreenchange", syncFullscreenBtn);
    document.addEventListener("keydown", onLayoutFsKey);
    mobileLayout.addEventListener("change", () => {
      if (!mobileLayout.matches) setLayoutFullscreen(false);
    });
    shareBtn.addEventListener("click", () => openShare(currentLineSpec()));
    searchInput.addEventListener("input", onSearchInput);
    searchInput.addEventListener("keydown", onSearchKey);
    searchBtn.addEventListener("click", () => goSearch(1));
    regexToggle.addEventListener("change", onRegexToggle);
    if (jqInput) {
      jqInput.addEventListener("input", onJqInput);
      jqBtn.addEventListener("click", onJqToggle);
    }
    document.addEventListener("keydown", onToolShortcut);
    applyShortcutLabels();
    document.querySelector("#sel-share-btn").addEventListener("click", () => {
      hideTip();
      openShare(lastTipSpec);
    });
    copyBtn.addEventListener("click", copyShare);
    shareDialog.addEventListener("click", (e) => {
      const r = shareDialog.getBoundingClientRect();
      if (
        e.clientX < r.left ||
        e.clientX > r.right ||
        e.clientY < r.top ||
        e.clientY > r.bottom
      ) {
        shareDialog.close();
      }
    });
    nestToggle?.addEventListener("change", onNestToggle);
    headerToggle?.addEventListener("change", onHeaderToggle);
    wrapToggle.addEventListener("change", onWrapToggle);
    themeBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        localStorage.setItem(LS_THEME, btn.dataset.theme);
        applyTheme(btn.dataset.theme, themeBtns);
      });
    });
    viewer.addEventListener("mousedown", onViewerMouseDown);
    viewer.addEventListener("click", onViewerClick);
    viewer.addEventListener("scroll", hideTip);
    document.addEventListener("selectionchange", onSelChange);
    window.addEventListener("hashchange", onHashChange);
    shareUrl.addEventListener("focus", () => shareUrl.select());
  }

  function onNestToggle() {
    applyNest(nestToggle.checked);
    api.resetSelection();
    render();
  }

  function applyNest(on) {
    nestToggle.checked = on;
    localStorage.setItem(ls.nest, on ? "1" : "0");
  }

  function onHeaderToggle() {
    applyHeader(headerToggle.checked);
    api.resetSelection();
    render();
  }

  function applyHeader(on) {
    headerToggle.checked = on;
    localStorage.setItem(ls.header, on ? "1" : "0");
  }

  function onWrapToggle() {
    localStorage.setItem(ls.wrap, wrapToggle.checked ? "1" : "0");
    applyWrap(viewer, wrapToggle.checked);
  }

  function onRegexToggle() {
    localStorage.setItem(ls.regex, regexToggle.checked ? "1" : "0");
    applySearch({ reset: true });
  }

  function setJq(text) {
    clearTimeout(jqTimer);
    jqInput.value = text;
    localStorage.setItem(ls.jq, text);
  }

  function applyJqOn(on) {
    jqEnabled = on;
    jqBtn.setAttribute("aria-pressed", String(on));
    jqField.classList.toggle("is-jq-off", !on);
    localStorage.setItem(ls.jqOn, on ? "1" : "0");
  }

  function onJqToggle() {
    applyJqOn(!jqEnabled);
    api.resetSelection();
    render();
  }

  function setJqGlobalError(message) {
    if (!jqMeta) return;
    jqMeta.textContent = message;
    jqMeta.classList.toggle("is-error", Boolean(message));
    if (message) {
      jqInput.setAttribute("aria-invalid", "true");
      jqField.dataset.jqError = message;
    } else {
      jqInput.removeAttribute("aria-invalid");
      delete jqField.dataset.jqError;
    }
  }

  function onJqInput() {
    localStorage.setItem(ls.jq, jqInput.value);
    if (!jqEnabled) return;
    api.resetSelection();
    clearTimeout(jqTimer);
    jqTimer = setTimeout(render, INPUT_DEBOUNCE_MS);
  }

  function toggleFullscreen() {
    if (mobileLayout.matches) {
      setLayoutFullscreen(!isLayoutFullscreen());
      return;
    }
    if (fullscreenElement() === viewer) {
      const exit = document.exitFullscreen || document.webkitExitFullscreen;
      if (exit) exit.call(document);
      return;
    }
    const enter = viewer.requestFullscreen || viewer.webkitRequestFullscreen;
    if (enter) enter.call(viewer);
  }

  function isLayoutFullscreen() {
    return document.documentElement.classList.contains("is-fs");
  }

  function setLayoutFullscreen(on) {
    document.documentElement.classList.toggle("is-fs", on);
    syncFullscreenBtn();
  }

  function onLayoutFsKey(e) {
    if (e.key !== "Escape" || e.altKey || e.ctrlKey || e.metaKey) return;
    if (!isLayoutFullscreen()) return;
    e.preventDefault();
    setLayoutFullscreen(false);
  }

  function fullscreenElement() {
    return document.fullscreenElement || document.webkitFullscreenElement;
  }

  function syncFullscreenBtn() {
    const on = isLayoutFullscreen() || fullscreenElement() === viewer;
    const label = fullscreenBtn.querySelector("[data-label]");
    const icon = fullscreenBtn.querySelector("use");
    if (label) label.textContent = on ? "Exit fullscreen" : "Fullscreen";
    if (icon) icon.setAttribute("href", on ? "#g-exit-fs" : "#g-fullscreen");
  }

  function onSourceInput() {
    localStorage.setItem(ls.text, source.value);
    api.resetSelection();
    render();
  }

  async function onFile() {
    const file = fileInput.files?.[0];
    fileInput.value = "";
    if (file) await loadTextFile(file);
  }

  async function loadTextFile(file) {
    source.value = await file.text();
    onSourceInput();
  }

  function isFileDrag(e) {
    return Boolean(e.dataTransfer?.types && [...e.dataTransfer.types].includes("Files"));
  }

  function onDragEnter(e) {
    if (!isFileDrag(e)) return;
    e.preventDefault();
    dragDepth += 1;
    sourceWrap.classList.add("is-drop-target");
  }

  function onDragOver(e) {
    if (!isFileDrag(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  }

  function onDragLeave(e) {
    if (!isFileDrag(e)) return;
    dragDepth -= 1;
    if (dragDepth <= 0) clearDropTarget();
  }

  async function onDrop(e) {
    if (!isFileDrag(e)) return;
    e.preventDefault();
    clearDropTarget();
    const file = e.dataTransfer.files?.[0];
    if (file) await loadTextFile(file);
  }

  function clearDropTarget() {
    dragDepth = 0;
    sourceWrap.classList.remove("is-drop-target");
  }

  async function onExample(e) {
    e.preventDefault();
    const res = await fetch(e.currentTarget.href);
    if (!res.ok) return;
    source.value = await res.text();
    onSourceInput();
  }

  function clearAll() {
    source.value = "";
    localStorage.removeItem(ls.text);
    api.resetSelection();
    history.replaceState(null, "", location.pathname + location.search);
    render();
  }

  async function onHashChange() {
    const fromHash = await readHash(location.hash);
    if (!fromHash) return;

    let needRender = false;
    if (fromHash.nest != null && nestToggle && nestToggle.checked !== fromHash.nest) {
      applyNest(fromHash.nest);
      needRender = true;
    }
    if (fromHash.header != null && headerToggle && headerToggle.checked !== fromHash.header) {
      applyHeader(fromHash.header);
      needRender = true;
    }
    const hashJq = fromHash.jq ?? "";
    if (jqInput && jqInput.value !== hashJq) {
      setJq(hashJq);
      needRender = true;
    }
    if (fromHash.jq && jqInput && !jqEnabled) {
      applyJqOn(true);
      needRender = true;
    }
    if (applyHashExtras?.(fromHash, api)) needRender = true;
    if (fromHash.text !== source.value) {
      source.value = fromHash.text;
      localStorage.setItem(ls.text, fromHash.text);
      needRender = true;
    }
    if (needRender) {
      pendingSel = fromHash.sel;
      render();
      return;
    }
    if (fromHash.sel) applySelection(fromHash.sel);
  }

  function setToolbar({ has, sourceHas }) {
    if (expandBtn) expandBtn.disabled = !has;
    if (collapseBtn) collapseBtn.disabled = !has;
    shareBtn.disabled = !sourceHas;
    fullscreenBtn.disabled = !has;
  }

  function render() {
    hideTip();
    ctx.line = 0;
    const text = source.value;

    if (!text.trim()) {
      lastFormatted = "";
      statusEl.hidden = true;
      viewer.replaceChildren(el("p", { class: "empty" }, emptyMessage));
      setToolbar({ has: false, sourceHas: false });
      clearSearchMarks();
      return;
    }

    const result = renderBody(text, api) || {};
    lastFormatted = result.formatted ?? "";
    const has = Boolean(result.has);
    const sourceHas = result.sourceHas ?? has;
    setToolbar({ has, sourceHas });

    if (result.status != null) {
      statusEl.hidden = false;
      statusEl.className = result.truncated ? "status is-trunc" : "status";
      statusEl.textContent = result.status;
    } else {
      statusEl.hidden = true;
    }

    if (result.fragment) viewer.replaceChildren(result.fragment);
    else if (result.empty) viewer.replaceChildren(el("p", { class: "empty" }, result.empty));

    if (!has) {
      clearSearchMarks();
      return;
    }

    if (pendingSel) {
      const sel = pendingSel;
      pendingSel = null;
      requestAnimationFrame(() => {
        applySelection(sel);
        applySearch({ reset: true });
      });
    } else if (lineSel) {
      paintLineSel();
      applySearch({ reset: false });
    } else {
      applySearch({ reset: false });
    }
  }

  api.render = render;

  function onViewerMouseDown(e) {
    if (e.target.closest(".gutter")) e.preventDefault();
  }

  function onViewerClick(e) {
    const gutter = e.target.closest(".gutter");
    if (!gutter || !viewer.contains(gutter)) return;
    const n = Number(gutter.dataset.line);
    if (e.shiftKey && lastClicked != null) {
      lineSel = { from: Math.min(lastClicked, n), to: Math.max(lastClicked, n) };
    } else {
      lastClicked = n;
      lineSel = { from: n, to: n };
    }
    unwrapMarks();
    paintLineSel();
  }

  function paintLineSel() {
    viewer.querySelectorAll(".line.is-selected").forEach((node) => node.classList.remove("is-selected"));
    if (!lineSel) return;
    for (let i = lineSel.from; i <= lineSel.to; i += 1) {
      viewer.querySelector(`.line[data-line="${i}"]`)?.classList.add("is-selected");
    }
  }

  function currentLineSpec() {
    if (!lineSel) return null;
    return { kind: "lines", from: lineSel.from, to: lineSel.to };
  }

  function onSelChange() {
    const spec = selectionSpec();
    if (!spec) {
      hideTip();
      return;
    }
    lastTipSpec = spec;
    const sel = getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const rect = sel.getRangeAt(0).getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) {
      hideTip();
      return;
    }
    selTip.hidden = false;
    selTip.style.left = `${rect.left + rect.width / 2}px`;
    selTip.style.top = `${rect.top}px`;
  }

  function hideTip() {
    selTip.hidden = true;
  }

  function selectionSpec() {
    const sel = getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null;
    const range = sel.getRangeAt(0);
    if (!viewer.contains(range.commonAncestorContainer)) return null;

    const startLine = closestLine(range.startContainer);
    const endLine = closestLine(range.endContainer);
    if (!startLine || !endLine) return null;

    const fromLine = Number(startLine.dataset.line);
    const toLine = Number(endLine.dataset.line);
    const fromCol = offsetInContent(startLine, range.startContainer, range.startOffset) + 1;
    const toCol = offsetInContent(endLine, range.endContainer, range.endOffset);

    if (fromLine === toLine && fromCol > toCol) return null;
    if (toCol < 1 && fromLine === toLine) return null;

    return { kind: "cols", fromLine, fromCol, toLine, toCol: Math.max(toCol, fromCol) };
  }

  function closestLine(node) {
    if (node.nodeType === Node.ELEMENT_NODE) return node.closest(".line");
    return node.parentElement?.closest(".line") ?? null;
  }

  function offsetInContent(lineEl, node, offset) {
    const content = lineEl.querySelector(".content");
    if (!content.contains(node) && node !== content) {
      if (!content.contains(node.parentElement)) return 0;
    }
    const pre = document.createRange();
    pre.selectNodeContents(content);
    try {
      pre.setEnd(node, offset);
    } catch {
      return pre.toString().length;
    }
    return pre.toString().length;
  }

  function applySelection(sel) {
    unwrapMarks();
    if (sel.kind === "cols") {
      lineSel = {
        from: Math.min(sel.fromLine, sel.toLine),
        to: Math.max(sel.fromLine, sel.toLine),
      };
      lastClicked = sel.fromLine;
      paintLineSel();
      highlightCols(sel);
      viewer.querySelector(`.line[data-line="${sel.fromLine}"]`)?.scrollIntoView({ block: "center" });
      return;
    }
    if (sel.kind === "lines") {
      lineSel = { from: sel.from, to: sel.to };
      lastClicked = sel.from;
      paintLineSel();
      viewer.querySelector(`.line[data-line="${sel.from}"]`)?.scrollIntoView({ block: "center" });
    }
  }

  function highlightCols(sel) {
    if (sel.fromLine === sel.toLine) {
      const content = viewer.querySelector(`.line[data-line="${sel.fromLine}"] .content`);
      if (content) wrapRange(content, sel.fromCol - 1, sel.toCol);
      return;
    }

    const start = viewer.querySelector(`.line[data-line="${sel.fromLine}"] .content`);
    if (start) wrapRange(start, sel.fromCol - 1, start.textContent.length);

    for (let i = sel.fromLine + 1; i < sel.toLine; i += 1) {
      const mid = viewer.querySelector(`.line[data-line="${i}"] .content`);
      if (mid) wrapRange(mid, 0, mid.textContent.length);
    }

    const end = viewer.querySelector(`.line[data-line="${sel.toLine}"] .content`);
    if (end) wrapRange(end, 0, sel.toCol);
  }

  function contentTextNodes(contentEl, { skipTrunc = false } = {}) {
    const texts = [];
    const walker = document.createTreeWalker(contentEl, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      if (skipTrunc && walker.currentNode.parentElement?.closest(".trunc")) continue;
      texts.push(walker.currentNode);
    }
    return texts;
  }

  function wrapRange(contentEl, start0, end0, className = "col-hl") {
    wrapTextRange(contentTextNodes(contentEl), start0, end0, className);
  }

  function wrapTextRange(texts, start0, end0, className) {
    if (end0 <= start0) return;
    let pos = 0;
    for (const textNode of texts) {
      const len = textNode.textContent.length;
      const a = Math.max(0, start0 - pos);
      const b = Math.min(len, end0 - pos);
      if (a < b) {
        const range = document.createRange();
        range.setStart(textNode, a);
        range.setEnd(textNode, b);
        const mark = document.createElement("mark");
        mark.className = className;
        range.surroundContents(mark);
      }
      pos += len;
    }
  }

  function unwrapMarks() {
    viewer.querySelectorAll("mark.col-hl").forEach((mark) => {
      mark.replaceWith(...mark.childNodes);
    });
    viewer.normalize();
  }

  function onToolShortcut(e) {
    if (e.isComposing || e.altKey || e.shiftKey) return;
    if (!(e.metaKey || e.ctrlKey)) return;
    if (shareDialog.open) return;

    if (e.code === "KeyK" || (e.code === "KeyJ" && jqInput)) {
      e.preventDefault();
      const input = e.code === "KeyK" ? searchInput : jqInput;
      input.focus();
      input.select();
      return;
    }

    if (e.code !== "KeyC" || inTextField() || hasTextSelection() || !lastFormatted) return;

    e.preventDefault();
    copyFormatted();
  }

  function inTextField() {
    const node = document.activeElement;
    return node instanceof HTMLTextAreaElement || node instanceof HTMLInputElement;
  }

  function hasTextSelection() {
    const node = document.activeElement;
    if (node && node.selectionStart != null && node.selectionStart !== node.selectionEnd) return true;
    const sel = getSelection();
    return Boolean(sel && !sel.isCollapsed && sel.toString());
  }

  async function copyFormatted() {
    await copyText(lastFormatted);
    showToast(copyToast);
  }

  function showToast(message) {
    toastEl.textContent = message;
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toastEl.hidden = true;
    }, 1400);
  }

  function onSearchInput() {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => applySearch({ reset: true }), INPUT_DEBOUNCE_MS);
  }

  function onSearchKey(e) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    goSearch(e.shiftKey ? -1 : 1);
  }

  function goSearch(delta) {
    if (searchTimer) {
      applySearch({ reset: true });
      return;
    }
    stepSearch(delta);
  }

  function applySearch({ reset } = {}) {
    clearTimeout(searchTimer);
    searchTimer = null;
    clearSearchMarks();

    const query = searchInput.value;
    if (!query) {
      searchCount.textContent = "";
      searchCount.classList.remove("is-error");
      return;
    }

    let pattern;
    try {
      pattern = regexToggle.checked ? new RegExp(query, "g") : new RegExp(escapeRe(query), "g");
    } catch {
      searchCount.textContent = "Invalid regex";
      searchCount.classList.add("is-error");
      return;
    }

    searchCount.classList.remove("is-error");
    viewer.querySelectorAll(".line .content").forEach((content) => {
      const texts = contentTextNodes(content, { skipTrunc: true });
      const contentText = texts.map((node) => node.textContent).join("");
      const ranges = [];
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(contentText))) {
        if (!match[0].length) {
          pattern.lastIndex += 1;
          if (pattern.lastIndex > contentText.length) break;
          continue;
        }
        ranges.push([match.index, match.index + match[0].length]);
      }
      for (let i = ranges.length - 1; i >= 0; i -= 1) {
        wrapTextRange(texts, ranges[i][0], ranges[i][1], "search-hl");
      }
    });

    searchHits = [...viewer.querySelectorAll("mark.search-hl")];
    if (!searchHits.length) {
      searchCount.textContent = "0";
      return;
    }
    if (reset || searchIndex >= searchHits.length) searchIndex = 0;
    paintCurrentHit();
  }

  function stepSearch(delta) {
    if (!searchHits.length) return;
    searchIndex = (searchIndex + delta + searchHits.length) % searchHits.length;
    paintCurrentHit();
  }

  function paintCurrentHit() {
    searchHits.forEach((mark) => mark.classList.remove("is-current"));
    const mark = searchHits[searchIndex];
    if (!mark) return;
    mark.classList.add("is-current");
    expandAncestors(mark);
    mark.scrollIntoView({ block: "center" });
    searchCount.textContent = `${searchIndex + 1}/${searchHits.length}`;
  }

  function expandAncestors(node) {
    let current = node.parentElement;
    while (current && current !== viewer) {
      if (current.classList.contains("block") && current.classList.contains("is-collapsed")) {
        setCollapsed(current, false);
      }
      current = current.parentElement;
    }
  }

  function clearSearchMarks() {
    viewer.querySelectorAll("mark.search-hl").forEach((mark) => {
      mark.replaceWith(...mark.childNodes);
    });
    viewer.normalize();
    searchHits = [];
    searchCount.textContent = "";
    searchCount.classList.remove("is-error");
  }

  async function openShare(spec) {
    const hash = await buildHash(source.value, spec, hashOpts?.(api) ?? {});
    const url = `${location.origin}${location.pathname}${location.search}#${hash}`;
    shareUrl.value = url;
    document.querySelector("#share-label-text").textContent =
      `Link (${url.length} character${url.length === 1 ? "" : "s"})`;

    shareWarn.hidden = true;
    shareWarn.className = "warn";
    if (url.length > 10000) {
      shareWarn.hidden = false;
      shareWarn.className = "warn severe";
      shareWarn.textContent =
        "This link is very large and might not work in some browsers. You can still copy it.";
    } else if (url.length > 2000) {
      shareWarn.hidden = false;
      shareWarn.textContent = "This link is long and may not work in all browsers.";
    }

    setCopyLabel("Copy");
    shareDialog.showModal();
    shareUrl.focus();
    shareUrl.select();
  }

  async function copyShare() {
    await copyText(shareUrl.value);
    setCopyLabel("Copied");
    setTimeout(() => {
      setCopyLabel("Copy");
    }, 1400);
  }

  function setCopyLabel(text) {
    const label = copyBtn.querySelector("[data-label]");
    if (label) label.textContent = text;
  }
}
