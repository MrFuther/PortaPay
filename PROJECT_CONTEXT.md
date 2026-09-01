# MASTER PROJECT CONTEXT: AUTOMATED ESCROW BOT (REKBER)

> **Bot Name (Discord):** PortaPay
> **Checkpoint Terakhir:** Sesi 3 — 24 Mei 2026

## 1. Project Overview
Project ini adalah bot Rekening Bersama (Escrow) otomatis yang berjalan di **Discord** (fokus utama) dan Telegram secara simultan. Bot ini menengahi transaksi digital dan fisik antara Buyer dan Seller tanpa campur tangan admin manusia (kecuali terjadi dispute).

## 2. Tech Stack
- **Runtime:** Node.js v20
- **Bot Framework:** Telegraf (Telegram) + Discord.js (Discord)
- **Database:** PostgreSQL 16 + Sequelize ORM
- **Payment Gateway:** n8n Workflow (Mutasi Email DANA & SeaBank via Kode Unik Transfer)

## 3. Folder Structure (Separation of Concerns)
```text
rekber-bot/
├── adapters/
│   ├── telegram/ (index.js, commands.js, formatter.js)
│   └── discord/
│       ├── index.js       ← Entry point Discord, graceful shutdown handler
│       ├── commands.js    ← Semua slash command + channel guard middleware
│       ├── formatter.js   ← Builder embed untuk tiap event transaksi
│       └── dashboard.js   ← [NEW S3] Live Stats Dashboard (embed + auto-update)
├── services/
│   ├── payment/ (tripay.js, crypto.js)
│   ├── escrow.js          ← State machine & escrow logic
│   ├── notification.js    ← Cross-platform message sender
│   ├── timer.js           ← Background timer COMPLETED_HOLDING
│   └── stats.js           ← [NEW S3] Query statistik DB untuk dashboard
├── db/
│   ├── index.js           ← Sequelize instance
│   ├── config.js
│   ├── guild-settings.js  ← [NEW S3] JSON persistence per-guild Discord config
│   ├── guild_settings.json← [AUTO] File config hasil /setupbot (auto-generated, jangan diedit manual)
│   ├── migrations/
│   └── models/ (transaction.js, user.js)
├── webhook/ (handler.js, mock.js)
├── .env
└── index.js               ← App entry point
```

## 4. Database Schema (Sequelize)
### A. Users Table
- `id` (UUID, PK)
- `telegram_id` (String, Unique)
- `discord_id` (String, Unique)
- `username` (String)
- `trust_score` (Integer, default: 100)
- `total_deals` (Integer, default: 0)
- `failed_deals` (Integer, default: 0)
- `available_balance` (Decimal, default: 0)
- `is_active` (Boolean, default: false) → Lock session state

### B. Transactions Table
- `id` (UUID, PK)
- `seller_id` (String)
- `buyer_id` (String)
- `amount` (Decimal)
- `fee` (Decimal)
- `fee_type` (ENUM: 'INCLUDE', 'EXCLUDE')
- `type` (ENUM: 'DIGITAL', 'PHYSICAL')
- `description` (String)
- `status` (ENUM: WAITING_BUYER, WAITING_PAYMENT, PAID, DELIVERED, COMPLETED_HOLDING, COMPLETED, DISPUTED, FROZEN, CANCELLED)
- `platform` (ENUM: TELEGRAM, DISCORD)
- `payment_url` (String)
- `payment_ref` (String)
- `resi_number` (String, nullable)
- `resi_expedition` (String, nullable)
- `is_hold_used` (Boolean, default: false)
- `hold_expired_at` (Date, nullable)

## 5. Core Business Rules
- **Single Session**: 1 User hanya bisa berada dalam 1 sesi transaksi aktif.
- **Dynamic Fee (Include/Exclude)**:
  - Jika EXCLUDE: QRIS = Harga Barang + Fee Platform. (Cair ke seller: Full Harga Barang).
  - Jika INCLUDE: QRIS = Harga Barang. (Cair ke seller: Harga Barang - Fee Platform).
- **Emergency Hold**: Setelah Buyer klik "Selesai", dana masuk ke COMPLETED_HOLDING selama 3 jam. Buyer punya 1x kesempatan Hold/Emergency untuk membatalkan pencairan.
- **Panic Button**: Kapanpun selama transaksi berjalan, user bisa memanggil Admin (/dispute). Status → FROZEN, timer berhenti.
- **Unified Reputations**: Bot menampilkan "Trust Score" (Win rate, total volume) di awal transaksi.
- **Channel Guard (Discord)**: Bot hanya merespons perintah di channel operasional yang sudah diatur via `/setupbot`. Channel ini juga menjadi wadah Live Dashboard.

## 6. State Machine Flow
```
/rekber → WAITING_BUYER → /join → WAITING_PAYMENT → [Tripay Webhook] → PAID
→ /kirim → DELIVERED → /konfirmasi → COMPLETED_HOLDING (3 jam) → COMPLETED
                                     ↓ (kapanpun)
                                   /dispute → FROZEN (admin turun tangan)
```

## 7. Konfigurasi .env
```env
PORT=3000
DISCORD_TOKEN=...
DISCORD_CLIENT_ID=...
DB_HOST=localhost
DB_PORT=5432
DB_NAME=rekber_db
DB_USER=...
DB_PASS=...
TRIPAY_API_KEY=isi_nanti
TRIPAY_PRIVATE_KEY=isi_nanti
TRIPAY_MERCHANT_CODE=isi_nanti
FEE_PERCENT=1
MOCK_PAYMENT=true           # ubah ke false saat produksi
BASE_URL=http://localhost:3000
STATS_UPDATE_INTERVAL_MINUTES=5
```

---

## 8. Progress Status

### ✅ SELESAI — Sesi 1 (Fondasi)
- Migrasi Database (Sequelize CLI, model `fee_type`, `trust_score`, dsb)
- Integrasi Tripay foundation (`tripay.js` & `crypto.js`, HMAC-SHA256)
- Webhook Express `/tripay/callback` → status ke `PAID`
- Timer `COMPLETED_HOLDING` (background polling tiap menit)
- Command `/rekber` dan `/join` di Discord & Telegram
- Profil Trust Score pembeli
- Mock Payment UI (`/mock-pay/:id`)

### ✅ SELESAI — Sesi 2 (Discord UX)
- Semua respons Discord bersifat `ephemeral`
- Interactive button flow 2-step untuk `/rekber` (pilih fee type → pilih jenis barang)
- Command `/cancel` via slash command dan tombol 🗑️
- Bug fix handler `statustransaksi`

### ✅ SELESAI — Sesi 3 (Discord Trust & Infrastruktur)
- **`/setupbot`** *(admin only, ManageGuild)*: Menetapkan channel operasional bot. Bot hanya merespons perintah di channel tersebut. Dapat dijalankan dari channel mana saja.
- **Channel Guard**: Middleware di semua slash command — blokir interaksi di luar channel operasional. `/setupbot` dikecualikan dari guard.
- **Live Stats Dashboard** (`adapters/discord/dashboard.js`):
  - Embed permanen di channel operasional, auto-**edit** setiap 5 menit (tidak kirim pesan baru).
  - Konten: Status bot + Uptime, Sesi aktif sekarang, Dana diamankan hari ini, Transaksi sukses bulan ini, Volume bulan ini, Daftar transaksi berhasil hari ini.
  - Privasi: nominal transaksi ditampilkan sebagai **rentang harga** (misal "Rp 1jt – 5jt"), tanpa info seller/buyer.
  - Persist: `messageId` disimpan di `db/guild_settings.json` agar bot menemukan pesan lama setelah restart (tidak kirim duplikat).
  - Pinned otomatis saat pertama kali dibuat.
- **Graceful Shutdown**: `SIGINT`/`SIGTERM` handler di `discord/index.js` — bot mengupdate dashboard ke embed **🔴 OFFLINE** sebelum proses berhenti. Catatan: crash mendadak (`kill -9`) tidak tertangkap.
- **`services/stats.js`**: Service layer murni untuk query agregat DB (aktif, harian, bulanan, selesai hari ini).
- **`db/guild-settings.js`**: JSON-based persistence untuk config per-guild Discord.

### ✅ SELESAI — Sesi 4 (Sistem Komplain / Panic Button)
- **`/komplain`** (dengan alias `/dispute`): Mengubah status transaksi aktif menjadi `FROZEN`.
- **Penghentian Timer Otomatis**: Menghentikan timer hold 3 jam (`hold_expired_at = null`) agar pencairan tidak dapat berjalan otomatis saat dalam sengketa.
- **Opsi Alasan Komplain**: Memungkinkan pembeli atau penjual menyertakan alasan/deskripsi komplain.
- **Formating UI**: Embed Discord & pesan Telegram berwarnakan merah warning dengan instruksi tindak lanjut Admin.

---

## 9. BACKLOG — Belum Dikerjakan

### 🔴 Prioritas Tinggi
1. **Sistem Penarikan Dana (`/withdraw`)** — Seller mencairkan `available_balance` ke rekening (via API pencairan Tripay atau manual approval admin).

### 🟡 Prioritas Menengah
3. **Notifikasi Cross-Platform** — Kirim DM otomatis ke seller saat pembayaran sukses (Discord DM atau Telegram message).
4. **Integrasi Tripay Produksi** — Isi `TRIPAY_API_KEY`, `TRIPAY_PRIVATE_KEY`, `TRIPAY_MERCHANT_CODE` di `.env` dan set `MOCK_PAYMENT=false`.

### 🟢 Nice to Have
5. **Admin Panel Channel** — Channel khusus admin untuk melihat transaksi `FROZEN`/`DISPUTED` dan mengambil tindakan via tombol.
6. **Pengujian End-to-End** — Simulasi full flow dari `/rekber` sampai `COMPLETED` dengan mock payment.
