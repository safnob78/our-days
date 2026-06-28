# Our Days — Family Gratitude Journal

A single-file, dependency-free PWA: a daily journal to capture one special thing
about each family member and yourself.

## What's in this folder

- `index.html` — the **entire app**. No build step, no frameworks, no external
  dependencies. Plain HTML + CSS + vanilla JS.
- Works fully offline once loaded. Designed to be installed to an iPhone home
  screen as a standalone (full-screen) web app.

## Family members

| Card | Name   | Relation            |
|------|--------|---------------------|
| K    | Kotye  | Wife                |
| A    | Auggie | Son · 8 years old   |
| M    | Magnus | Twin son · 3 yrs (born first) |
| R    | Rowan  | Twin son · 3 yrs (born second)|
| ✦   | Me     | Dad's own day       |

## How the app works

- **Home screen**: 5 cards fanned out like a held hand. A green dot appears on
  cards that have an entry for today.
- **Card tap**: card slides up as an editor panel — lined paper, the person's
  prompt, and a save button.
- **Past Entries**: opens a full journal timeline sorted newest-first.
- **Photos** (📷 button): add a photo for each family member. Photos are resized
  and stored in `localStorage` — no server, no upload, device-only.
- **Music** (♩ button): procedural pentatonic piano generated with Web Audio API.
  No audio files, no external requests.

## Storage

All data lives in `localStorage`:
- Entry keys: `ourdays_<personId>_<YYYY-MM-DD>`
- Photo keys: `ourdays_photo_<personId>`
- No network calls; no server; no accounts.

## Publishing (GitHub Pages)

Same workflow as the Regime Change quiz:

```bash
cd ~/familyJournal
git init
git add index.html CLAUDE.md
git commit -m "Initial commit: Our Days family journal"
gh repo create our-days --public --source=. --remote=origin --push
# Then enable Pages: Settings → Pages → Deploy from branch main /root
```

Final URL will be: `https://safnob78.github.io/our-days/`

## iOS install notes

- Must be opened in **Safari** (not Files app, not Chrome).
- Share → Add to Home Screen → installs with a star icon, runs full-screen.
- iOS caches hard. After an update: delete the icon, re-add from Safari.

## Adding new entries / editing prompts

Each person's prompt lives in the `PEOPLE` array in the `<script>` block.
Look for the `prompt:` field and edit the string. Keep prompts warm, open-ended,
and not too long.

## Customizing colors

Each person has a `color` (hex, used for save button + history dots) and a `grad`
(CSS gradient, used for card face + editor header). Both are in the `PEOPLE` array.

## Constraints to preserve

- Single self-contained file. Zero external or runtime dependencies.
- No network calls. No localStorage of sensitive data (no names sent anywhere).
- localStorage is device-local; entries do not sync across devices.
