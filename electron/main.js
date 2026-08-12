const { app, BrowserWindow, dialog, session, utilityProcess } = require("electron");
const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const net = require("net");
const path = require("path");

const APP_NAME = "VaR Lab";
const STARTUP_TIMEOUT_MS = 45_000;
const MAX_LOG_BYTES = 1_000_000;
const MAX_LOG_FILES = 3;

app.setName(APP_NAME);
app.setPath("userData", path.join(app.getPath("appData"), APP_NAME));
app.enableSandbox();

let mainWindow = null;
let nextServer = null;
let serverUrl = null;
let serverToken = null;

function ensurePrivateDirectory(directory) {
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  fs.chmodSync(directory, 0o700);
}

function rotateLog(logPath) {
  try {
    if (!fs.existsSync(logPath) || fs.statSync(logPath).size < MAX_LOG_BYTES) return;
    for (let index = MAX_LOG_FILES - 1; index >= 1; index -= 1) {
      const source = `${logPath}.${index}`;
      const destination = `${logPath}.${index + 1}`;
      if (fs.existsSync(source)) fs.renameSync(source, destination);
    }
    fs.renameSync(logPath, `${logPath}.1`);
  } catch (error) {
    console.error("Unable to rotate the VaR Lab startup log:", error);
  }
}

function writeLog(message) {
  const line = `[${new Date().toISOString()}] ${message}`;
  console.log(line);

  try {
    const logDirectory = path.join(app.getPath("userData"), "logs");
    ensurePrivateDirectory(logDirectory);
    const logPath = path.join(logDirectory, "main.log");
    rotateLog(logPath);
    fs.appendFileSync(logPath, `${line}\n`, { mode: 0o600 });
    fs.chmodSync(logPath, 0o600);
  } catch (error) {
    console.error("Unable to write the VaR Lab startup log:", error);
  }
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : null;
      server.close((error) => {
        if (error) reject(error);
        else if (port) resolve(port);
        else reject(new Error("Could not allocate a local port"));
      });
    });
  });
}

function waitForServer(url, child) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + STARTUP_TIMEOUT_MS;
    let settled = false;

    const finish = (error) => {
      if (settled) return;
      settled = true;
      child.off("exit", onExit);
      child.off("error", onError);
      if (error) reject(error);
      else resolve();
    };

    const onExit = (code) => {
      finish(
        new Error(`The bundled web server exited before startup (code ${code}).`),
      );
    };

    const onError = (type, location, report) => {
      finish(new Error(`The bundled web server failed (${type}) at ${location}.\n${report}`));
    };

    const retry = () => {
      if (settled) return;
      if (Date.now() >= deadline) {
        finish(new Error(`The bundled web server did not start within ${STARTUP_TIMEOUT_MS / 1000} seconds.`));
      } else {
        setTimeout(probe, 250);
      }
    };

    const probe = () => {
      if (settled) return;
      const request = http.get(url, (response) => {
        response.resume();
        if (response.statusCode && response.statusCode < 500) finish();
        else retry();
      });

      request.setTimeout(1_000, () => request.destroy());
      request.on("error", retry);
    };

    child.once("exit", onExit);
    child.once("error", onError);
    probe();
  });
}

function ensureDatabase() {
  const dataDirectory = path.join(app.getPath("userData"), "data");
  const databasePath = path.join(dataDirectory, "custom.db");
  ensurePrivateDirectory(app.getPath("userData"));
  ensurePrivateDirectory(dataDirectory);

  if (!fs.existsSync(databasePath)) {
    const seedPath = app.isPackaged
      ? path.join(process.resourcesPath, "db", "seed.db")
      : path.join(__dirname, "..", "db", "seed.db");

    if (!fs.existsSync(seedPath)) {
      throw new Error(`The bundled database is missing: ${seedPath}`);
    }

    fs.copyFileSync(seedPath, databasePath);
    writeLog(`Created the writable database at ${databasePath}`);
  }

  fs.chmodSync(databasePath, 0o600);

  return databasePath;
}

async function startNextServer() {
  const port = await getFreePort();
  const host = "127.0.0.1";
  const projectDirectory = app.isPackaged
    ? path.join(process.resourcesPath, "app.asar")
    : path.join(__dirname, "..");
  const serverEntry = path.join(__dirname, "server.js");
  const databasePath = ensureDatabase();
  serverToken = crypto.randomBytes(32).toString("base64url");

  writeLog(`Starting the bundled web server at http://${host}:${port}`);
  nextServer = utilityProcess.fork(serverEntry, [projectDirectory, host, String(port)], {
    cwd: app.isPackaged ? process.resourcesPath : projectDirectory,
    serviceName: "VaR Lab Web Server",
    stdio: "pipe",
    env: {
      ...process.env,
      DATABASE_URL: `file:${databasePath}`,
      VARLAB_API_TOKEN: serverToken,
      VARLAB_DESKTOP_SERVER: "1",
      NODE_PATH: [
        app.isPackaged ? path.join(projectDirectory, "node_modules") : null,
        app.isPackaged ? path.join(process.resourcesPath, "node_modules") : null,
        process.env.NODE_PATH,
      ]
        .filter(Boolean)
        .join(path.delimiter),
      NODE_ENV: app.isPackaged ? "production" : "development",
    },
  });

  nextServer.stdout?.on("data", (data) => writeLog(`[server] ${data.toString().trim()}`));
  nextServer.stderr?.on("data", (data) => writeLog(`[server error] ${data.toString().trim()}`));

  serverUrl = `http://${host}:${port}`;
  await waitForServer(`${serverUrl}/__varlab_health`, nextServer);
  writeLog("The bundled web server is ready.");
}

async function createWindow() {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
    return;
  }

  if (!serverUrl) return;

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: APP_NAME,
    backgroundColor: "#020617",
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      webviewTag: false,
      devTools: !app.isPackaged,
    },
  });

  await mainWindow.webContents.session.cookies.set({
    url: serverUrl,
    name: "varlab_session",
    value: serverToken,
    httpOnly: true,
    secure: false,
    sameSite: "strict",
    path: "/",
  });

  const allowedOrigin = new URL(serverUrl).origin;
  mainWindow.webContents.on("will-navigate", (event, navigationUrl) => {
    try {
      if (new URL(navigationUrl).origin !== allowedOrigin) event.preventDefault();
    } catch {
      event.preventDefault();
    }
  });

  mainWindow.webContents.setWindowOpenHandler(() => {
    return { action: "deny" };
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  await mainWindow.loadURL(serverUrl);
  mainWindow.show();
  mainWindow.focus();
}

function stopNextServer() {
  if (nextServer && nextServer.pid) {
    writeLog("Stopping the bundled web server.");
    nextServer.kill();
  }
  nextServer = null;
  serverToken = null;
}

const hasSingleInstanceLock = app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    createWindow().catch((error) => writeLog(error.stack || error.message));
  });

  app.whenReady().then(async () => {
    try {
      session.defaultSession.setPermissionCheckHandler(() => false);
      session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
      await startNextServer();
      await createWindow();
    } catch (error) {
      const details = error.stack || error.message || String(error);
      writeLog(`[startup failure] ${details}`);
      dialog.showErrorBox(
        `${APP_NAME} could not start`,
        `${error.message}\n\nDetails were saved to:\n${path.join(app.getPath("userData"), "logs", "main.log")}`,
      );
      stopNextServer();
      app.quit();
    }
  });

  app.on("activate", () => {
    createWindow().catch((error) => writeLog(error.stack || error.message));
  });
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    stopNextServer();
    app.quit();
  }
});

app.on("before-quit", stopNextServer);
