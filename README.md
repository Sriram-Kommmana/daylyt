# Daylyt

A private, installable tracker for your whole day: workouts, food, water, sleep, steps, habits, tasks and focus, with a weekly planner, streaks and statistics.

There is no server and no account. Your data stays in your browser, and the app works offline once it has loaded.

## What it does

| Area | Features |
|---|---|
| **Today** | Day score, streaks, today's plan, and quick logging for everything |
| **Train** | Search about 990 exercises and log sets and reps in a few taps; live workouts with a rest timer; routines; ready-made programs; personal records and progress charts; calorie estimates |
| **Eat** | About 7,600 built-in foods, including Indian dishes; packaged foods and barcodes through Open Food Facts; macros; custom foods; quick add; copy from the previous day |
| **Plan** | Weekly planner with repeating workouts, meals and events; calendar export for reminders; tasks; habits; focus timer |
| **Body** | Water, sleep with quality and schedule, steps, weight with a 7-day average, mood and notes |
| **Stats** | Trends for 7, 30 or 90 days or a year; consistency calendar; streaks; sets per muscle; milestones; insights from your own patterns |

## Hosting it free

Daylyt is a static site, so any free static host can serve it, and there's nothing to pay for or keep running.

### GitHub Pages (recommended)

It's free, and the same account can also hold your sync data. The workflow in `.github/workflows/deploy.yml` tests, builds and publishes on every push.

1. Create a repository named `daylyt` on [github.com/new](https://github.com/new). It must be **public** for free Pages. Your tracking data is never in the repository, only the code.
2. Push this folder:

   ```bash
   git init -b main
   git add .
   git commit -m "Initial commit"
   git remote add origin https://github.com/YOUR-USERNAME/daylyt.git
   git push -u origin main
   ```

3. In the repository, go to **Settings → Pages → Build and deployment → Source** and choose **GitHub Actions**. If the first run failed because this wasn't set yet, re-run it from the **Actions** tab.
4. Open `https://YOUR-USERNAME.github.io/daylyt/`.

### Cloudflare Pages (if you want the code private)

Connect the repository in the Cloudflare dashboard under **Workers & Pages → Create → Pages**. Set the build command to `npm run build` and the output directory to `dist`.

### About "free for life"

No company can promise a free tier forever, so nothing here depends on one:

- The app is plain files that can move to another static host in minutes.
- Your data isn't on the host. It's on your device, and optionally in your own gist.
- **Browsers store data per web address.** If you ever change the address, first use **Settings → Download backup**, then restore it at the new address. Sync also carries your data across.

## Install it on your phone

- **Android (Chrome):** open the site, then menu → **Add to Home screen** or **Install app**.
- **iPhone (Safari):** open the site, then Share → **Add to Home Screen**.

## Keeping your data safe

Data lives in your browser's storage, and clearing site data erases it. Protect it in either of these ways:

- **Sync (recommended):** see **Settings → Sync between devices**. It stores everything in a secret gist on your own GitHub account and keeps your phone and laptop in step. If two devices change the same entry, the most recent change wins.
- **Backups:** **Settings → Download backup** saves one JSON file, which you can restore at any time.

A secret gist isn't encrypted and can be opened by anyone who has its link. Treat it as private but not as a vault.

## Known limits

- **Steps aren't counted automatically.** Web apps can't read your phone's step counter or Google Fit / Apple Health in the background, so you type in the daily total.
- **No background reminders.** A site without a server can't reliably send notifications when it's closed. Use **Plan → calendar button** to export your plan, and your calendar will remind you.
- **Barcode scanning** uses the camera on Chrome for Android. Other browsers can type the barcode number.
- **Calories are estimates.** Burn is calculated from activity MET values, and home-cooked dishes vary. They're good for spotting trends, not for exact accounting.

## Development

```bash
npm install
npm run dev
```

```bash
npm test
```

```bash
npm run build
```

Built with React, TypeScript, Vite, Dexie (IndexedDB) and vite-plugin-pwa. Charts are hand-drawn SVG.

- `src/lib`: logic with no UI (calculations, daily summaries, streaks, search, sync)
- `src/pages` and `src/components`: the interface
- `src/data`: curated foods, extra activities, training programs
- `scripts`: rebuilds `public/data` from the source datasets and generates the icons

## Data sources

- Exercises: [free-exercise-db](https://github.com/yuhonas/free-exercise-db) (public domain). Images load from that repository and are cached after first view; if they ever disappear, the app still works without them.
- Foods: [USDA FoodData Central](https://fdc.nal.usda.gov/) SR Legacy (public domain) and [Open Food Facts](https://world.openfoodfacts.org/) (ODbL, used for live lookups).
- Activity burn rates: based on the Compendium of Physical Activities.
- BMR: Mifflin-St Jeor equation.
