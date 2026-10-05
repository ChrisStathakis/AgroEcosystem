// Minimal preload: keep node isolated from Django pages.
const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("agro", {
  platform: process.platform,
  version: "1.0.0",
});
