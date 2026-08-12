import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

const MAX_BODY_BYTES = 256 * 1024;
const MAX_URL_LENGTH = 4096;
const API_RATE_LIMIT = 180;
const API_RATE_WINDOW_MS = 60_000;
const SCREENER_RATE_LIMIT = 8;
const SCREENER_RATE_WINDOW_MS = 5 * 60_000;
const AUTH_RATE_LIMIT = 30;
const AUTH_RATE_WINDOW_MS = 5 * 60_000;

interface RateBucket {
  count: number;
  startedAt: number;
}

const rateBuckets = new Map<string, RateBucket>();

function secureEqual(left: string, right: string): boolean {
  const leftDigest = createHash("sha256").update(left).digest();
  const rightDigest = createHash("sha256").update(right).digest();
  return timingSafeEqual(leftDigest, rightDigest);
}

function clientAddress(request: NextRequest): string {
  return (
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

function consumeRateLimit(key: string, limit: number, windowMs: number): number | null {
  const now = Date.now();
  if (rateBuckets.size > 10_000) {
    for (const [bucketKey, bucket] of rateBuckets) {
      if (now - bucket.startedAt >= Math.max(AUTH_RATE_WINDOW_MS, SCREENER_RATE_WINDOW_MS)) {
        rateBuckets.delete(bucketKey);
      }
    }
    if (rateBuckets.size > 10_000) rateBuckets.delete(rateBuckets.keys().next().value as string);
  }
  const current = rateBuckets.get(key);
  if (!current || now - current.startedAt >= windowMs) {
    rateBuckets.set(key, { count: 1, startedAt: now });
    return null;
  }

  current.count += 1;
  if (current.count <= limit) return null;
  return Math.max(1, Math.ceil((windowMs - (now - current.startedAt)) / 1000));
}

function jsonError(status: number, error: string, retryAfter?: number): NextResponse {
  const response = NextResponse.json({ ok: false, error }, { status });
  response.headers.set("Cache-Control", "no-store");
  if (retryAfter) response.headers.set("Retry-After", String(retryAfter));
  return response;
}

function parseBasicCredentials(request: NextRequest): { username: string; password: string } | null {
  const authorization = request.headers.get("authorization") || "";
  if (!authorization.startsWith("Basic ")) return null;

  try {
    const decoded = Buffer.from(authorization.slice(6), "base64").toString("utf8");
    const separator = decoded.indexOf(":");
    if (separator < 0) return null;
    return {
      username: decoded.slice(0, separator),
      password: decoded.slice(separator + 1),
    };
  } catch {
    return null;
  }
}

function applySecurityHeaders(response: NextResponse, request: NextRequest, nonce: string): NextResponse {
  const isDevelopment = process.env.NODE_ENV !== "production";
  const policy = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDevelopment ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "media-src 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "worker-src 'self' blob:",
  ].join("; ");

  response.headers.set("Content-Security-Policy", policy);
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), bluetooth=()");
  response.headers.set("Cross-Origin-Opener-Policy", "same-origin");
  response.headers.set("Cross-Origin-Resource-Policy", "same-origin");
  if (request.nextUrl.pathname.startsWith("/api/")) response.headers.set("Cache-Control", "no-store");
  if (!isDevelopment && process.env.VARLAB_WEB_PASSWORD) {
    response.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  return response;
}

export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const isDevelopment = process.env.NODE_ENV !== "production";
  const pathname = request.nextUrl.pathname;
  const webUsername = process.env.VARLAB_WEB_USERNAME || "";
  const webPassword = process.env.VARLAB_WEB_PASSWORD || "";
  const hasAnyWebCredential = Boolean(webUsername || webPassword);
  const webAuthenticationConfigured = Boolean(webUsername && webPassword);
  const railwayDeployment = Boolean(process.env.RAILWAY_ENVIRONMENT_ID);
  const desktopServerConfigured = Boolean(
    process.env.VARLAB_DESKTOP_SERVER === "1" && process.env.VARLAB_API_TOKEN
  );

  if (pathname === "/api/health") {
    if (railwayDeployment && !webAuthenticationConfigured) {
      return applySecurityHeaders(jsonError(503, "VaR Lab web authentication is not configured"), request, nonce);
    }
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-nonce", nonce);
    return applySecurityHeaders(NextResponse.next({ request: { headers: requestHeaders } }), request, nonce);
  }

  if (
    (hasAnyWebCredential && !webAuthenticationConfigured) ||
    (!isDevelopment && !webAuthenticationConfigured && !desktopServerConfigured)
  ) {
    return applySecurityHeaders(jsonError(503, "VaR Lab web authentication is not configured"), request, nonce);
  }

  const address = clientAddress(request);
  if (webAuthenticationConfigured) {
    const credentials = parseBasicCredentials(request);
    const usernameMatches = credentials ? secureEqual(credentials.username, webUsername) : false;
    const passwordMatches = credentials ? secureEqual(credentials.password, webPassword) : false;
    const authenticated = usernameMatches && passwordMatches;

    if (!authenticated) {
      const retryAfter = consumeRateLimit(`auth:${address}`, AUTH_RATE_LIMIT, AUTH_RATE_WINDOW_MS);
      if (retryAfter) {
        return applySecurityHeaders(jsonError(429, "Too many authentication attempts", retryAfter), request, nonce);
      }
      const response = jsonError(401, "Authentication required");
      response.headers.set("WWW-Authenticate", 'Basic realm="VaR Lab", charset="UTF-8"');
      return applySecurityHeaders(response, request, nonce);
    }
  }

  if (request.nextUrl.href.length > MAX_URL_LENGTH) {
    return applySecurityHeaders(jsonError(414, "Request URL is too long"), request, nonce);
  }

  if (pathname.startsWith("/api/")) {
    const isScreener = pathname === "/api/var/market-screener";
    const retryAfter = consumeRateLimit(
      `api:${isScreener ? "screener" : "general"}:${address}`,
      isScreener ? SCREENER_RATE_LIMIT : API_RATE_LIMIT,
      isScreener ? SCREENER_RATE_WINDOW_MS : API_RATE_WINDOW_MS,
    );
    if (retryAfter) {
      return applySecurityHeaders(jsonError(429, "Too many requests", retryAfter), request, nonce);
    }
  }

  const method = request.method.toUpperCase();
  if (webAuthenticationConfigured && !["GET", "HEAD", "OPTIONS"].includes(method)) {
    const origin = request.headers.get("origin");
    const fetchSite = request.headers.get("sec-fetch-site");
    const forwardedProtocol = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
    const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
    const expectedProtocol = forwardedProtocol || request.nextUrl.protocol.replace(":", "");
    const expectedHost = forwardedHost || request.headers.get("host");
    let trustedOrigin = "";
    if (["http", "https"].includes(expectedProtocol) && expectedHost && !/[\s/\\]/.test(expectedHost)) {
      trustedOrigin = `${expectedProtocol}://${expectedHost}`;
    }
    if (!origin || origin !== trustedOrigin || fetchSite === "cross-site") {
      return applySecurityHeaders(jsonError(403, "Invalid request origin"), request, nonce);
    }

    const contentLength = Number(request.headers.get("content-length") || 0);
    if (!Number.isFinite(contentLength) || contentLength < 0 || contentLength > MAX_BODY_BYTES) {
      return applySecurityHeaders(jsonError(413, "Request body is too large"), request, nonce);
    }
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  return applySecurityHeaders(response, request, nonce);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.png).*)"],
};
