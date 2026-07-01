# Our Days — Family Gratitude Journal

A single-file, dependency-free PWA: a daily journal to capture one special thing
about each family member and yourself.

## What's in this folder

- `index.html` — the **entire app UI**. No build step, no frameworks, no external
  runtime dependencies. Plain HTML + CSS + vanilla JS.
- Works fully offline once loaded. Designed to be installed to an iPhone home
  screen as a standalone (full-screen) web app.
- `sw.js` — service worker; caches the app shell so it opens offline.
- `server.js` — **optional** self-hosted sync server (Node standard library only,
  zero npm deps). Run it on a laptop/Raspberry Pi so two phones share one journal
  and see each other's entries live. See `SYNC-SETUP.md`.
- `start-server.sh` — launches the server (and blocks laptop sleep while running).
- `SYNC-SETUP.md` — Tailscale + server setup steps for cross-device sync.
- `server-data/` — the synced journal (git-ignored): `records.json` + `media/`.

Sync is **additive**: with no server reachable the app behaves exactly as before,
fully device-local. When the app is served from `server.js`, every write mirrors
up and remote writes stream down via Server-Sent Events. The small dot at the
bottom-left glows gold when connected, dim when local-only.

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

On-device data (the offline cache / source when no server):
- Notes in `localStorage`, key `ourdays_<personId>_<YYYY-MM-DD>` → JSON array of
  `{id,text,ts,edited}`. Legacy single-string notes migrate on read to a stable id
  `lg_<personId>_<date>`.
- Card photos in `localStorage`, key `ourdays_photo_<personId>` (+ `_ts`).
- Day photos / videos / voice in IndexedDB (`ourdays_pix`, `ourdays_vid`,
  `ourdays_voice`).

Sync layer (see the `Sync` module in `index.html` + `server.js`):
- Each user write calls `Sync.emitRecord` / `Sync.emitMedia`. Records carry a
  stable `id`, `kind` (note/photo/video/voice/cardphoto), `person`, `date`, `ts`,
  `updatedAt`, `deleted`. Media bytes upload separately (`PUT /api/media/:id`).
- Writes queue in an IndexedDB **outbox** (`ourdays_outbox`) so they survive
  offline, then flush to the server; the server assigns a monotonic `seq`.
- Incoming records arrive over SSE (`/api/events`, resumes via `Last-Event-ID`),
  are applied to the local stores without re-emitting, and refresh the UI.
  Conflicts resolve last-writer-wins by `updatedAt`.

## Publishing (GitHub Pages)

GitHub Pages hosts a **non-syncing** copy (device-local only — Pages can't reach
the laptop's `/api`). The **syncing** copy is the one served from `server.js` over
Tailscale; that's the version installed on the family phones. Keep publishing to
Pages only as a convenience/backup.

```bash
cd ~/familyJournal
git add index.html sw.js CLAUDE.md
git commit -m "Update Our Days"
git push
# Pages: Settings → Pages → Deploy from branch main /root
```

Pages URL: `https://safnob78.github.io/our-days/`

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

- The **app UI stays a single self-contained `index.html`** with zero external
  *runtime* dependencies (CDNs, frameworks). The service worker and sync server
  are separate plain files; the server uses only the Node standard library.
- The app must keep working **fully offline / device-local** when no sync server
  is reachable — sync is strictly additive, never required.
- Self-hosted only: journal data lives on the user's own laptop/Pi, reached
  privately over Tailscale. No third-party cloud stores the content; no public
  accounts. Keep it that way.
- Sync traffic (`/api/*`) is never cached by the service worker.
