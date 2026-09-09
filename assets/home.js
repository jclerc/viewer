import {
  detectKind,
  readTheme,
  applyTheme,
  LS_THEME,
  ns,
  applyShortcutLabels,
  migrateLegacyJson,
} from "./common.js";

const LABELS = { json: "JSON", md: "Markdown", csv: "CSV" };

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
