const { app, BrowserWindow, dialog } = require("electron");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const PORT = "3210";
let server;

function serverRoot() {
  return app.isPackaged
    ? path.join(process.resourcesPath, "app")
    : path.join(__dirname, "..", "dist");
}

function startServer() {
  const logPath = path.join(app.getPath("userData"), "desktop.log");
  const log = (chunk) => fs.appendFileSync(logPath, String(chunk));
  server = spawn(process.execPath, [path.join(serverRoot(), "server.js")], {
    cwd: app.getPath("userData"),
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      HOSTNAME: "127.0.0.1",
      PORT,
      NODE_ENV: "production",
      OFFLINE_DEFAULT: "1",
      CHAT_DISABLED: "1",
      APP_DATA_DIR: path.join(app.getPath("userData"), "data"),
      NODE_PATH: path.join(serverRoot(), "runtime"),
    },
    windowsHide: true,
  });
  server.stdout?.on("data", log);
  server.stderr?.on("data", log);
  server.on("error", (error) => {
    dialog.showErrorBox("황금연휴 캘린더를 열 수 없습니다", error.message);
  });
  server.on("exit", (code) => {
    if (code !== 0) {
      dialog.showErrorBox("황금연휴 캘린더를 열 수 없습니다", `내부 서버 종료 코드: ${code}\n로그: ${logPath}`);
    }
  });
}

async function waitForServer() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${PORT}/`);
      if (response.ok || response.status === 401) return;
    } catch {
      // The bundled Next server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("내부 서버가 시작되지 않았습니다.");
}

async function createWindow() {
  try {
    startServer();
    await waitForServer();
  } catch (error) {
    dialog.showErrorBox("황금연휴 캘린더를 열 수 없습니다", error.message);
    app.quit();
    return;
  }

  const window = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 960,
    minHeight: 700,
    autoHideMenuBar: true,
    backgroundColor: "#f7f7f4",
    icon: path.join(process.resourcesPath, "app", "public", "icon.png"),
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  await window.loadURL(`http://127.0.0.1:${PORT}`);
}

app.whenReady().then(createWindow);
app.on("window-all-closed", () => {
  if (server) server.kill();
  app.quit();
});
app.on("before-quit", () => {
  if (server) server.kill();
});