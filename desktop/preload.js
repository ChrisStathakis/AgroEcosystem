// Minimal preload: keep node isolated from Django pages.
// Its only job beyond exposing `agro` is telling the main process which theme
// the page resolved (localStorage "agro-theme" / prefers-color-scheme), so the
// window can be coloured and shown without a flash.
const { contextBridge, ipcRenderer } = require("electron");

function currentTheme() {
  try {
    const t = document.documentElement && document.documentElement.getAttribute("data-bs-theme");
    if (t === "dark" || t === "light") return t;
    const stored = localStorage.getItem("agro-theme");
    return stored === "dark" || stored === "light" ? stored : null;
  } catch (e) {
    return null;
  }
}

function notify() {
  try {
    ipcRenderer.send("agro:theme", currentTheme());
  } catch (e) {}
}

function watch() {
  try {
    new MutationObserver(notify).observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-bs-theme"],
    });
  } catch (e) {}
}

// Preload runs before the page's own scripts; documentElement may not exist yet.
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    notify();
    watch();
  });
} else {
  notify();
  watch();
}
if (document.documentElement) notify();

contextBridge.exposeInMainWorld("agro", {
  platform: process.platform,
  version: "1.0.1",
});
