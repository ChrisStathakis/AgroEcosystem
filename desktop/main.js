const { app, BrowserWindow, dialog, ipcMain, nativeTheme } = require("electron");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");

const isDev = !app.isPackaged;

// Stable origin => localStorage (theme) survives restarts. If busy, the
// backend falls back to a free port and the theme resets for that launch only.
const PREFERRED_PORT = 8517;
const THEME_BG = { light: "#f6f5ef", dark: "#121a16" };
const SHOW_FALLBACK_MS = 3000;

let backend = null;
let mainWindow = null;
let backendPortFile = null;

function dataDir() {
  if (process.env.AGRO_DATA_DIR) return process.env.AGRO_DATA_DIR;
  if (process.platform === "win32") {
    return path.join(process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"), "AgroEcosystem");
  }
  return path.join(os.homedir(), ".agroecosystem");
}

function backendCandidates() {
  if (isDev) {
    // Dev: use system python + server sources.
    const serverDir = path.join(__dirname, "..", "server");
    return [{ cmd: "python", args: [path.join(serverDir, "run_desktop.py")], cwd: serverDir }];
  }
  // Prod: PyInstaller exe shipped as extraResource/backend/agro-server.exe
  const exe = path.join(process.resourcesPath, "backend", "agro-server.exe");
  return [{ cmd: exe, args: [], cwd: path.dirname(exe) }];
}

function waitForPortFile(file, timeoutMs = 15000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      try {
        const raw = fs.readFileSync(file, "utf-8").trim();
        const port = parseInt(raw, 10);
        if (port > 0) return resolve(port);
      } catch {}
      if (Date.now() - start > timeoutMs) return reject(new Error("backend port file timeout"));
      setTimeout(tick, 200);
    };
    tick();
  });
}

function waitForHttp(port, timeoutMs = 30000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tryOnce = () => {
      const socket = net.connect(port, "127.0.0.1", () => {
        socket.end();
        resolve(true);
      });
      socket.on("error", () => {
        socket.destroy();
        if (Date.now() - start > timeoutMs) return reject(new Error("backend http timeout"));
        setTimeout(tryOnce, 400);
      });
    };
    tryOnce();
  });
}

function startBackend() {
  const [candidate] = backendCandidates();
  backendPortFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "agro-")), "port.txt");
  const args = [...candidate.args, "--port", String(PREFERRED_PORT), "--port-file", backendPortFile];
  console.log(`[agro] spawning backend: ${candidate.cmd} ${args.join(" ")}`);
  backend = spawn(candidate.cmd, args, {
    cwd: candidate.cwd,
    env: { ...process.env, AGRO_DATA_DIR: dataDir() },
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  backend.stdout.on("data", (d) => console.log(`[backend] ${d}`.trimEnd()));
  backend.stderr.on("data", (d) => console.error(`[backend] ${d}`.trimEnd()));
  backend.on("exit", (code) => console.log(`[agro] backend exited: ${code}`));
}

function createWindows(port) {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    autoHideMenuBar: true,
    show: false,
    backgroundColor: THEME_BG.light,
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true },
  });

  // Stay hidden until we know the page's theme, so the window never flashes
  // the wrong colour before the (possibly dark) page paints.
  let shown = false;
  const reveal = (theme) => {
    if (theme === "dark" || theme === "light") {
      try {
        mainWindow.setBackgroundColor(THEME_BG[theme]);
        nativeTheme.themeSource = theme;
      } catch {}
      console.log(`[agro] theme: ${theme}`);
    }
    if (!shown && mainWindow && !mainWindow.isDestroyed()) {
      shown = true;
      mainWindow.show();
    }
  };

  // preload.js reports the resolved theme over IPC as soon as it runs.
  ipcMain.removeAllListeners("agro:theme");
  ipcMain.on("agro:theme", (_event, theme) => reveal(theme));

  // Belt and braces: ask the page directly once the DOM exists (its inline
  // script already applied localStorage/prefers-color-scheme), then show.
  mainWindow.webContents.on("dom-ready", () => {
    mainWindow.webContents
      .executeJavaScript(
        `(function(){try{return document.documentElement.getAttribute("data-bs-theme")}catch(e){return null}})()`
      )
      .then(reveal)
      .catch(() => reveal(null));
  });

  // Never hang on a hidden window if neither path reports a theme.
  setTimeout(() => reveal(null), SHOW_FALLBACK_MS);

  mainWindow.loadURL(`http://127.0.0.1:${port}/`);
  mainWindow.webContents.on("did-fail-load", (_e, code, desc, url) => {
    console.error(`[agro] load failed ${code} ${desc} ${url}`);
  });
}

function showFatal(message) {
  dialog.showErrorBox("AgroEcosystem failed to start", `${message}\n\nLogs: ${path.join(dataDir(), "django.log")}`);
}

async function boot() {
  // Splash while backend warms up.
  const splash = new BrowserWindow({ width: 420, height: 280, frame: false, alwaysOnTop: true });
  splash.loadFile(path.join(__dirname, "splash.html"));
  try {
    startBackend();
    const port = await waitForPortFile(backendPortFile);
    await waitForHttp(port);
    createWindows(port);
    splash.close();
  } catch (err) {
    console.error("[agro] boot failed:", err);
    splash.close();
    showFatal(String(err && err.message ? err.message : err));
    app.quit();
  }
}

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
  app.whenReady().then(boot);
  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
  app.on("will-quit", () => {
    if (backend) {
      try {
        backend.kill();
      } catch {}
      backend = null;
    }
  });
}
