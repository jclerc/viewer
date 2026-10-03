import {
  detectKind,
  readTheme,
  applyTheme,
  LS_THEME,
  ns,
  applyShortcutLabels,
  migrateLegacyJson,
} from "./common.js";

const LABELS = { json: "JSON", md: "Markdown", csv: "CSV", py: "Python", js: "JavaScript", sql: "SQL" };

const source = document.querySelector("#source");
const sourceWrap = source.closest(".source-wrap");
const openBtn = document.querySelector("#open-btn");
const uploadBtn = document.querySelector("#upload-btn");
const fileInput = document.querySelector("#file");
const kindHint = document.querySelector("#kind-hint");
const statusEl = document.querySelector("#status");
const themeBtns = [...document.querySelectorAll(".theme-row [data-theme]")];

let dragDepth = 0;

migrateLegacyJson();
applyTheme(readTheme(), themeBtns);
applyShortcutLabels();
updateHint();

source.addEventListener("input", updateHint);
source.addEventListener("paste", () => {
  requestAnimationFrame(() => openNow(source.value));
});
source.addEventListener("keydown", (e) => {
  if (e.key !== "Enter" || !(e.metaKey || e.ctrlKey)) return;
  e.preventDefault();
  openNow(source.value);
});
openBtn.addEventListener("click", () => openNow(source.value));
uploadBtn.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", onFile);
document.addEventListener("dragenter", onDragEnter);
document.addEventListener("dragover", onDragOver);
document.addEventListener("dragleave", onDragLeave);
document.addEventListener("drop", onDrop);
document.addEventListener("dragend", clearDropTarget);
themeBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    localStorage.setItem(LS_THEME, btn.dataset.theme);
    applyTheme(btn.dataset.theme, themeBtns);
  });
});

function updateHint() {
  const kind = detectKind(source.value);
  kindHint.innerHTML = kind ? `Looks like <strong>${LABELS[kind]}</strong>` : "";
}

function setStatus(message) {
  statusEl.hidden = !message;
  statusEl.textContent = message || "";
  statusEl.className = message ? "status is-trunc" : "status";
}

function openNow(text, filename = "") {
  const kind = detectKind(text, filename);
  if (!kind) {
    setStatus("Paste or upload a file first.");
    return;
  }
  try {
    localStorage.setItem(ns(kind).text, text);
  } catch {
    setStatus("Could not save this file locally. It may be too large.");
    return;
  }
  location.href = `./${kind}/`;
}

async function onFile() {
  const file = fileInput.files?.[0];
  fileInput.value = "";
  if (!file) return;
  openNow(await file.text(), file.name);
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
  if (file) openNow(await file.text(), file.name);
}

function clearDropTarget() {
  dragDepth = 0;
  sourceWrap.classList.remove("is-drop-target");
}

const LANDING_TOKENS = [
  ["{", "--punct"],
  ["}", "--punct"],
  ["[", "--punct"],
  ["]", "--punct"],
  ['"id"', "--key"],
  ['"name"', "--key"],
  ['"ok"', "--str"],
  ["true", "--bool"],
  ["null", "--null"],
  ["12", "--num"],
  [":", "--punct"],
];

function initLandingFx() {
  const layer = document.querySelector(".landing-tokens");
  if (!layer) return;

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  let timer = 0;

  function paint() {
    layer.replaceChildren();
    const area = innerWidth * innerHeight;
    const count = reduced.matches
      ? Math.min(16, Math.max(8, Math.round(area / 56000)))
      : Math.min(32, Math.max(14, Math.round(area / 36000)));

    for (let i = 0; i < count; i++) {
      const [text, token] = LANDING_TOKENS[(Math.random() * LANDING_TOKENS.length) | 0];
      const el = document.createElement("span");
      el.className = "landing-token";
      el.textContent = text;
      el.style.left = `${Math.random() * 92}%`;
      el.style.top = `${Math.random() * 88}%`;
      el.style.color = `var(${token})`;
      el.style.opacity = `${0.1 + Math.random() * 0.18}`;
      el.style.fontSize = `${0.72 + Math.random() * 0.7}rem`;
      el.style.setProperty("--dx", `${(Math.random() - 0.5) * 90}px`);
      el.style.setProperty("--dy", `${(Math.random() - 0.5) * 70}px`);
      el.style.setProperty("--dur", `${12 + Math.random() * 16}s`);
      el.style.setProperty("--delay", `${-Math.random() * 18}s`);
      layer.append(el);
    }
  }

  function onPointer(e) {
    document.body.style.setProperty("--spot-x", `${e.clientX}px`);
    document.body.style.setProperty("--spot-y", `${e.clientY}px`);
  }

  paint();
  window.addEventListener("pointermove", onPointer, { passive: true });
  window.addEventListener("resize", () => {
    clearTimeout(timer);
    timer = setTimeout(paint, 120);
  });
}

initLandingFx();
