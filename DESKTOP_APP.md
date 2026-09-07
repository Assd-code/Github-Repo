# VaR Lab — Desktop App (Mac & Windows)

## Build Instructions

### Prerequisites
- Node.js 18+ and npm/bun installed
- Clone this repository

### Build the Desktop App

```bash
# Install dependencies
bun install

# Build for your platform (Mac or Windows)
bun run dist

# Or build for a specific platform:
bun run dist:mac    # Creates .dmg and .zip in /release/
bun run dist:win    # Creates .exe installer in /release/
```

### Run in Development (Electron + web)

```bash
# Start the web server
bun run dev

# In another terminal, launch Electron
bun run electron
```

### How It Works
1. The Next.js app builds to a production bundle (`.next/`)
2. Electron wraps the app and starts Next.js with its bundled Node runtime
3. The app selects a free localhost port and opens the Electron window only after the server is ready
4. When you quit the app, the server shuts down automatically

### Output
- **Mac**: `release/VaR Lab-1.0.0.dmg` (drag to Applications)
- **Windows**: `release/VaR Lab Setup 1.0.0.exe` (standard installer)

### Notes
- The app uses SQLite with a writable database stored under the user's VaR Lab application-data directory; the empty `db/seed.db` is copied only on first run
- Startup diagnostics are written to `VaR Lab/logs/main.log` in the user's application-data directory
- Market data is fetched from Yahoo Finance (free, no API key)
- The app runs fully offline once built (except for live market data fetching)
