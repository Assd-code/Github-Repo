const { app, BrowserWindow, shell } = require("electron");
const { spawn } = require("child_process");
const path = require("path");

let mainWindow = null;
let nextServer = null;

function startNextServer() {
  return new Promise((resolve) => {
    const cwd = app.isPackaged
      ? path.join(process.resourcesPath, "app")
      : __dirname;

    const cmd = process.platform === "win32" ? "npx.cmd" : "npx";
    nextServer = spawn(cmd, ["next", "start", "-p", "3000"], {
      cwd,
      stdio: "pipe",
      env: { ...process.env, NODE_OPTIONS: "--max-old-space-size=4096" },
    });

    nextServer.stdout.on("data", (data) => {
      const msg = data.toString();
      console.log("[next]", msg.trim());
      if (msg.includes("Ready") || msg.includes("started")) {
        resolve();
      }
    });

    nextServer.stderr.on("data", (data) => {
      console.error("[next err]", data.toString().trim());
    });

    setTimeout(resolve, 10000);
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: "VaR Lab",
    backgroundColor: "#020617",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
    show: false,
  });

  mainWindow.loadURL("http://localhost:3000");

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  const http = require("http");
  const checkServer = () =>
    new Promise((resolve) => {
      const req = http.get("http://localhost:3000", (res) => {
        resolve(res.statusCode === 200);
      });
      req.on("error", () => resolve(false));
      req.setTimeout(1000, () => {
        req.destroy();
        resolve(false);
      });
    });

  const serverRunning = await checkServer();
  if (!serverRunning) {
    console.log("Starting Next.js server...");
    await startNextServer();
    await new Promise((r) => setTimeout(r, 3000));
  }

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (nextServer) nextServer.kill();
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  if (nextServer) nextServer.kill();
});
