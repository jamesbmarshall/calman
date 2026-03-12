# calman

A personal availability viewer. Fetches a live ICS calendar feed, computes free time slots within your working hours, and presents them on a clean, shareable web page.

Built for hosting at `cal.jamesbmarshall.com` but easily adaptable to any domain.

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

### Prerequisites

- A VPS (any Linux server) with **Docker** and **Docker Compose** installed
- A domain name you control (e.g. `jamesbmarshall.com`)
- SSH access to the VPS

### Step 1: Point your domain to the VPS

In your DNS provider (wherever you manage `jamesbmarshall.com`), add an **A record**:

| Type | Host | Value |
|---|---|---|
| A | `cal` | `<your VPS IP address>` |

This tells the internet that `cal.jamesbmarshall.com` points to your server. DNS changes can take a few minutes to propagate (sometimes up to an hour).

You can check if it's working with:

```bash
dig cal.jamesbmarshall.com
```

### Step 2: Clone the repo on your VPS

SSH into your VPS:

```bash
ssh your-user@your-vps-ip
```

Clone the repo:

```bash
git clone https://github.com/jamesbmarshall/calman.git
cd calman
```

### Step 3: Configure your ICS feed

Create a `.env` file in the calman directory:

```bash
nano .env
```

Add your ICS feed URL (and optionally override any other defaults):

```env
ICS_URL=https://outlook.office365.com/owa/calendar/your-calendar-id/reachcalendar.ics
```

Save and exit (`Ctrl+X`, then `Y`, then `Enter` in nano).

> **Important:** The `.env` file is in `.gitignore` so it won't be committed. This keeps your calendar URL private.

### Step 4: Update the domain in the Caddyfile

If you're using a different domain, edit `Caddyfile`:

```bash
nano Caddyfile
```

Replace `cal.jamesbmarshall.com` with your domain.

### Step 5: Open firewall ports

Your VPS needs ports 80 and 443 open for HTTP and HTTPS. How to do this depends on your provider:

```bash
# If using ufw (Ubuntu/Debian)
sudo ufw allow 80
sudo ufw allow 443
```

### Step 6: Start everything

```bash
docker compose up -d --build
```

This does three things:
- Builds the calman app into a Docker container
- Starts Caddy (the reverse proxy) which automatically gets an HTTPS certificate from Let's Encrypt
- Runs everything in the background (`-d`)

That's it. Visit `https://cal.jamesbmarshall.com` — it should be live.

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
Caddyfile              Reverse proxy config (auto-HTTPS)
Dockerfile             Container build (Node 22 Alpine)
docker-compose.yml     Orchestrates Caddy + calman
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

**Caddy won't start / no HTTPS**
- Make sure ports 80 and 443 are open on your VPS firewall
- Make sure the DNS A record is pointing to the correct IP: `dig cal.jamesbmarshall.com`
- Check Caddy logs: `docker compose logs caddy`

**Times look wrong**
- The server computes slots in its own timezone. If your VPS is in a different timezone to you, add `TZ=Europe/London` (or your timezone) to the calman environment in `docker-compose.yml`
- Visitors see times converted to *their* local timezone automatically

**No availability showing but calendar isn't full**
- Check your `WORK_START` / `WORK_END` / `WORK_DAYS` are set correctly
- The `BUFFER_MINUTES` setting shrinks available slots — a 30-minute gap between meetings with a 10-minute buffer becomes only 10 minutes of availability, which won't show for any duration filter
