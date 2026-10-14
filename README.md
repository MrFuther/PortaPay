# PortaPay — Automated Escrow Bot

**PortaPay** is a cross-platform automated escrow (rekening bersama) bot for **Discord** and **Telegram**, designed to secure peer-to-peer digital and physical item transactions without requiring a human admin in the middle.

> ⚠️ **Status:** Fully functional in a local environment. Public deployment is pending as I prepare a dedicated VPS server for 24/7 operation.

---

## What Problem Does This Solve?

In local online trading communities, payment fraud is rampant. Sellers send fake transfer screenshots, buyers ghost after receiving goods, and manual admins are slow and often biased. PortaPay eliminates these risks by:

- **Holding funds in escrow** until the buyer confirms receipt
- **Verifying payments automatically** via email mutation parsing (DANA & SeaBank) — no manual bank statement checks
- **Preventing manipulation** with a unique 3-digit transfer code per transaction
- **Providing a panic button** (`/komplain`) to freeze any transaction and escalate it to an admin

---

## ✨ Key Features

| Feature | Description |
|---|---|
| 🔄 **Cross-Platform** | Works simultaneously on Discord and Telegram |
| 💰 **Auto Payment Verification** | Reads DANA/SeaBank email mutations via n8n to auto-confirm payments in < 10 seconds |
| 🔐 **Unique Transfer Code** | Each transaction gets a 3-digit code appended to the transfer amount to prevent fake payment proofs |
| ⏱️ **3-Hour Safety Hold** | After buyer confirms receipt, funds are held 3 hours before auto-releasing to seller |
| 🚨 **Panic Button** | Either party can call `/komplain` anytime to freeze the transaction and halt all timers |
| 🏆 **Trust Score System** | Displays win rate, total volume, and deal history for both buyer and seller |
| 📊 **Live Discord Dashboard** | Pinned embed in the operational channel showing real-time stats, bot status, and uptime |
| 🖥️ **Web Admin Panel** | React + Express dark-mode dashboard for admins to resolve disputes and approve withdrawals |
| 📬 **Auto DM Notifications** | Bot sends direct messages to both parties at every major transaction event |

---

## 🔄 How It Works (Transaction Flow)

```
[Seller]  /rekber  →  sets amount, fee type, item type
             ↓
[Buyer]   /join    →  confirms transaction details
             ↓
[System]  Generates unique transfer code → sends payment instructions to buyer
             ↓
[n8n]     Reads DANA/SeaBank email mutation → matches amount + code → auto-confirms
             ↓
          Status: PAID  →  notifies both parties
             ↓
[Seller]  /kirim   →  inputs shipping resi / delivery proof
             ↓
[Buyer]   /konfirmasi  →  confirms receipt
             ↓
          Status: COMPLETED_HOLDING (3-hour safety window)
             ↓
          Timer expires  →  Status: COMPLETED  →  Seller balance released

[Anytime] /komplain  →  Status: FROZEN  →  Admin intervenes via web panel
```

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| **Runtime** | Node.js v20 |
| **Discord Bot** | Discord.js v14 |
| **Telegram Bot** | Telegraf v4 |
| **Database** | PostgreSQL 16 + Sequelize ORM |
| **Payment Verification** | n8n (email mutation webhook automation) |
| **Admin Dashboard** | React (Vite) + Express REST API |
| **Scheduling** | Custom background timer service |

---

## 📁 Project Structure

```text
rekber-bot/
├── adapters/
│   ├── telegram/
│   │   ├── index.js        ← Telegram bot entry point
│   │   ├── commands.js     ← All Telegram command handlers
│   │   └── formatter.js    ← Message formatters for Telegram
│   └── discord/
│       ├── index.js        ← Discord bot entry point + graceful shutdown
│       ├── commands.js     ← Slash commands + channel guard middleware
│       ├── formatter.js    ← Embed builders for each transaction event
│       └── dashboard.js    ← Live stats embed + auto-update service
├── services/
│   ├── payment/
│   │   ├── n8n.js          ← n8n webhook payment confirmation handler
│   │   └── tripay.js       ← Tripay payment gateway integration
│   ├── escrow.js           ← Core escrow state machine & business logic
│   ├── notification.js     ← Cross-platform DM notification service
│   ├── timer.js            ← Background hold timer (COMPLETED_HOLDING → COMPLETED)
│   └── stats.js            ← DB aggregate queries for live dashboard
├── db/
│   ├── index.js            ← Sequelize instance
│   ├── models/
│   │   ├── transaction.js  ← Transaction model
│   │   └── user.js         ← User model with trust score & balance
│   └── guild-settings.js   ← JSON-based per-guild Discord config persistence
├── routes/
│   └── admin.js            ← Express REST API for admin dashboard
├── webhook/
│   ├── handler.js          ← Payment webhook receiver
│   └── mock.js             ← Mock payment UI for local testing
├── admin-dashboard/        ← React (Vite) admin SPA
├── scripts/
│   └── set_offline.js      ← Standalone script to force dashboard to OFFLINE
├── nodemon.json
├── .env.example
└── index.js                ← App entry point
```

---

## ⚙️ Setup & Installation

### Prerequisites
- Node.js v20+
- PostgreSQL 16
- n8n (self-hosted or cloud)

### 1. Clone the Repository
```bash
git clone https://github.com/MrFuther/rekber-bot.git
cd rekber-bot
```

### 2. Install Dependencies
```bash
npm install
cd admin-dashboard && npm install && cd ..
```

### 3. Configure Environment Variables
```bash
cp .env.example .env
```
Edit `.env` with your values:
```env
PORT=3000
DISCORD_TOKEN=your_discord_bot_token
DISCORD_CLIENT_ID=your_discord_client_id
TELEGRAM_TOKEN=your_telegram_bot_token

DB_HOST=localhost
DB_PORT=5432
DB_NAME=rekber_db
DB_USER=your_db_user
DB_PASS=your_db_password

ADMIN_PASSWORD=your_admin_password

# Payment Gateway (Tripay)
TRIPAY_API_KEY=
TRIPAY_PRIVATE_KEY=
TRIPAY_MERCHANT_CODE=

# Set to true for local testing without real payments
MOCK_PAYMENT=true
BASE_URL=http://localhost:3000

# How often the Discord live dashboard updates (in minutes)
STATS_UPDATE_INTERVAL_MINUTES=5
```

### 4. Run Database Migrations
```bash
npx sequelize-cli db:migrate
```

### 5. Start the Bot
```bash
# Development (auto-restart on changes)
npm run dev

# Production
npm start
```

### 6. Setup Discord Operational Channel
In your Discord server, run the slash command:
```
/setupbot
```
This pins the Live Dashboard to your chosen channel and restricts all bot commands to that channel only.

---

## 📊 Transaction State Machine

```
WAITING_BUYER → WAITING_PAYMENT → PAID → DELIVERED → COMPLETED_HOLDING → COMPLETED
                                          ↓
                                        FROZEN (via /komplain)
                                          ↓
                                        CANCELLED or COMPLETED (via Admin)
```

---

## 🖥️ Admin Dashboard

The web admin panel is accessible at:
```
http://localhost:3000/admin
```
Features:
- **Overview**: Live transaction stats and daily/monthly volume
- **Disputes**: List of frozen transactions with action buttons to resolve or cancel
- **Withdrawals**: Approve or reject seller balance withdrawal requests

---

## 🔐 Privacy Design

All transaction amounts in the Discord Live Dashboard are displayed as **price ranges** (e.g., "Rp 1jt – 5jt") instead of exact figures. No buyer or seller identifiers are shown in the public dashboard embed to protect user privacy.

---

## 📬 Automatic Notifications

At every major transaction event, both parties receive a **Direct Message** from the bot:

| Event | Who Gets Notified |
|---|---|
| Payment confirmed (PAID) | Seller + Buyer |
| Goods shipped (DELIVERED) | Buyer |
| Transaction completed (COMPLETED) | Seller + Buyer |
| Dispute raised (FROZEN) | Seller + Buyer |

---

## 🧰 Utility Scripts

```bash
# Manually force the Discord Live Dashboard to show OFFLINE status
node scripts/set_offline.js
```

---

## 📄 License

This project is for educational and portfolio purposes.
