const { app, BrowserWindow, dialog } = require("electron");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");

const isDev = !app.isPackaged;

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
  const args = [...candidate.args, "--port", "0", "--port-file", backendPortFile];
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
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true },
  });
  mainWindow.once("ready-to-show", () => mainWindow.show());
  mainWindow.loadURL(`http://127.0.0.1:${port}/`);
  if (isDev) {
    mainWindow.webContents.on("did-fail-load", (_e, code, desc, url) => {
      console.error(`[agro] load failed ${code} ${desc} ${url}`);
    });
  }
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
