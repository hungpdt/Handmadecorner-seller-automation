# Etsy Message to Telegram Automation

Node.js + TypeScript tool for Etsy OAuth, token storage, Telegram delivery, and Etsy message endpoint discovery.

## Quick Commands

Use `npm.cmd` on Windows PowerShell if `npm` is blocked by execution policy.

```powershell
npm.cmd install
npm.cmd run auth
npm.cmd run serve
```

In a second terminal while the server is running:

```powershell
npm.cmd run test:health
npm.cmd run test:telegram
npm.cmd run test:shop
npm.cmd run test:orders
npm.cmd run test:send-orders
npm.cmd run poll
```

If `ADMIN_TOKEN` is set, use direct `curl.exe` commands with the `x-admin-token` header instead of the short test scripts.

Meaning:

```text
auth              Run Etsy OAuth setup.
serve             Build and start the app.
test:health       Check local server.
test:telegram     Send a simple Telegram test message.
test:shop         Check Etsy credentials and shop access.
test:orders       Fetch the latest 3 Etsy orders as JSON.
test:send-orders  Send latest 3 Etsy orders to Telegram for testing.
poll              Run the real order poll once; sends only unseen orders.
```

## Current Etsy Message API Status

Checked on 2026-05-09 against the official Etsy OpenAPI v3 spec:

https://www.etsy.com/openapi/generated/oas/3.0.0.json

The official spec does not contain endpoints for `conversation`, `conversations`, `message`, `messages`, `attachment`, or `attachments` related to buyer/shop conversations.

**Etsy Open API v3 currently does not expose an official endpoint for buyer conversations/messages/attachments for this use case.**

Because of that, this project does not fake or guess Etsy message polling endpoints. Etsy message polling is disabled by default. OAuth, SQLite token storage, token refresh, database setup, and Telegram client are implemented.

## Setup

1. Install dependencies:

```bash
npm install
```

2. Create `.env` from `.env.example`:

```bash
cp .env.example .env
```

3. Fill in:

```env
ETSY_KEYSTRING=your_etsy_keystring
ETSY_SHARED_SECRET=your_etsy_shared_secret
ETSY_SHOP_ID=your_shop_id
ETSY_SHOP_NAME=your_shop_name
ETSY_REDIRECT_URI=http://localhost:3000/oauth/etsy/callback
TELEGRAM_BOT_TOKEN=your_telegram_bot_token
TELEGRAM_CHAT_ID=your_telegram_group_or_channel_id
DATABASE_PATH=./data/app.db
POLL_INTERVAL_SECONDS=60
PORT=3000
ADMIN_TOKEN=
ENABLE_DEBUG_ENDPOINTS=false
```

Do not commit `.env`. The keystring and shared secret must stay local.

`ETSY_SHOP_ID` should ideally be the numeric Etsy shop ID. If you only know the shop name, put the shop name in `ETSY_SHOP_ID` or `ETSY_SHOP_NAME`; the app will try to resolve it before calling order endpoints.

For local testing, `ADMIN_TOKEN` can be empty. Before deploying to a public server, set a strong `ADMIN_TOKEN`; manual/test endpoints then require:

```bash
curl -H "x-admin-token: your_admin_token" http://localhost:3000/etsy/orders/latest?limit=3
```

Keep `ENABLE_DEBUG_ENDPOINTS=false` unless you specifically need `/debug/env` for local troubleshooting.

## Etsy OAuth First Run

Register `ETSY_REDIRECT_URI` exactly in your Etsy Developer app settings. For local setup, use:

```text
http://localhost:3000/oauth/etsy/callback
```

Option A, CLI:

```bash
npm run oauth:init
```

Open the printed Etsy OAuth URL in your browser. After authorizing, paste either the authorization `code` or the full callback URL into the terminal. The app exchanges the code at:

```text
https://api.etsy.com/v3/public/oauth/token
```

The token is saved to SQLite with `access_token`, `refresh_token`, and `expires_at`.

Option B, local server:

```bash
npm run dev
```

Open:

```text
http://localhost:3000/oauth/etsy/start
```

Copy the returned `authorizeUrl` into your browser. The callback route exchanges and stores the token.

Initial scope is:

```text
shops_r transactions_r
```

`transactions_r` is required for official Etsy shop receipt/order endpoints. No additional message scope is implemented because the official buyer conversation/message endpoint is not exposed in Etsy Open API v3.

## Token Refresh

Before Etsy API calls, the client checks `expires_at`. If the access token is near expiry, it refreshes using the stored refresh token. If Etsy returns `401`, it refreshes and retries once.

Every Etsy Open API request made by `src/etsy/client.ts` includes:

```text
x-api-key: ETSY_KEYSTRING:ETSY_SHARED_SECRET
Authorization: Bearer access_token
```

## Telegram Setup

Create a bot with BotFather and copy the bot token into:

```env
TELEGRAM_BOT_TOKEN=
```

Add the bot to your Telegram group. To get `TELEGRAM_CHAT_ID`, send a message in the group, then call:

```text
https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/getUpdates
```

Use the group `chat.id`, often a negative number.

Test Telegram after starting the server:

```bash
curl -X POST http://localhost:3000/telegram/test
```

## Run Local

```bash
npm install
npm run dev
```

Health check:

```text
http://localhost:3000/health
```

Message API discovery status:

```text
http://localhost:3000/etsy/message-discovery
```

Manually trigger an order poll:

```bash
npm.cmd run poll
```

On first run, existing receipts from the last 7 days are marked as already known and are not sent to Telegram. New receipts found after that are sent to Telegram and saved in SQLite to avoid duplicate notifications.

Fetch latest 3 orders without sending Telegram:

```bash
npm.cmd run test:orders
```

Send latest 3 orders to Telegram for testing:

```bash
npm.cmd run test:send-orders
```

This test endpoint does not write to `processed_orders`, so calling it repeatedly will send the same latest orders again.

## Deployment

### Recommended Low-Cost Deployment

Because this tool is convenient but not business-critical, the best cost/effectiveness option is:

**Run it on a cheap always-on VPS.**

Recommended specs:

```text
1 vCPU
512 MB - 1 GB RAM
5-10 GB disk
Ubuntu 22.04/24.04
```

Typical cost is about USD 3-6/month from low-cost VPS providers. This is more reliable for a polling worker than free app platforms that sleep, restart often, or need paid persistent disks for SQLite.

Use `pm2` to keep the process alive:

```bash
npm install -g pm2
npm install
npm run build
pm2 start dist/server.js --name etsy-telegram
pm2 save
pm2 startup
```

Set `DATABASE_PATH` to a persistent local path, for example:

```env
DATABASE_PATH=./data/app.db
```

For OAuth on VPS, either keep using local CLI OAuth before deployment and copy the SQLite database to the server, or set `ETSY_REDIRECT_URI` to your VPS HTTPS callback URL and register it in Etsy Developer.

### Render/Railway

1. Create a Node service from the repo.
2. Set the same environment variables from `.env.example` in the platform dashboard.
3. Use build command `npm install && npm run build`.
4. Use start command `npm start`.
5. Use a persistent disk/volume for `DATABASE_PATH`, for example `/data/app.db`.
6. Register the deployed HTTPS callback URL in Etsy Developer app settings and set `ETSY_REDIRECT_URI` to that exact URL.
7. Set a strong `ADMIN_TOKEN` so public manual/test endpoints are not open.

Render/Railway can work, but for this project they are less cost-effective if you need persistent SQLite storage and always-on polling.

### VPS

1. Install Node.js 20+.
2. Clone the repo and create `.env`.
3. Run `npm install && npm run build`.
4. Start with `npm start` under systemd, pm2, or another process manager.
5. Put the app behind HTTPS if using OAuth callback on the VPS.
6. Keep the SQLite database path on persistent storage.

## Gmail Fallback

`src/fallback/gmail` exists only as a disabled placeholder. If Etsy does not expose official message endpoints, the safer fallback is parsing Etsy notification emails through the official Gmail API. This project does not implement Gmail parsing yet and does not scrape Etsy.
