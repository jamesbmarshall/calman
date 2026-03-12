# calman

A personal availability viewer. Fetches a live ICS calendar feed, computes free time slots within your working hours, and presents them on a clean, shareable web page.

Built for self-hosting on any domain (e.g. `cal.yourdomain.com`).

## How it works

1. A visitor loads the page
2. The server fetches your ICS calendar feed (e.g. from Outlook or Google Calendar)
3. It calculates which time slots are **free** within your working hours for the next 30 days
4. The frontend displays those slots, grouped by day, with a toggle for minimum meeting duration (30 / 60 / 90 minutes)

The ICS feed is fetched **server-side** on every request, so availability is always up to date. Your ICS URL is never exposed to visitors.

## Quick start (local development)

```bash
# Install dependencies
npm install

# Run the server
ICS_URL="https://your-ics-feed-url" node server.js
```

Open http://localhost:3000 in your browser.

## Environment variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `ICS_URL` | **Yes** | — | The full URL of your ICS calendar feed |
| `WORK_START` | No | `10:00` | Start of your working hours (24h format, HH:MM) |
| `WORK_END` | No | `16:00` | End of your working hours (24h format, HH:MM) |
| `WORK_DAYS` | No | `1,2,3,4,5` | Which days you work (0 = Sunday, 1 = Monday, ..., 6 = Saturday) |
| `BUFFER_MINUTES` | No | `10` | Minutes of padding either side of each event — prevents back-to-back bookings |
| `DISPLAY_NAME` | No | (empty) | Your name — personalises the page title (e.g. "Look up James's availability"). If empty, shows "Look up my availability" |
| `PORT` | No | `3000` | Port the Node server listens on |

### Finding your ICS feed URL

**Outlook / Microsoft 365:**
1. Go to [Outlook on the web](https://outlook.office.com/calendar)
2. Settings → Calendar → Shared calendars
3. Under "Publish a calendar", select your calendar and choose "Can view all details"
4. Copy the **ICS** link (not the HTML one)

**Google Calendar:**
1. Go to [Google Calendar settings](https://calendar.google.com/calendar/r/settings)
2. Click on the calendar you want to share
3. Scroll to "Secret address in iCal format"
4. Copy the URL

## Deploying to your VPS

This assumes you already have a VPS with **Docker**, **Docker Compose**, and **Pangolin** configured as your reverse proxy (handling HTTPS automatically).

### Step 1: Clone the repo on your VPS

SSH into your VPS and clone the repo:

```bash
git clone https://github.com/your-username/calman.git
cd calman
```

### Step 2: Configure your ICS feed

Create a `.env` file:

```bash
nano .env
```

Add your ICS feed URL:

```env
ICS_URL=https://outlook.office365.com/owa/calendar/your-calendar-id/reachcalendar.ics
```

Save and exit (`Ctrl+X`, then `Y`, then `Enter`).

> **Important:** The `.env` file is in `.gitignore` so it won't be committed. This keeps your calendar URL private.

### Step 3: Start calman

```bash
docker compose up -d --build
```

Calman is now running on port 3000.

### Step 4: Add a site in Pangolin

1. Open your Pangolin dashboard
2. Add a new site:
   - **Domain:** `cal.yourdomain.com`
   - **Target:** `http://localhost:3000` (or `http://<calman-container-ip>:3000` if using Docker networks)
3. Pangolin handles HTTPS and certificate provisioning automatically

### Step 5: Add DNS record

In your DNS provider, add an **A record** (if you haven't already for Pangolin):

| Type | Host | Value |
|---|---|---|
| A | `cal` | `<your VPS IP address>` |

That's it. Visit `https://cal.yourdomain.com` — it should be live.

### Verifying it's working

```bash
# Check both containers are running
docker compose ps

# Check calman's logs
docker compose logs calman

# Check Caddy's logs (useful if HTTPS isn't working)
docker compose logs caddy

# Hit the health check endpoint
curl http://localhost:3000/health
```

## Updating

When you make changes and push them to GitHub:

```bash
ssh your-user@your-vps-ip
cd calman
git pull
docker compose up -d --build
```

## Customising working hours

All via environment variables in your `.env` file. Examples:

```env
# 9am to 5pm, Monday to Friday
WORK_START=09:00
WORK_END=17:00
WORK_DAYS=1,2,3,4,5

# Include Saturdays
WORK_DAYS=1,2,3,4,5,6

# 15-minute buffer instead of 10
BUFFER_MINUTES=15
```

After changing `.env`, restart:

```bash
docker compose up -d
```

## Architecture

```
Dockerfile             Container build (Node 22 Alpine)
docker-compose.yml     Runs calman (Pangolin handles reverse proxy externally)
server.js              Express app — routes and middleware
src/ics.js             Fetches and parses the ICS feed
src/availability.js    Computes free slots from busy blocks
public/index.html      Self-contained frontend (inline CSS + JS)
```

### API

| Endpoint | Description |
|---|---|
| `GET /` | Serves the frontend |
| `GET /api/availability?duration=30\|60\|90` | Returns free slots as JSON |
| `GET /health` | Health check (returns `{"status":"ok"}`) |

## Troubleshooting

**"Unable to fetch calendar data" on the page**
- Check that your `ICS_URL` is correct and accessible from the server: `docker compose exec calman wget -qO- "$ICS_URL" | head`
- Some ICS providers require the server's IP to not be blocked

**Site not loading / no HTTPS**
- Check the site is configured correctly in your Pangolin dashboard
- Make sure the DNS A record for `cal` points to your VPS IP: `dig cal.yourdomain.com`
- Check Pangolin's logs for errors

**Times look wrong**
- The server computes slots in its own timezone. If your VPS is in a different timezone to you, add `TZ=Europe/London` (or your timezone) to the calman environment in `docker-compose.yml`
- Visitors see times converted to *their* local timezone automatically

**No availability showing but calendar isn't full**
- Check your `WORK_START` / `WORK_END` / `WORK_DAYS` are set correctly
- The `BUFFER_MINUTES` setting shrinks available slots — a 30-minute gap between meetings with a 10-minute buffer becomes only 10 minutes of availability, which won't show for any duration filter
