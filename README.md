# Shiftly

A private, iPhone-first shift calendar for rotating 12-hour day and night shifts. It generates your
repeating schedule, shows it in an Apple-Calendar-style month view and an hourly week view, and lets you
adjust individual days without breaking the rotation.

- Installable PWA, works fully offline
- No accounts, no backend, no tracking. Everything is stored on your device (IndexedDB)
- React + TypeScript, Vite, Tailwind CSS, Dexie, date-fns, Lucide

## The rotation

Four-day cycle, independent of weekdays: **Day** (08:00–20:00) → **Night** (20:00–08:00 next day) →
**After night** (`Zzz`, recovery) → **Day off**, then repeat. The reference point is
**19 October 2026 = Day shift**.

| Date   | State       |
| ------ | ----------- |
| Oct 19 | Day         |
| Oct 20 | Night       |
| Oct 21 | After night |
| Oct 22 | Day off     |
| Oct 23 | Day         |

After night is never stored. It is derived from the night shift that ended that morning, so removing or
adding a night shift updates the following day automatically. If a shift also starts on a recovery day, the
shift is shown, never `Zzz` on its own.

## Getting started

Requires Node.js 20 or newer.

```bash
npm install          # 1. install dependencies
npm run dev          # 2. run locally at http://localhost:5173
npm run build        # 3. type-check and build to ./dist
npm run preview      #    serve the production build (also exercises the service worker)
npm test             #    run the scheduling-engine and storage tests
```

Other scripts: `npm run typecheck`, `npm run icons` (re-renders the PNG app icons from
`scripts/generate-icons.mjs`).

## Deploy to GitHub Pages

The workflow in `.github/workflows/deploy.yml` tests, builds and publishes on every push to `main`.

1. Create a GitHub repository and push this project to the `main` branch.
2. In the repository go to **Settings → Pages** and set **Source** to **GitHub Actions**.
3. Push (or run the workflow manually from the **Actions** tab). The site appears at
   `https://<user>.github.io/<repository-name>/`.

The base path is taken from the repository name in CI (`BASE_PATH=/<repository-name>/`), so the manifest,
service worker scope and asset URLs are correct for project sites. For a local production build under a
different name, set it yourself, e.g. `BASE_PATH=/my-repo/ npm run build`. If you publish to a root domain
(for example a user site or custom domain), use `BASE_PATH=/`.

## Install on iPhone

1. Open the deployed URL in **Safari** (must be Safari, not an in-app browser).
2. Tap the **Share** button, then **Add to Home Screen**, then **Add**.
3. Open Shiftly from the Home Screen. It runs full screen and works offline after the first load.

When a new version is deployed, a banner offers **Update**. Tapping it installs the new version.

## Backup and restore

iOS can clear website storage if an app is unused for a long time or the device runs low on space.
Export a backup now and then.

- **Export:** Settings → *Export all data (JSON)*. On iPhone this opens the share sheet. Save it to Files,
  AirDrop it, and so on.
- **Restore:** Settings → *Restore from a backup…* and choose the `.json` file. Shiftly validates it and shows
  what it contains next to what is on the device. Nothing is replaced until you tap **Replace**. Invalid or
  newer-version files are rejected with an explanation.

## Using the app

- **Month:** swipe or use the arrows to change months. Tap a date for details, **Edit** to change it:
  Auto (follow the rotation), Day, Night or Off, with custom times and a note. **Restore automatic schedule**
  undoes an edit. Edits affect only that date and never the rotation.
- **Month status:** tap *Predicted* under the month title to mark the month *Confirmed* after checking the
  official roster. If you edit a confirmed month it shows *review changes* until you confirm it again.
- **Week:** 24-hour columns with colour blocks sized to the real hours. A night shift appears as two blocks
  (evening on its start date, morning on the next). Tap either to open the same shift. Empty space is time
  without scheduled work, not guaranteed free time.
- **Settings → Rotation:** change the reference date, pattern and shift times, or add a **new rotation from a
  date** (for example a summer pattern). Dates before it keep their old schedule. Manual changes are never
  overwritten, and you are warned when a change overlaps them.

## Project structure

```
src/
  engine/     Pure scheduling logic. No React, no storage. Dates, rotation periods, overrides, day states.
  storage/    Dexie (IndexedDB) schema, repository, backup file format, validation and migrations.
  state/      React provider connecting engine, storage and UI.
  views/      Month, Week and Settings screens.
  components/ Sheets, controls and the shift indicators.
  lib/        Formatting, hooks, PWA registration, file helpers.
```

### How the engine works

- Dates are `YYYY-MM-DD` strings and all day arithmetic goes through UTC midnight, so daylight-saving
  changes can never shift a date. The rotation is a modulo on whole days from the reference date, which also
  works for dates before it.
- Nothing is pre-generated. `Schedule` answers `getDay(date)` and `getSegments(from, to)` on demand from
  *rotation periods* plus *overrides*. Each shift is an interval with local start and end timestamps.
- A **rotation period** (`effectiveFrom`, reference date, pattern, shift times) applies until the next one
  starts. That is how a change "from a date onward" leaves history alone.
- An **override** belongs to a start date and either replaces the shift, removes it, or only carries a note.
  Overrides live separately from the rotation.

### Future sharing

The engine depends on plain data (`AppData`) and nothing else, and all persistence goes through the
`Repository` interface in `src/storage/repository.ts`. Sharing a schedule, syncing two devices or adding a
backend means writing another `Repository` (or exchanging the same JSON the backup already uses). The engine
and UI need no changes.

### Data model versioning

`SCHEMA_VERSION` (`src/storage/backup.ts`) versions both backup files and the IndexedDB layout. Dexie
versions in `src/storage/db.ts` migrate the database in place, and `MIGRATIONS` upgrades older backup files.
Version 1 is the first release, so no migrations exist yet. To change the data model, add a Dexie
`version(2)` with an `upgrade` function and a matching entry in `MIGRATIONS`.

## Tests

`npm test` runs Vitest in the `Europe/Zagreb` time zone so the daylight-saving cases are real (the clocks
change on 25 October 2026, inside the reference rotation). The suite covers the reference dates, the
four-day cycle forward and backward, month/year/leap boundaries, overnight shifts, DST, overrides (including
recovery-state updates), rotation changes from a date, backup validation, and export → wipe → import through
IndexedDB.
