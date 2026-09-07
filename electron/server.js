const http = require("http");
const crypto = require("crypto");
const next = require("next");

const [projectDirectory, hostname, portValue] = process.argv.slice(2);
const port = Number(portValue);
const development = process.env.NODE_ENV !== "production";
const apiToken = process.env.VARLAB_API_TOKEN;
const expectedHost = `${hostname}:${port}`;
const expectedOrigin = `http://${expectedHost}`;
const MAX_BODY_BYTES = 256 * 1024;
const MAX_URL_LENGTH = 4096;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_REQUESTS = 600;
const rateLimits = new Map();

if (!projectDirectory || !hostname || !Number.isInteger(port) || !apiToken) {
  throw new Error("VaR Lab received invalid bundled-server startup arguments.");
}

function secureEqual(left, right) {
  const leftBuffer = Buffer.from(left || "");
  const rightBuffer = Buffer.from(right || "");
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function readCookie(request, name) {
  const cookies = String(request.headers.cookie || "").split(";");
  for (const cookie of cookies) {
    const separator = cookie.indexOf("=");
    if (separator === -1) continue;
    if (cookie.slice(0, separator).trim() === name) return cookie.slice(separator + 1).trim();
  }
  return "";
}

function reject(response, statusCode, message) {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify({ ok: false, error: message }));
}

function isRateLimited(request) {
  const key = request.socket.remoteAddress || "loopback";
  const now = Date.now();
  const current = rateLimits.get(key);
  if (!current || now - current.startedAt >= RATE_LIMIT_WINDOW_MS) {
    rateLimits.set(key, { startedAt: now, count: 1 });
    return false;
  }
  current.count += 1;
  return current.count > RATE_LIMIT_REQUESTS;
}

function applySecurityHeaders(request, response) {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), bluetooth=()");
  response.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  response.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  if (String(request.url || "").startsWith("/api/")) response.setHeader("Cache-Control", "no-store");
}

const nextApp = next({
  dev: development,
  dir: projectDirectory,
  hostname,
  port,
});
const handleRequest = nextApp.getRequestHandler();

async function start() {
  await nextApp.prepare();
  const server = http.createServer((request, response) => {
    applySecurityHeaders(request, response);

    if (request.headers.host !== expectedHost) {
      reject(response, 421, "Invalid local host");
      return;
    }
    if (!request.url || request.url.length > MAX_URL_LENGTH) {
      reject(response, 414, "Request URL is too long");
      return;
    }

    const requestUrl = new URL(request.url, expectedOrigin);
    if (requestUrl.pathname === "/__varlab_health") {
      response.statusCode = 204;
      response.end();
      return;
    }

    if (isRateLimited(request)) {
      response.setHeader("Retry-After", "60");
      reject(response, 429, "Too many requests");
      return;
    }

    const cookieToken = readCookie(request, "varlab_session");
    if (!secureEqual(cookieToken, apiToken)) {
      reject(response, 401, "Authentication required");
      return;
    }

    const method = String(request.method || "GET").toUpperCase();
    if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
      const origin = request.headers.origin;
      if (origin !== expectedOrigin) {
        reject(response, 403, "Invalid request origin");
        return;
      }
      const contentLength = Number(request.headers["content-length"] || 0);
      if (!Number.isFinite(contentLength) || contentLength < 0 || contentLength > MAX_BODY_BYTES) {
        reject(response, 413, "Request body is too large");
        return;
      }
    }

    const positions = requestUrl.searchParams.get("positions");
    if (positions && positions.split(",").length > 100) {
      reject(response, 400, "Too many portfolio positions");
      return;
    }
    const symbols = requestUrl.searchParams.get("symbols");
    if (symbols && symbols.split(",").length > 50) {
      reject(response, 400, "Too many market symbols");
      return;
    }

    handleRequest(request, response).catch((error) => {
      console.error(error instanceof Error ? error.message : "Request failed");
      if (!response.headersSent) response.statusCode = 500;
      response.end("Internal Server Error");
    });
  });

  server.listen(port, hostname, () => {
    console.log(`VaR Lab server ready at http://${hostname}:${port}`);
  });

  const shutdown = () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 5_000).unref();
  };

  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
}

start().catch((error) => {
  console.error(error);
  process.exit(1);
});
