# Hominventory

Home inventory tracker with barcode scanning, Open Food Facts product lookup, multi-user support, and CSV/TXT export.

Built for Android PDA barcode scanners (Zebra, Honeywell, etc.) that output scans as keyboard input.

## Features

- **Barcode scanning** — auto-detects numeric input as barcodes, looks up product names via Open Food Facts
- **Re-scan to increment** — scanning an existing barcode bumps quantity by 1
- **Manual entry** — type item names directly
- **Multi-user** — casual pick-your-name login, tracks who added each item
- **Quantity tracking** — increment/decrement per item
- **Search** — filter inventory by name or barcode
- **Export** — download inventory as CSV or TXT, filterable by user
- **SQLite backend** — persistent storage, survives restarts

## Quick Start

```bash
git clone https://github.com/YOUR_USERNAME/home-inventory.git
cd home-inventory
npm install
npm run dev
```

Open `http://localhost:3000` on your PDA or any device on the same network.

## Deploy on Home Network

For always-on access from your PDA:

```bash
npm run build
npm start -- -p 3000
```

Access via your server's LAN IP, e.g. `http://192.168.1.50:3000`

### Run as a service (systemd)

Create `/etc/systemd/system/hominventory.service`:

```ini
[Unit]
Description=Hominventory
After=network.target

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/home-inventory
ExecStart=/usr/bin/npm start -- -p 3000
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

Then:

```bash
sudo systemctl enable hominventory
sudo systemctl start hominventory
```

## Project Structure

```
src/
├── app/
│   ├── api/
│   │   ├── items/route.js   # CRUD for inventory items
│   │   └── users/route.js   # User management
│   ├── layout.js
│   └── page.jsx             # React frontend
└── lib/
    └── db.js                # SQLite connection & schema
```

## Tech Stack

- **Next.js 15** (App Router)
- **better-sqlite3** for persistence
- **Open Food Facts API** for barcode lookups
