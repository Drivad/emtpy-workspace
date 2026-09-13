# Health Strategy

A self-hosted web app that pulls your health data into one place — Apple Health
(which is where MyFitnessPal, Trainiac and Garmin's own app usually end up
syncing to on iOS), plus a direct Garmin Connect sync — and asks Claude for a
daily, specific briefing instead of generic advice.

## Why it's built this way

None of MyFitnessPal, Trainiac or Garmin have a public API for personal use,
so this app leans on the one place iOS health apps already tend to converge:

- **Apple Health** is the aggregation point for MyFitnessPal, Trainiac and
  Garmin Connect *if* you've enabled "Sync to Apple Health" in each app's
  settings. MyFitnessPal specifically syncs calories consumed and macros
  (protein/carbs/fat) this way — enable it under MyFitnessPal → More → Apps →
  Apple Health. You export it from the Health app and upload the file here.
- **Garmin Connect** is also synced directly, since Apple Health doesn't carry
  everything Garmin tracks (HRV, stress, body battery). This uses the
  well-known unofficial `garmin-connect` npm package — Garmin has no personal-use
  official API, so this is what nearly every personal Garmin project does. It's
  not sanctioned by Garmin and could break if they change their internal API.
- **Fasting windows have no dedicated Apple Health data type**, so if you're
  doing any time-restricted eating alongside MyFitnessPal's calorie tracking,
  log those windows with the manual entry form.

## Setup

```bash
npm install
cp .env.example .env
```

Fill in `.env`:

- `ANTHROPIC_API_KEY` — from [console.anthropic.com](https://console.anthropic.com/settings/keys).
  Daily insights default to `claude-opus-5`; set `ANTHROPIC_MODEL` to something
  cheaper (e.g. `claude-sonnet-5` or `claude-haiku-4-5`) if you want to cut cost
  on a job that runs once a day.
- `GARMIN_EMAIL` / `GARMIN_PASSWORD` — your normal Garmin Connect login. Only
  needed if you want the "Sync Garmin now" button to work.

Then run it:

```bash
npm run dev       # http://localhost:3000
# or for a production-style run:
npm run build && npm start
```

Data lives in a local SQLite file at `./data/health.db` (configurable via
`DATABASE_PATH`). There's no multi-user auth — this is built for one person
running it for themselves, either locally, on a home server, or on a small
host like Railway/Fly.io with a persistent volume for `./data`.

## Getting your data in

**Apple Health export** (covers Trainiac/MyFitnessPal/Garmin data that syncs to
Health, plus Apple Watch steps, active energy, sleep and workouts):

1. On your iPhone: Health app → tap your profile picture → **Export All Health
   Data** → share the resulting `export.zip` to your computer.
2. Unzip it — you need the `export.xml` file inside `apple_health_export/`.
3. On the dashboard, click **Upload Apple Health export.xml** and select it.
   Large exports (years of data) can take a few minutes to parse; it streams
   the XML rather than loading it all into memory, so it won't crash the app,
   but don't close the tab mid-upload.

**Garmin Connect direct sync**: click **Sync Garmin now** (pulls the last 14
days of steps, sleep, resting HR, HRV, overnight stress/body battery, weight
and activities each time).

**Manual entry**: fasting sessions (since Apple Health has no fasting type),
plus a fallback for workouts or weight if a sync ever misses something.

## Generating a daily insight

Click **Generate today's insight** any time — it pulls the last 28 days of
aggregated metrics, your recent workouts and fasting sessions, and asks Claude
for: what's actually happening, its best single hypothesis for why weight
isn't moving, 1-3 concrete actions for today, and what data is missing that
would sharpen the answer. It's intentionally not a generic wellness pep talk —
if you want it to run automatically every morning, put `curl -X POST
http://localhost:3000/api/insights/generate` in a cron job or systemd timer.

## Deploying to a free Google Cloud VM

Google's "Always Free" tier includes one small `e2-micro` server, permanently,
at no cost — as long as it's in `us-west1`, `us-central1`, or `us-east1`. This
app comfortably fits on one for a single person's use.

**This deployment puts the app on the open internet on a raw IP:port, with no
login of its own besides the HTTP Basic Auth this project adds.** Set
`DASHBOARD_USERNAME`/`DASHBOARD_PASSWORD` in `.env` — without them, anyone who
finds the address can see your health data and spend your Anthropic API
credit. Every page and API route is gated by it (see `src/proxy.ts`); local
`npm run dev` stays open since those variables are normally unset there.

1. Go to [console.cloud.google.com](https://console.cloud.google.com), sign
   in, create a project (or use an existing one) and enable billing — required
   even for the free tier, but you won't be charged while inside the free
   limits. Open **Cloud Shell** (the `>_` icon, top right) — it's a free
   browser terminal with `gcloud` already signed in as you, so nothing to
   install locally.

2. In Cloud Shell, create the VM (swap the zone for `us-west1-a` or
   `us-east1-b` if you prefer):

   ```bash
   gcloud compute instances create health-strategy \
     --zone=us-central1-a \
     --machine-type=e2-micro \
     --image-family=debian-12 \
     --image-project=debian-cloud \
     --boot-disk-size=30GB \
     --tags=health-strategy
   ```

3. Open the port the app will listen on:

   ```bash
   gcloud compute firewall-rules create allow-health-strategy \
     --allow=tcp:3000 \
     --target-tags=health-strategy \
     --source-ranges=0.0.0.0/0
   ```

4. SSH into it (still from Cloud Shell):

   ```bash
   gcloud compute ssh health-strategy --zone=us-central1-a
   ```

5. Now on the VM itself — an `e2-micro` only has 1GB RAM, so add swap first or
   the production build can run out of memory:

   ```bash
   sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
   sudo mkswap /swapfile && sudo swapon /swapfile
   echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab

   curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
   sudo apt-get install -y nodejs git

   git clone https://github.com/Drivad/health-strategy
   cd health-strategy
   npm install
   cp .env.example .env
   nano .env   # fill in ANTHROPIC_API_KEY, DASHBOARD_USERNAME, DASHBOARD_PASSWORD
               # (and GARMIN_EMAIL/PASSWORD if you want that sync too)

   npm run build
   sudo npm install -g pm2
   pm2 start npm --name health-strategy -- start
   pm2 startup   # copy-paste the command it prints, then:
   pm2 save
   ```

   `pm2` keeps it running in the background permanently — after `pm2 save`
   the app restarts automatically even if the VM itself reboots.

6. Find the VM's external address and visit it:

   ```bash
   gcloud compute instances describe health-strategy --zone=us-central1-a \
     --format='get(networkInterfaces[0].accessConfigs[0].natIP)'
   ```

   Open `http://THAT_IP:3000` — your browser will prompt for the username and
   password you set in step 5.

The external IP normally stays put across restarts, but isn't guaranteed to.
To pin it permanently (still free while attached to a running instance):

```bash
gcloud compute addresses create health-strategy-ip --region=us-central1
gcloud compute instances delete-access-config health-strategy --zone=us-central1-a --access-config-name="external-nat"
gcloud compute instances add-access-config health-strategy --zone=us-central1-a --access-config-name="external-nat" --address=health-strategy-ip
```

**To ship a code change later:** SSH back in, `cd health-strategy`, `git pull`,
`npm install` (if dependencies changed), `npm run build`, `pm2 restart health-strategy`.

## Project layout

- `src/lib/db.ts`, `src/lib/queries.ts` — SQLite schema and data access
  (better-sqlite3, one `raw_samples` table for point-in-time metrics, plus
  dedicated tables for workouts/sleep/fasting sessions)
- `src/lib/appleHealth.ts` — streaming SAX parser for the Apple Health export XML
- `src/lib/garminSync.ts` — Garmin Connect sync
- `src/lib/insights.ts` — the Claude API call that produces the daily briefing
- `src/app/api/**` — route handlers wiring the above to the UI
- `src/app/page.tsx` — the dashboard (charts, sync status, manual entry)

## Known limitations / next steps

- No fasting data type in HealthKit means any time-restricted eating windows
  need manual logging — MyFitnessPal doesn't track fasting at all, it's purely
  calorie/macro logging.
- Weight-loss-plateau analysis is only as good as what's synced — if a source
  isn't feeding data in, the insight will call that out as a gap rather than
  guess.
- A native iOS app (for live HealthKit access and a Garmin watch companion)
  needs Xcode and an Apple Developer account and wasn't built here — this web
  app is the fastest path to something working end to end. Add it as a home
  screen shortcut on your iPhone in the meantime (Safari → Share → Add to Home
  Screen) for an app-like feel.
