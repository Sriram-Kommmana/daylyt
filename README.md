# Daylyt

A private, installable tracker for your whole day: workouts, food, water, sleep, steps, habits, tasks and focus, with a weekly planner, streaks and statistics.

**Live at https://sriram-kommmana.github.io/daylyt/**

You sign in, and your data is saved to a database, so clearing your browser or changing phones never loses it. A copy stays on the device, which keeps the app fast and lets it work offline.

## What it does

| Area | Features |
|---|---|
| **Today** | Day score, streaks, today's plan, and quick logging for everything |
| **Train** | Search about 990 exercises and log sets and reps in a few taps; live workouts with a rest timer; routines; ready-made programs; personal records and progress charts; calorie estimates |
| **Eat** | About 7,600 built-in foods, including Indian dishes; enter any amount in grams, ml, cups, katori, bowls and more; saved meals; packaged foods and barcodes through Open Food Facts; macros; custom foods; quick add; copy from the previous day |
| **Plan** | Weekly planner with repeating workouts, meals and events; calendar export for reminders; tasks; habits; focus timer |
| **Body** | Water, sleep with quality and schedule, steps, weight with a 7-day average, mood and notes |
| **Stats** | Trends for 7, 30 or 90 days or a year; consistency calendar; streaks; sets per muscle; milestones; insights from your own patterns |

## Hosting it free

Daylyt has two free parts, and there's no server to pay for or keep running:

- **The app** is a static site on GitHub Pages.
- **The data** is in Cloud Firestore, on Firebase's free Spark plan. It needs no card, doesn't pause when idle, and stops at its daily limits rather than charging. It allows 1 GiB of data, 50,000 reads and 20,000 writes per day, far more than one person needs.

### GitHub Pages

The workflow in `.github/workflows/deploy.yml` tests, builds and publishes on every push.

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

- The app is plain files that can move to another static host in minutes. Add the new address to **Authentication → Settings → Authorized domains** in Firebase, and your data is there when you sign in.
- **Settings → Download backup** saves all your data as a plain file you keep, whatever happens to any service.
- All sync code goes through one small interface (`Remote` in `src/lib/cloud.ts`), so moving to another database means rewriting one file.

## Install it on your phone

- **Android (Chrome):** open the site, then menu → **Add to Home screen** or **Install app**.
- **iPhone (Safari):** open the site, then Share → **Add to Home Screen**.

## Keeping your data safe

Every change saves to your account's database within a few seconds. If you clear cookies or lose your phone, sign in again and everything comes back. Your phone and laptop stay in step, and if two devices change the same entry, the most recent change wins.

- **Offline:** changes wait on the device and save when you reconnect. A cloud icon appears on Today while they're waiting. Clearing browser data before they've saved loses those changes, and only those.
- **Who can see it:** the rules in `firestore.rules` only let your signed-in account read or write your data. It isn't end-to-end encrypted, so Google, which runs the database, could technically access it.
- **Backups:** **Settings → Download backup** saves one JSON file, which you can restore at any time.

## Known limits

- **Steps aren't counted automatically.** Web apps can't read your phone's step counter or Google Fit / Apple Health in the background, so you type in the daily total.
- **You need a connection to sign in** the first time on a device. After that, the app opens offline.
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

To try the interface without signing in, run `npx vite --mode uitest`. This works only in development; real builds always require sign-in.

To change the database rules, edit `firestore.rules`, then:

```bash
npx firebase-tools deploy --only firestore:rules
```

Built with React, TypeScript, Vite, Firebase (Auth and Firestore), Dexie (IndexedDB) and vite-plugin-pwa. Charts are hand-drawn SVG.

- `src/lib`: logic with no UI (calculations, daily summaries, streaks, search, `cloud.ts` for sync, `firebase.ts` for the database)
- `src/pages` and `src/components`: the interface
- `src/data`: curated foods, extra activities, training programs
- `scripts`: rebuilds `public/data` from the source datasets and generates the icons

## Data sources

- Exercises: [free-exercise-db](https://github.com/yuhonas/free-exercise-db) (public domain). Images load from that repository and are cached after first view; if they ever disappear, the app still works without them.
- Foods: [USDA FoodData Central](https://fdc.nal.usda.gov/) SR Legacy (public domain) and [Open Food Facts](https://world.openfoodfacts.org/) (ODbL, used for live lookups).
- Activity burn rates: based on the Compendium of Physical Activities.
- BMR: Mifflin-St Jeor equation.
