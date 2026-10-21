# SomaliNet Hotspot — Backend API

Node.js + Express backend for the SomaliNet city hotspot billing system.
Handles authentication, mobile money payments (EVC Plus / Zaad / Sahal),
and automatic MikroTik session activation.

---

## Project Structure

````
somalinet-backend/
├── server.js                  ← Express app entry point
├── package.json
├── .env.example               ← Copy to .env and fill in values
│
├── db/
│   ├── index.js               ← PostgreSQL connection pool
│   ├── schema.sql             ← Tables + seed data
│   └── migrate.js             ← Run schema against DB
│
├── middleware/
│   └── auth.js                ← JWT verification, admin gate
│
├── routes/
### Payment
│   ├── pay.js                 ← Initiate payment + webhook
│   ├── voucher.js             ← Redeem & generate vouchers
│   ├── session.js             ← Session status / logout
│   └── admin.js               ← Admin: sessions, revenue, users
│
└── services/
 | POST   | /api/pay/webhook | provider callback payload + `x-payment-provider` | No\* |

 \*Webhooks fail closed. The repository does not contain official EVC Plus, Zaad, or Sahal signature specifications, sandbox credentials, or merchant callback contracts. Do not enable a provider until its official documentation confirms the exact protocol. When an official protocol is confirmed, implement that provider adapter and configure its provider-specific webhook mode/secret. An unsigned, malformed, or mismatched callback never activates access.

 Payment initiation returns `pending`, `failed`, or `unknown`; an accepted provider request is not payment confirmation. Only a verified successful callback can confirm a payment. Confirmed payments whose router activation fails remain recoverable through the authenticated admin endpoint:

 ```text
 POST /api/admin/payments/:id/retry-activation
````

    ├── payment.js             ← EVC Plus, Zaad, Sahal integrations
    └── session.js             ← Activate / deactivate sessions

````

---

## Quick Start

### 1. Install dependencies

```bash
npm install
````

### 2. Configure environment

Set `x-payment-provider` to the configured provider identifier only if the provider's documented integration uses that routing header. The current application intentionally rejects all webhook requests while `EVC_WEBHOOK_MODE`, `ZAAD_WEBHOOK_MODE`, or `SAHAL_WEBHOOK_MODE` remains `disabled`.

```bash
cp .env.example .env
# Edit .env with your real values
```

### 3. Set up PostgreSQL

```bash
createdb somalinet
node db/migrate.js
```

### 4. Run the server

```bash
# Development
npm run dev

# Production
npm start
```

---

## API Reference

### Auth

| Method | Endpoint              | Body                          | Auth |
| ------ | --------------------- | ----------------------------- | ---- |
| POST   | /api/auth/register    | name, phone, password, email? | No   |
| POST   | /api/auth/login       | phone, password               | No   |
| POST   | /api/auth/admin-login | email, password               | No   |

### Admin Access

Administrators use `/admin/login` and the protected `/admin/dashboard`. Customer
registration never creates an administrator. Provision the first administrator with
environment-only values after running the migration:

```bash
ADMIN_EMAIL=admin@example.com ADMIN_NAME="SomaliNet Administrator" \
ADMIN_PHONE=0612345678 ADMIN_PASSWORD="use-a-long-random-password" \
npm run create-admin
```

Admin sessions use HttpOnly, SameSite cookies. State-changing admin requests require
the CSRF cookie/header pair, and important admin actions are written to
`admin_audit_log`. Set `NODE_ENV=production` behind HTTPS to enable Secure cookies.

Users can use **Sign out** to close their active hotspot session when possible and clear the local login token.

### Currency Display

Plans keep their original `price_usd` values in the database and payment provider requests.
The customer-facing UI displays these configured SOS package prices:

| Plan      | Original price | Display price |
| --------- | -------------- | ------------- |
| Degdeg    | $0.50          | SOS 290       |
| Caadi     | $1.00          | SOS 570       |
| Maalinle  | $2.00          | SOS 1,140     |
| Toddobaad | $10.00         | SOS 5,720     |

### Payment

| Method | Endpoint         | Body                                    | Auth |
| ------ | ---------------- | --------------------------------------- | ---- |
| GET    | /api/pay/plans   | —                                       | No   |
| POST   | /api/pay/evc     | planId, phone, macAddress?              | Yes  |
| POST   | /api/pay/zaad    | planId, phone, macAddress?              | Yes  |
| POST   | /api/pay/sahal   | planId, phone, macAddress?              | Yes  |
| POST   | /api/pay/webhook | provider payload + `x-payment-provider` | No\* |

\*Webhooks fail closed. Official EVC Plus, Zaad, and Sahal signature specifications and sandbox credentials are not present in this repository, so unsigned or unconfigured callbacks are rejected. Configure a provider only after confirming its official protocol; the current adapter accepts only explicitly configured raw-body HMAC-SHA256 mode.

Payment initiation returns `pending`, `failed`, or `unknown`; an accepted charge request is not payment confirmation. Only a verified successful callback can activate access. Confirmed payments whose router activation fails remain recoverable with `POST /api/admin/payments/:id/retry-activation`.

### Vouchers

| Method | Endpoint              | Body                     | Auth  |
| ------ | --------------------- | ------------------------ | ----- |
| POST   | /api/voucher/redeem   | code, phone, macAddress? | Yes   |
| POST   | /api/voucher/generate | planId, count            | Admin |

### Session

| Method | Endpoint            | Body      | Auth |
| ------ | ------------------- | --------- | ---- |
| GET    | /api/session/status | —         | Yes  |
| POST   | /api/session/logout | sessionId | Yes  |

### Admin

| Method | Endpoint                             | Query                              | Auth  |
| ------ | ------------------------------------ | ---------------------------------- | ----- |
| GET    | /api/admin/sessions                  | —                                  | Admin |
| GET    | /api/admin/revenue                   | period=today\|week\|month\|alltime | Admin |
| GET    | /api/admin/users                     | page=1                             | Admin |
| GET    | /api/admin/overview                  | —                                  | Admin |
| GET    | /api/admin/payments                  | —                                  | Admin |
| GET    | /api/admin/plans                     | —                                  | Admin |
| GET    | /api/admin/administrators            | —                                  | Admin |
| GET    | /api/admin/audit                     | —                                  | Admin |
| POST   | /api/admin/plans                     | package fields                     | Admin |
| PATCH  | /api/admin/plans/:id                 | package fields                     | Admin |
| PATCH  | /api/admin/plans/:id/status          | active                             | Admin |
| POST   | /api/admin/customers                 | name, phone, email?, password      | Admin |
| POST   | /api/admin/customers/:id/assignments | planId                             | Admin |

---

## MikroTik Setup

1. Enable the hotspot server in Winbox: **IP → Hotspot → Servers → Add**
2. Create hotspot profiles matching the names in your DB:
   - `1hour` — Uptime limit: 1h
   - `3hour` — Uptime limit: 3h
   - `1day` — Uptime limit: 24h
   - `7day` — Uptime limit: 168h
3. Enable the API service: **IP → Services → api** (port 8728)
4. Restrict API access to your server's IP in the firewall

---

## Payment Provider Webhooks

Register your webhook URL with each provider:

| Provider | Webhook URL                               |
| -------- | ----------------------------------------- |
| EVC Plus | `https://your-domain.com/api/pay/webhook` |
| Zaad     | `https://your-domain.com/api/pay/webhook` |
| Sahal    | `https://your-domain.com/api/pay/webhook` |

The application rejects webhook requests while `EVC_WEBHOOK_MODE`, `ZAAD_WEBHOOK_MODE`, or `SAHAL_WEBHOOK_MODE` is `disabled`. Use HTTPS callback endpoints in production.

---

## Session Auto-Expiry (Cron)

Add this to `server.js` after `connectDB()` to clean up expired sessions:

```js
const { expireOldSessions } = require("./services/session");
setInterval(expireOldSessions, 60_000); // every 60 seconds
```

---

## Production Deployment

```bash
# PM2 process manager
npm install -g pm2
pm2 start server.js --name somalinet-api
pm2 save
pm2 startup
```

Use **Nginx** as a reverse proxy with SSL (Let's Encrypt) in front of port 3000.

# corepack npm run dev

# corepack npm start

# YogaCare

# accessing admin portal

http://localhost:3000/admin/login

# admin default log in

email: astaricoyoga@gmail.com
password: astaricoyoga1
