# Copilot Instructions for calman

## What is calman

A personal availability viewer hosted at cal.jamesbmarshall.com. It fetches a live ICS calendar feed server-side, computes free time slots within working hours, and presents them to visitors. No database — all state is derived from the ICS feed on each request.

## Running locally

```bash
# Install dependencies
npm install

# Run the server (ICS_URL is required)
ICS_URL="https://..." node server.js

# Or with Docker
docker compose up --build
```

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `ICS_URL` | (required) | Public ICS calendar feed URL |
| `WORK_START` | `10:00` | Working hours start (HH:MM) |
| `WORK_END` | `16:00` | Working hours end (HH:MM) |
| `WORK_DAYS` | `1,2,3,4,5` | Working days (0=Sun … 6=Sat) |
| `BUFFER_MINUTES` | `10` | Buffer either side of events to avoid back-to-back bookings |
| `PORT` | `3000` | Server listen port |

## Architecture

```
server.js              Express app — routes, middleware, startup
src/ics.js             Fetches + parses ICS feed into busy blocks
src/availability.js    Inverts busy blocks into free slots per day
public/index.html      Self-contained frontend (inline CSS + JS)
```

- `GET /` — serves the frontend
- `GET /api/availability?duration=30|60|90` — returns free slots JSON
- `GET /health` — health check for Docker

## Conventions

- No framework — vanilla Node/Express + plain HTML/CSS/JS
- All frontend code lives in one self-contained `public/index.html` (inline styles and scripts)
- Server-side ICS fetching keeps the feed URL private and avoids CORS issues
- Times are computed server-side in the server's timezone; the frontend reformats to the visitor's local timezone via `Intl.DateTimeFormat`
- `X-Robots-Tag: noindex, nofollow` header is set on all responses; the HTML also has a robots meta tag
