# Edward Updates 😎

A static dashboard for Warsaw jobs and events. React, Vite, TypeScript, and Tailwind power the site. GitHub Actions imports and publishes the data. IndexedDB stores personal records on your device.

## Open the local site

Install Node.js 24 and run these commands in the project folder.

```sh
npm ci
npm run dev
```

Open the Local URL printed by Vite. For a production check, run `npm test`, `npm run build`, and `npm run preview`. The production site uses relative paths to work under a GitHub Pages repository URL.

To preview using the same import as GitHub Actions, run `npm run sync` before starting Vite. A live sync requires current dated tabs in both workbooks. For a local preview from spreadsheet exports, put the date-named CSVs in a folder with `job` and `event` subfolders and run `npm run sync -- /absolute/path/to/folder`. Preview snapshots live in an ignored folder outside the production build.

## Publish on GitHub Pages

1. Create a public GitHub repository and push the project to its `main` branch. Check that the commit contains no CVs, backups or raw workbook exports.
2. In repository **Settings → Pages**, select **GitHub Actions** as the publishing source.
3. In **Actions**, run **Synchronize Warsaw opportunity feeds** once with **Run workflow**. This commits the first validated snapshot and calls the Pages deployment workflow.
4. Open the URL from the deployment summary. Verify jobs and events load and that the last-updated time appears in Warsaw time.
5. Check the next scheduled run in **Actions**. The schedule is daily at 06:55 Europe/Warsaw. GitHub may start a scheduled run late. Your computer can be off.

The sync job must be able to push its two data outputs to `main`. If repository rules block that push, the workflow reports a failure without publishing the incomplete update. The normal Pages workflow deploys pushes to `main`. The scheduled sync calls it explicitly because commits made with the workflow token do not trigger a second push workflow.

## Spreadsheet imports

Both sources are shared by link. The importer reads workbook metadata to enumerate worksheets named `DD.MM.YYYY`, then downloads the selected tabs as CSV. It omits the profile and information worksheets, spreadsheet notes, and descriptions that mention Edward by name. If a source stops allowing anonymous access, a workbook owner can publish a stable listing feed via **File → Share → Publish to web** as CSV. Switching to that fallback requires pointing the importer to the published endpoints and using a date-bearing feed for events.

First discovery dates are recorded in `scripts/first-seen.json`. Job IDs are based on title, company, and location because the source has no permanent job ID and some URLs identify listing pages. Changing a field used for identity can create a new record. Events use title, local date, and venue or address. Saved copies remain in IndexedDB even if the source later removes the listing. The importer keeps the previous published snapshot available during a rollout and rejects malformed feeds before publishing.

## Personal data and CVs

Open **Settings** to export or import a JSON backup. Import merges records and uses the backup values for matching items. Tick the CV checkbox to include that profile. Browser data is specific to the device, browser profile and site address, so export a backup to migrate from a local preview to GitHub Pages.

On this Mac, the local preview opens Generate CV using the profile prepared from the attached CVs. On the published site, import that same private profile once through **Settings → Import CV profile**. The profile uses `name`, `contact`, and one or both language keys `en` and `pl`. Each language contains a `summary` string, `skills`, `education`, and `languages` string arrays, and an `experience` array. Each experience entry has `heading` and `detail` strings plus `bullets` and `keywords` string arrays.

Open a job, select **Generate CV**, choose a language and template, and edit the draft. Select **Export PDF**, then **Save as PDF** in your browser. The draft uses only text from the imported profile. The PDF is generated locally.
