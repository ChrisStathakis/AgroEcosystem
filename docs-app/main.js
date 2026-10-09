const { app, BrowserWindow, protocol, net } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const isDev = !app.isPackaged;

// The docs origin behaves like https (DOM storage, fetch, workers).
protocol.registerSchemesAsPrivileged([
  { scheme: "app", privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

// Static Greek user guide (MkDocs, flat .html). In dev it reads the
// freshly built ../docs-site; packaged it ships as extraResource "docs".
function docsDir() {
  if (!isDev) return path.join(process.resourcesPath, "docs");
  return path.join(__dirname, "..", "docs-site");
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1100,
    height: 800,
    autoHideMenuBar: true,
    title: "AgroEcosystem — Οδηγός Χρήστη",
  });
  // Canonical root host "app": relative asset links resolve under
  // app://app/... so the handler maps them 1:1 to docs-site files.
  win.loadURL("app://app/index.html");
  return win;
}

let mainWindow = null;

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
  app.whenReady().then(() => {
    // Custom protocol so the Material theme (incl. its search worker)
    // works offline without file:// quirks. Canonical pages live under
    // the "app" root host (app://app/*.html); the bare app://page.html
    // form is also accepted for robustness.
    protocol.handle("app", (request) => {
      const url = new URL(request.url);
      const rootHost = url.hostname === "app" ? "" : url.hostname;
      const page = decodeURIComponent(url.pathname).replace(/^\/+/, "");
      let rel = rootHost ? (page ? `${rootHost}/${page}` : rootHost) : page;
      if (!rel || rel.endsWith("/")) rel += "index.html";
      const root = docsDir();
      let filePath = path.normalize(path.join(root, rel));
      if (!filePath.startsWith(root)) {
        return new Response("forbidden", { status: 403 });
      }
      try {
        if (fs.statSync(filePath).isDirectory()) filePath = path.join(filePath, "index.html");
      } catch {
        return new Response("not found", { status: 404 });
      }
      return net.fetch(pathToFileURL(filePath).toString());
    });
    mainWindow = createWindow();
  });
  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
}
