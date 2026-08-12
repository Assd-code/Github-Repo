# Railway deployment

VaR Lab runs as a single authenticated Next.js service on Railway. The Electron
desktop wrapper is not used by the hosted service.

Required service variables:

- `DATABASE_URL=file:/data/varlab.db`
- `VARLAB_WEB_USERNAME`
- `VARLAB_WEB_PASSWORD` (use a long, random value)

Attach one persistent Railway volume at `/data`. Keep the service at one replica
while it uses SQLite. The start command applies the Prisma schema to the volume
before starting Next.js, and `/api/health` is the unauthenticated health check.

All application pages and business API routes require HTTP Basic authentication.
The web guard also applies request-rate limits, write-origin checks, body-size
limits, and production security headers. Do not publish a deployment without both
web credential variables.
