# YABBAI v15 — Real Revenue Tier Engine (Evidence-First, LAN-Hostable)

YABBAI is an evidence-first operating system for legitimate Solana revenue discovery, order processing, payment verification, accounting, agent orchestration, and authorization-gated treasury operations.

**Explicit statement: profit is NOT guaranteed.** No tier, product, agent, opportunity score, or automation implies guaranteed profit, yield, APY, or earnings. Only independently verified on-chain or authoritative billing events become VERIFIED/REALIZED revenue. Everything else stays ESTIMATED, PENDING, BLOCKED, UNKNOWN, or FAILED.

## 1. What YABBAI is

- Real revenue from legitimate digital services settled in SOL (no speculative-trading capital required).
- Full payment loop: CREATE ORDER → AWAITING_PAYMENT → PAY → SUBMIT SIGNATURE → RPC VERIFICATION → PAID → FULFILL.
- Server-side Solana verification that inspects actual SystemProgram transfer instructions (never trusts client claims or balance-delta alone).
- 20 independent agent slots that evaluate opportunities independently; signals may be shared but execution is never synchronized for artificial activity.
- Threshold-gated capabilities ($0 → $25K) based on verified capital, never on estimates.
- Authorization-gated treasury: YABBAI never holds private keys and never signs server-side. Squads/multisig or the user's wallet signs.
- LAN-hostable dashboard with treasury, revenue, products, thresholds, agents, transactions, risk, and audit panels.

## 2. Architecture

```
DISCOVER → VALIDATE → ANALYZE → SIMULATE → RISK CHECK → POLICY → AUTHORIZATION → EXECUTE → VERIFY → ACCOUNT → AUDIT
```

Subsystems: Treasury, Revenue Engine, Service Products, Order System, Payment Verification, Agent Fleet (20), OpportunityRegistry, StrategySignalBus, ThresholdEngine, EarningTaskQueue, Transaction Engine, Risk Engine, Audit Engine, RPC Failover, Dashboard, Security, Health Monitoring, Sweep Scheduler.

No shortcut bypasses verification. Unknown transaction states become `RECONCILIATION_REQUIRED` and are never blindly retried.

## 3. Installation

```powershell
cd C:\Users\yabbi\YABBAI_v15_real_revenue_tier_engine
npm install
```

Requirements: Node 20+, npm 10+. No global tools required.

## 4. Environment setup

```powershell
npm run setup:live
# creates .env with random APP_SESSION_TOKEN + REVENUE_WEBHOOK_SECRET (mode 0600)
# edit .env to set WATCH_WALLET, TREASURY_VAULT_ADDRESS, RPC URLs
```

Key variables (see `.env.example` — never put real secrets there):

| Key | Purpose |
|---|---|
| `NODE_ENV` | `development` / `production` |
| `PORT` / `HOST` / `BIND_HOST` | Port + bind address (`127.0.0.1` local-only, `0.0.0.0` LAN) |
| `SOLANA_CLUSTER` / `SOLANA_NETWORK` | `mainnet-beta` or `devnet` |
| `SOLANA_RPC_URL`, `_2`, `_3` (or `HELIUS_/ALCHEMY_/QUICKNODE_`) | RPC failover endpoints (server-side only) |
| `WATCH_WALLET`, `TREASURY_VAULT_ADDRESS`, `TREASURY_DESTINATION_SOLANA` | Observed + destination addresses |
| `MIN_TREASURY_RESERVE_SOL` (default 0.05) | Reserve never swept |
| `SWEEP_INTERVAL_MINUTES` (5), `SWEEP_PERCENT` (10), `MAX_DAILY_SWEEPS` (50) | Sweep scheduler |
| `I_UNDERSTAND_LIVE_MAINNET` | Must be `true` for live mainnet transfer mode |
| `SQUADS_MULTISIG_ADDRESS` | External governance (no keys in YABBAI) |
| `APP_SESSION_TOKEN`, `REVENUE_WEBHOOK_SECRET` | Auth secrets (env only) |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Optional Postgres mirror |
| `OPPORTUNITY_FEED_URL` | Optional HTTPS opportunity feed |

Live mainnet guard: `TRANSFER_MODE=live` on `mainnet-beta` refuses to start without `I_UNDERSTAND_LIVE_MAINNET=true`.

## 5. Development startup

```powershell
npm run lint
npm test
npm run dev
# listens on http://127.0.0.1:3000 (BIND_HOST/HOST default)
```

Health: `curl http://127.0.0.1:3000/api/health` → HTTP 200 `{"status":"ok",...}`.

## 6. LAN startup

```powershell
# Option A: dev LAN (HMR enabled)
npm run dev:lan
# Option B: production LAN (recommended)
npm run build
npm run start:lan
# prints:
# Local: http://127.0.0.1:3000
# LAN:   http://192.168.1.136:3000
# API:   http://192.168.1.136:3000/api/health
```

- LAN mode binds `0.0.0.0:<PORT>`. Local-only mode binds `127.0.0.1`.
- Never expose directly to the internet; LAN only. The LAN IP is detected at runtime via `os.networkInterfaces()` and printed — it is not hardcoded.
- Verify listener: `Get-NetTCPConnection -LocalPort 3000 | Format-Table LocalAddress,LocalPort,State` should show `0.0.0.0:3000 LISTEN`.
- From another LAN device: open `http://<LAN-IP>:3000` and `http://<LAN-IP>:3000/api/health`.

## 7. Production build

```powershell
npm run build   # vite build + esbuild server bundle → dist/
npm run start:local  # HOST=127.0.0.1 production
npm run start:lan    # HOST=0.0.0.0 production
```

Production serves `dist/` statically with strict CSP; dev uses Vite middlewares with HMR-safe CSP.

## 8. Testing

```powershell
npm run lint   # tsc --noEmit
npm test       # 41 checks: startup, health, products, orders, verification, idempotency, rate limits, e-stop, thresholds, reserve, tx states, RPC, Phantom, auth, CORS, frontend, LAN, build
npm run health # curls /api/health + /api/system/status
```

Covered: app startup, `/api/health`, `/api/system/status`, product discovery, order creation/invalid, payment verification (exact instruction proof), wrong recipient/amount, failed tx, duplicates, idempotency, accounting, rate-limiter + expiry + read/write split, e-stop persistence, thresholds, zero-capital opportunities, reserve, tx state machine + UNKNOWN handling, RPC failover, Phantom preflight, API auth, CORS/origin, frontend panels, production build, LAN binding.

## 9. Solana configuration

- Cluster via `SOLANA_CLUSTER` (default `mainnet-beta`).
- RPC failover order: Helius → Alchemy → QuickNode → Solana Public RPC. Set via either `SOLANA_RPC_URL*` or `HELIUS_/ALCHEMY_/QUICKNODE_` names. Keys stay server-side; `/api/config` and `/api/providers/health` mask URLs (`?••••••••`).
- Provider health: `GET /api/providers/health` shows latency, error rate, active provider.
- Balance: `GET /api/wallet/balance?address=...`; history: `GET /api/wallet/transactions?address=...&limit=25`.

## 10. Phantom usage

Browser wallet only. YABBAI never asks for seed phrases or private keys.

- Connect Phantom → Prepare deposit (YABBAI simulates + checks fee/balance) → Phantom signs via `signAndSendTransaction`.
- 30% initial withdrawal is a preflight simulation only; Phantom is recipient + fee payer. Treasury source still needs owner/Squads authorization — simulation success is not execution proof.
- If simulation fails, treasury is empty, fee uncovered, or address invalid, Phantom is never prompted.
- Note: the fee payer pays the network fee; there is no magic gas payment that makes all failures free. Dropped/expired txs cost nothing; processed-but-failed instructions can still cost a fee.

## 11. Squads authorization

Flow: AGENT REQUEST → BUDGET → POLICY → RISK → SQUADS PROPOSAL → AUTHORIZED SIGNATURES → SUBMIT → CONFIRM → VERIFY → ACCOUNT → AUDIT. If authorization is unavailable, execution is BLOCKED (honest `BLOCKED` audit, no fake success). Inspect: `GET /api/treasury/squads`. Transfer intents: `POST /api/treasury/transfer-intents` + `:id/authorize` with `X-Idempotency-Key`.

## 12. Revenue products (SOL-settled, zero-capital)

| Product | Price | Delivery |
|---|---|---|
| `wallet-report` Wallet Intelligence Report | 0.02 SOL | AUTOMATED |
| `token-risk-report` Token Risk Report | 0.04 SOL | AUTOMATED |
| `premium-alerts` Premium On-Chain Alerts | 0.04 SOL | AUTOMATED |
| `api-access` YABBAI Data API | 0.10 SOL | API |
| `custom-research` Custom Crypto Research | 0.10 SOL | MANUAL |

`GET /api/revenue/products`. Products are opportunities (`capitalRequired=0`, `ESTIMATED`, note "Potential revenue only") until a real payment verifies.

## 13. Payment verification

Order states: `CREATED, AWAITING_PAYMENT (legacy alias PAYMENT_PENDING), PAYMENT_DETECTED, VERIFYING, PAID, FULFILLING, FULFILLED, PAYMENT_FAILED, VERIFICATION_FAILED, EXPIRED, REFUNDED`.

Sequence enforced server-side: validate signature → validate payment (fetch tx, success, confirmation, instruction proof, exact lamports, sender/recipient) → validate order → exact amount → recipient → sender → idempotency → persist revenue → mark PAID. Invalid orders never leave revenue behind.

`POST /api/revenue/orders` → `POST /api/revenue/onchain/verify {signature, recipient, expectedAmount?, expectedSender?, orderId?}` → `POST /api/revenue/orders/:id/fulfill`. Duplicates return the original revenue (`idempotentReplay:true`). Failed/wrong-amount/wrong-recipient txs yield `VERIFICATION_FAILED`, never PAID.

## 14. Thresholds

Levels: $0, $20, $50, $100, $250, $500, $1K, $2.5K, $5K (+$10K, $25K). `GET /api/thresholds` and `/api/system/status.threshold`. USD value = SOL × cached CoinGecko price (UNKNOWN when offline; SOL fallback). Tiers are capability states, not returns. $0 = analytics/reports/research/alerts/API; higher tiers unlock operating capacity only with verified capital.

## 15. Security model

Strict CORS (allowed-origin + preflight), origin rejection for writes, 256KB body limit, read (600/min) / write (120/min) rate limits with `X-RateLimit-*` + `Retry-After` (health exempt, expired entries evicted), constant-time token compare, privileged endpoints behind `Authorization: Bearer`, env-only secrets, no keys in bundles/logs/errors/git, input validation, idempotency keys, audit log, CSP (HMR-safe dev, strict prod), `nosniff`/`DENY`/`no-referrer`/`no-store`. `/api/config` exposes only public addresses + `privateKeyCustody:false`.

## 16. Emergency stop

`POST /api/security/stop {reason}` / `/start`. Persisted in `data/core-state.json` (+ scheduler state), survives restarts, checked before autopilot ticks and every sweep. When engaged: no autonomous execution, sweeps, allocations, or swaps. Read-only monitoring continues.

## 17. RPC failover

`SolanaProviderManager` tracks latency, success/error counts, health, active index; on failure tries the next configured provider; never blindly repeats a timed-out submission. Recovery is automatic on next success. Dashboard shows per-provider state.

## 18. Troubleshooting

- `nonSolRevenue is not defined` (v15.0.0 bug): fixed — `verifiedNonSolRevenue` now computed.
- `npm run build` fails: run `npm run lint` first; do not suppress TS errors.
- Blank frontend: check browser console + `npm run lint`; dev CSP allows HMR, prod is strict.
- Dashboard locked out (429): health is exempt; read/write limits are separate; wait 60s for window reset.
- `All RPC providers failed`: configure `SOLANA_RPC_URL` or check network; public RPC is the last fallback.
- `UNKNOWN` transactions: `POST /api/transactions/:id/reconcile` → `RECONCILIATION_REQUIRED` or `CONFIRMED`/`FAILED`; never auto-retries.
- Sweep never runs: needs `WATCH_WALLET`, balance > reserve, verified revenue basis, e-stop released, daily count < max.
- Port in use: change `PORT` or `Get-NetTCPConnection -LocalPort 3000` + stop the owner.

## 19. LAN access instructions

1. `npm run build` then `npm run start:lan` (or `npm run dev:lan` for dev).
2. Note the printed `LAN: http://<LAN-IP>:<PORT>`.
3. On Windows, allow the port through the firewall (run PowerShell as Administrator, actual port only):
   ```powershell
   New-NetFirewallRule -DisplayName "YABBAI 3000 (LAN)" -Direction Inbound -Protocol TCP -LocalPort 3000 -RemoteAddress LocalSubnet -Action Allow
   # verify:
   Get-NetTCPConnection -LocalPort 3000
   # remove later with:
   # Remove-NetFirewallRule -DisplayName "YABBAI 3000 (LAN)"
   ```
4. On the second device (same Wi-Fi/LAN): open `http://<LAN-IP>:3000` and `http://<LAN-IP>:3000/api/health`.
5. Do not port-forward to the internet.

## 20. Profit disclaimer

YABBAI makes no guaranteed-profit claims, manufactures no customers, transactions, balances, P&L, APY, or yield. Estimated opportunities remain ESTIMATED. Only VERIFIED/REALIZED events count as revenue. Agents act independently; no wash trading, fake volume/holders, wallet cycling, coordinated buying/selling, pump coordination, ranking or front-page manipulation, or fake engagement exists in this codebase.

## Pipeline & scoring

`DISCOVER → VALIDATE → RANK → EARN → VERIFY → ACCOUNT → RESERVE → ALLOCATE → SCALE → DISCOVER AGAIN`. Score = `expected_value − network_fees − trading_fees − slippage − risk_cost − capital_cost`; unknown values stay UNKNOWN/ESTIMATED.

## Persistence

Local JSON (`data/core-state.json`, atomic tmp+rename, mode 0600) is the dev fallback. Production Postgres via `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` + `supabase/migrations/001_yabbai.sql` (RLS enabled). Never disable RLS to pass tests.
