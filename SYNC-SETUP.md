# Our Days — Live Sync Setup

This makes your entries sync between both phones, live, with **all data staying
on your laptop** (and later a Raspberry Pi). The only outside service is
Tailscale, which provides a private encrypted connection between your devices —
it never sees your journal contents.

## How it works

- `server.js` runs on the laptop. It stores everything under `server-data/`
  (text in `records.json`, photos/videos/voice as files in `server-data/media/`)
  and serves the app itself.
- Each phone loads the app from the laptop's address and streams changes live.
- If the laptop is unreachable, the app still works offline and syncs the moment
  it reconnects. The little dot bottom-left glows **gold when connected**, dim when local-only.

## One-time setup

### 1. Start the server (laptop)

```bash
cd ~/familyJournal
./start-server.sh          # serves on port 8787, keeps the laptop awake
```

Leave this running. Data is saved as you go; Ctrl-C flushes and stops it.

### 2. Install Tailscale on the laptop

Arch:
```bash
sudo pacman -S tailscale
sudo systemctl enable --now tailscaled
sudo tailscale up
```
(Other distros: https://tailscale.com/download/linux)

Sign in when the browser opens — create a free personal account.

### 3. Give the laptop an HTTPS address on your tailnet

In the Tailscale admin console (https://login.tailscale.com/admin/dns):
enable **MagicDNS** and **HTTPS Certificates**. Then, on the laptop:

```bash
tailscale serve --bg 8787
tailscale serve status        # shows your https URL
```

You'll get an address like:
```
https://your-laptop.tailXXXX.ts.net/
```
That is the app URL. It works from anywhere, as long as the laptop is awake.

### 4. Put Tailscale on both iPhones

- Install **Tailscale** from the App Store on each phone.
- Sign in with the **same account** as the laptop, toggle it **on**.

### 5. Install the app on each phone

- In **Safari**, open `https://your-laptop.tailXXXX.ts.net/`
- Share → **Add to Home Screen**.
- Open it once while the laptop is running so it caches for offline use.

Do this on both phones. That's it — write on one, watch it appear on the other.

## Optional: require a shared password

By default the tailnet itself is the fence (only your devices can reach the
server). To add a second lock, start the server with a secret:

```bash
OURDAYS_TOKEN="some-long-shared-secret" ./start-server.sh
```
(If you use this, tell me and I'll wire the phones to send it.)

## Moving to a Raspberry Pi later

Copy this whole folder (including `server-data/`) to the Pi, install Node and
Tailscale there, and run `./start-server.sh`. Same code, always-on box. The
phones only need the new Pi's tailnet address.

## Keeping the laptop reachable

- `start-server.sh` already blocks sleep/idle while it runs (via `systemd-inhibit`).
- Closing the lid may still suspend depending on your settings — for always-on,
  keep it plugged in with the lid open, or adjust "lid close action", until the Pi.
- Back up occasionally by copying `server-data/` somewhere safe.
