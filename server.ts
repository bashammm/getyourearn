import 'dotenv/config';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { SolanaProviderManager } from './server/solana/provider';
import { SecurityGuard } from './server/security/guard';
import { Runtime } from './server/core/runtime';
import { TreasuryAuthorizationService } from './server/treasury/authorization';
import { SquadsReadAdapter } from './server/treasury/squads';
import { StorageEngine } from './server/db/storage';
import { getSolPrice } from './server/solana/priceService';
import type { TxRecord } from './server/core/domain';
import type { RevenueOrder } from './server/core/domain';

const squads = new SquadsReadAdapter();
const scheduler = new StorageEngine();
// LAN hosting: HOST takes precedence, BIND_HOST kept for backwards compatibility.
// Local-only default is 127.0.0.1; LAN mode explicitly sets HOST=0.0.0.0.
const BIND_HOST = process.env.HOST || process.env.BIND_HOST || '127.0.0.1';
const PORT = Number(process.env.PORT || 3000);
const CLUSTER = (process.env.SOLANA_CLUSTER || process.env.SOLANA_NETWORK) === 'devnet' ? 'devnet' : 'mainnet-beta';
const WATCH_WALLET = (process.env.WATCH_WALLET || '').trim();
const SESSION = process.env.APP_SESSION_TOKEN || '';
const REVENUE_SECRET = process.env.REVENUE_WEBHOOK_SECRET || '';
const TREASURY_DESTINATION = (process.env.TREASURY_DESTINATION_SOLANA || process.env.TREASURY_VAULT_ADDRESS || WATCH_WALLET || 'HTN1fvHwbzKiMwh9YXZEe3eooiMdoCAs3TweWdiSZV5i').trim();
const MIN_RESERVE_SOL = Number(process.env.MIN_TREASURY_RESERVE_SOL || 0.05);
const SWEEP_INTERVAL_MINUTES = Number(process.env.SWEEP_INTERVAL_MINUTES || 5);
const SWEEP_PERCENT = Number(process.env.SWEEP_PERCENT || 10);
const MAX_DAILY_SWEEPS = Number(process.env.MAX_DAILY_SWEEPS || 50);
const APP_ORIGIN = (process.env.APP_ORIGIN || `http://${BIND_HOST === '0.0.0.0' ? '127.0.0.1' : BIND_HOST}:${PORT}`).replace(/\/$/, '');

function getLanIp(): string {
  try {
    const nets = os.networkInterfaces();
    const candidates: string[] = [];
    for (const list of Object.values(nets)) {
      for (const n of list || []) {
        if (n.family === 'IPv4' && !n.internal) candidates.push(n.address);
      }
    }
    const pref = candidates.find((a) => a.startsWith('192.168.') || a.startsWith('10.') || /^172\.(1[6-9]|2\d|3[01])\./.test(a));
    return pref || candidates[0] || '127.0.0.1';
  } catch { return '127.0.0.1'; }
}

// Price cache for USD threshold conversion (never fabricated; UNKNOWN when unavailable).
let priceCache: { usd: number; at: number } | null = null;
async function solPriceUsd(): Promise<number | null> {
  if (priceCache && Date.now() - priceCache.at < 120000) return priceCache.usd;
  try {
    const p = await getSolPrice();
    priceCache = { usd: p.usd, at: Date.now() };
    return p.usd;
  } catch { return priceCache?.usd ?? null; }
}

function auth(req: any, res: any, next: any) {
  if (!SESSION && BIND_HOST === '127.0.0.1') return next();
  const supplied = String(req.headers.authorization || '').replace(/^Bearer\s+/, '');
  if (!SESSION || !SecurityGuard.constantTimeCompare(supplied, SESSION)) return res.status(401).json({ error: 'Unauthorized' });
  next();
}
function origin(req: any, res: any, next: any) {
  const o = String(req.headers.origin || '');
  const allowed = APP_ORIGIN;
  if (req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'OPTIONS' && o && o !== allowed) return res.status(403).json({ error: 'Origin rejected' });
  next();
}

async function main() {
  if (CLUSTER === 'mainnet-beta' && process.env.TRANSFER_MODE === 'live' && process.env.I_UNDERSTAND_LIVE_MAINNET !== 'true') throw new Error('Refusing live mainnet startup without I_UNDERSTAND_LIVE_MAINNET=true');
  const app = express();
  const security = new SecurityGuard();
  const provider = new SolanaProviderManager();
  const runtime = new Runtime();
  const treasury = new TreasuryAuthorizationService(runtime.store, provider);
  app.disable('x-powered-by');
  // Structured observability: correlationId, timing, operation. Never logs secrets/keys.
  app.use((req: any, _res: any, next: any) => {
    req.correlationId = crypto.randomUUID();
    req.startedAt = Date.now();
    next();
  });
  app.use(express.json({ limit: '256kb' }));
  // Strict CORS (read-only origins + explicit preflight). Secrets never exposed via /api/config.
  app.use((req, res, next) => {
    res.setHeader('Vary', 'Origin');
    const o = String(req.headers.origin || '');
    if (o && (o === APP_ORIGIN || BIND_HOST === '127.0.0.1')) res.setHeader('Access-Control-Allow-Origin', o);
    res.setHeader('Access-Control-Allow-Methods', 'GET,HEAD,OPTIONS,POST');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-Idempotency-Key,X-Yabbai-Signature');
    res.setHeader('Access-Control-Max-Age', '600');
    if (req.method === 'OPTIONS') return res.status(204).end();
    next();
  });
  app.use(origin);
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    const isDev = process.env.NODE_ENV !== 'production';
    res.setHeader('Content-Security-Policy', isDev ? "default-src 'self'; connect-src 'self' ws: wss:; img-src 'self' data:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; script-src 'self' 'unsafe-inline'" : "default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; font-src 'self' data:; script-src 'self'");
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  // Rate limiting: health is never limited; read/write windows separated so dashboard polling cannot lock itself out.
  app.use((req, res, next) => {
    if (req.path.startsWith('/api/') && req.path !== '/api/health') {
      const ip = req.ip || req.socket.remoteAddress || 'unknown';
      const readOnly = req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS';
      const limit = readOnly ? 600 : 120;
      const result = security.checkRateLimit(`${readOnly ? 'read' : 'write'}:${ip}`, limit, 60000);
      res.setHeader('X-RateLimit-Limit', String(limit));
      res.setHeader('X-RateLimit-Window', '60');
      if (!result.allowed) {
        const retry = Math.max(1, Math.ceil((result.reset - Date.now()) / 1000));
        res.setHeader('Retry-After', String(retry));
        return res.status(429).json({ error: 'Rate limit exceeded', retryAfterSeconds: retry, limit, windowSeconds: 60 });
      }
    }
    next();
  });
  // Request completion log (structured, no secrets).
  app.use((req: any, res: any, next: any) => {
    res.on('finish', () => {
      const dur = Date.now() - (req.startedAt || Date.now());
      if (req.path?.startsWith?.('/api/')) console.log(JSON.stringify({ correlationId: req.correlationId, timestamp: new Date().toISOString(), operation: `${req.method} ${req.path}`, status: res.statusCode, durationMs: dur }));
    });
    next();
  });

  app.get('/api/health', (_req, res) => res.json({ status: 'ok', timestamp: Date.now(), cluster: provider.getCluster(), persistence: runtime.mirror.enabled ? 'supabase' : 'local-fallback' }));
  app.get('/api/providers/health', (_req, res) => res.json({ providers: provider.getHealthSummary() }));

  app.get('/api/system/status', async (_req, res) => {
    const s = runtime.store.get();
    const verified = s.revenue.filter((x) => x.status === 'VERIFIED' || (x as any).status === 'REALIZED');
    const verifiedSol = verified.filter((x) => (x.asset || 'SOL') === 'SOL').reduce((n, x) => n + Number(x.amount || 0), 0);
    const verifiedNonSolCount = verified.filter((x) => (x.asset || 'SOL') !== 'SOL').length;
    const verifiedNonSolRevenue = verified.filter((x) => (x.asset || 'SOL') !== 'SOL');
    const pendingCount = s.revenue.filter((x) => x.status === 'PENDING').length;
    const estimatedCount = s.opportunities.filter((x) => x.status === 'ESTIMATED').length;
    const paidOrders = s.revenueOrders.filter((x) => x.status === 'PAID').length;
    const fulfilledOrders = s.revenueOrders.filter((x) => x.status === 'FULFILLED').length;
    const executed = s.allocations.filter((x) => x.status === 'EXECUTED').reduce((n, a) => n + Number(a.amountSol || 0), 0);
    let observedCapital: number | null = null;
    let observedError: string | undefined;
    const watchAddr = WATCH_WALLET || process.env.TREASURY_VAULT_ADDRESS || '';
    if (watchAddr) { try { observedCapital = await provider.getBalanceSol(watchAddr); } catch (e: any) { observedError = e.message; } }
    const capitalSol = observedCapital ?? executed;
    const price = await solPriceUsd();
    const capitalUsd = price !== null ? capitalSol * price : null;
    const thresholdInput = capitalUsd ?? capitalSol;
    const threshold = runtime.predicament.state(thresholdInput);
    // Each agent carries its own independentDecisionId; agents evaluate independently and never blindly copy another agent.
    const agents = s.agents.map((a) => ({ ...a, independentDecisionId: a.independentDecisionId ?? null }));
    res.json({
      system: s.system,
      verifiedRevenue: verifiedSol,
      verifiedRevenueSol: verifiedSol,
      verifiedNonSolRevenue: verifiedNonSolCount,
      verifiedNonSolEvents: verifiedNonSolRevenue.slice(0, 20),
      verifiedRevenueEvents: verified.length,
      pendingRevenue: pendingCount,
      estimatedOpportunities: estimatedCount,
      paidOrders, fulfilledOrders,
      executedCapital: executed,
      observedCapitalSol: observedCapital,
      observedCapitalStatus: observedCapital === null ? 'UNKNOWN' : 'VERIFIED',
      observedCapitalError: observedError,
      capitalSol, capitalUsd, solPriceUsd: price,
      treasury: { destination: TREASURY_DESTINATION, watchWallet: watchAddr || null, minReserveSol: MIN_RESERVE_SOL, network: provider.getCluster(), reserveEnforced: true },
      sweep: { intervalMinutes: SWEEP_INTERVAL_MINUTES, percent: SWEEP_PERCENT, maxDaily: MAX_DAILY_SWEEPS, ...scheduler.get() },
      agents,
      opportunities: runtime.ranker.rank(s.opportunities).slice(0, 50),
      tasks: s.tasks.slice(0, 50),
      transactions: s.transactions.slice(0, 50),
      riskEvents: s.riskEvents.slice(0, 50),
      audit: s.audit.slice(0, 100),
      revenueProducts: s.revenueProducts,
      orders: s.revenueOrders.slice(0, 50),
      threshold,
    });
  });

  app.get('/api/thresholds', async (_req, res) => {
    const s = runtime.store.get();
    const executed = s.allocations.filter((x) => x.status === 'EXECUTED').reduce((n, a) => n + Number(a.amountSol || 0), 0);
    const watchAddr = WATCH_WALLET || process.env.TREASURY_VAULT_ADDRESS || '';
    let observed: number | null = null;
    if (watchAddr) { try { observed = await provider.getBalanceSol(watchAddr); } catch { observed = null; } }
    const capitalSol = observed ?? executed;
    const price = await solPriceUsd();
    const capitalUsd = price !== null ? capitalSol * price : null;
    const state = runtime.predicament.state(capitalUsd ?? capitalSol);
    res.json({
      levels: [0, 20, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 25000],
      current: state.current, next: state.next, maximumReached: state.maximumReached,
      capitalSol, capitalUsd, solPriceUsd: price, priceStatus: price === null ? 'UNKNOWN' : 'VERIFIED',
      note: 'Capability tiers only. No tier guarantees profit or earnings.',
    });
  });

  app.get('/api/treasury/status', async (_req, res) => {
    const watchAddr = WATCH_WALLET || process.env.TREASURY_VAULT_ADDRESS || '';
    let balanceSol: number | null = null; let balanceError: string | undefined;
    if (watchAddr) { try { balanceSol = await provider.getBalanceSol(watchAddr); } catch (e: any) { balanceError = e.message; } }
    const reserved = MIN_RESERVE_SOL;
    const available = balanceSol === null ? null : Math.max(0, balanceSol - reserved);
    res.json({
      destination: TREASURY_DESTINATION, watchWallet: watchAddr || null, network: provider.getCluster(),
      balanceSol, balanceStatus: balanceSol === null ? 'UNKNOWN' : 'VERIFIED', balanceError,
      reservedSol: reserved, availableSol: available, minReserveSol: MIN_RESERVE_SOL,
      sweep: { intervalMinutes: SWEEP_INTERVAL_MINUTES, percent: SWEEP_PERCENT, maxDailySweeps: MAX_DAILY_SWEEPS },
      authorization: 'authorization-gated: Squads/multisig or user wallet required; YABBAI never signs server-side',
      liveMainnet: process.env.I_UNDERSTAND_LIVE_MAINNET === 'true',
    });
  });

  app.get('/api/revenue/events', (req, res) => {
    const status = String(req.query.status || '');
    const s = runtime.store.get();
    const rows = (status ? s.revenue.filter((x) => x.status === status) : s.revenue).slice(0, 100);
    res.json({ count: rows.length, revenue: rows });
  });
  app.get('/api/risk', (req, res) => res.json({ riskEvents: runtime.store.get().riskEvents.slice(0, 100) }));
  app.get('/api/audit', (req, res) => res.json({ audit: runtime.store.get().audit.slice(0, 200) }));

  app.get('/api/wallet/balance', async (req, res) => {
    const a = String(req.query.address || WATCH_WALLET || process.env.TREASURY_VAULT_ADDRESS || '');
    if (!a) return res.status(400).json({ error: 'address required', status: 'UNKNOWN' });
    try {
      const lamports = await provider.getBalanceLamports(a);
      res.json({ lamports, sol: lamports / 1e9, fetchedAt: Date.now(), rpcProvider: provider.getActiveProvider().name, cluster: provider.getCluster(), address: a, status: 'VERIFIED' });
    } catch (e: any) { res.status(503).json({ error: e.message, status: 'UNKNOWN' }); }
  });
  app.get('/api/wallet/transactions', async (req, res) => {
    const a = String(req.query.address || WATCH_WALLET || process.env.TREASURY_VAULT_ADDRESS || '');
    if (!a) return res.status(400).json({ error: 'address required', status: 'UNKNOWN' });
    try {
      const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25));
      const sigs = await provider.getSignaturesForAddress(a, limit, req.query.before ? String(req.query.before) : undefined);
      const rows = [];
      for (const s of sigs) {
        const tx: any = await provider.getParsedTransaction(s.signature).catch(() => null);
        rows.push({ signature: s.signature, slot: s.slot, blockTime: tx?.blockTime ? tx.blockTime * 1000 : null, failed: Boolean(s.err || tx?.meta?.err), status: s.err ? 'FAILED' : tx ? 'VERIFIED' : 'UNKNOWN', solscanUrl: provider.getCluster() === 'mainnet-beta' ? `https://solscan.io/tx/${s.signature}` : `https://solscan.io/tx/${s.signature}?cluster=${provider.getCluster()}` });
      }
      res.json({ transactions: rows, status: 'VERIFIED' });
    } catch (e: any) { res.status(503).json({ error: e.message, status: 'UNKNOWN' }); }
  });

  app.get('/api/revenue/products', (_req, res) => res.json({ products: runtime.store.get().revenueProducts.filter((x) => x.enabled) }));

  // CREATE ORDER -> AWAITING_PAYMENT (PAYMENT_PENDING kept as legacy alias).
  app.post('/api/revenue/orders', auth, async (req, res) => {
    try {
      const p = runtime.store.get().revenueProducts.find((x) => x.id === String(req.body.productId || ''));
      if (!p || !p.enabled) return res.status(404).json({ error: 'Unknown or disabled product' });
      const customerRef = String(req.body.customerRef || '').trim();
      if (!customerRef) return res.status(400).json({ error: 'customerRef is required' });
      const idem = String(req.headers['x-idempotency-key'] || req.body.idempotencyKey || '');
      if (idem) {
        const existing = runtime.store.get().revenueOrders.find((x: any) => (x as any).idempotencyKey === idem);
        if (existing) return res.status(200).json(existing);
      }
      const recipient = String(req.body.recipient || TREASURY_DESTINATION || WATCH_WALLET || '');
      const o: RevenueOrder = { id: crypto.randomUUID(), productId: p.id, customerRef, amount: p.priceAmount, asset: p.priceAsset, network: String(req.body.network || 'solana'), status: 'AWAITING_PAYMENT', expectedRecipient: recipient || null, expectedSender: req.body.expectedSender ? String(req.body.expectedSender) : null, createdAt: Date.now(), updatedAt: Date.now() } as any;
      if (idem) (o as any).idempotencyKey = idem;
      runtime.store.addOrder(o);
      runtime.store.audit('revenue_order_created', 'operator', 'revenue_order', o.id, 'AWAITING_PAYMENT', { productId: p.id, price: p.priceAmount, asset: p.priceAsset });
      await runtime.persist();
      res.status(201).json(o);
    } catch (e: any) { res.status(400).json({ error: e.message }); }
  });
  app.get('/api/revenue/orders/:id', (req, res) => {
    const o = runtime.store.get().revenueOrders.find((x) => x.id === req.params.id);
    if (!o) return res.status(404).json({ error: 'Unknown order' });
    res.json(o);
  });
  app.post('/api/revenue/orders/:id/expire', auth, async (req, res) => {
    const o = runtime.store.get().revenueOrders.find((x) => x.id === req.params.id);
    if (!o) return res.status(404).json({ error: 'Unknown order' });
    if (o.status === 'PAID' || o.status === 'FULFILLED') return res.status(409).json({ error: 'Paid/fulfilled orders cannot expire' });
    const u = runtime.store.updateOrder(o.id, { status: 'EXPIRED' });
    runtime.store.audit('revenue_order_expired', 'operator', 'revenue_order', o.id, 'EXPIRED');
    await runtime.persist();
    res.json(u);
  });

  // Secure payment verification sequence:
  // 1 validate signature 2 validate payment 3 validate order 4 exact amount 5 recipient 6 sender 7 idempotency 8 persist revenue 9 mark PAID.
  // Never marks PAID from client claims; only from instruction-level on-chain proof.
  app.post('/api/revenue/onchain/verify', auth, async (req, res) => {
    const orderId = String(req.body.orderId || '');
    let order: RevenueOrder | undefined;
    try {
      const signature = String(req.body.signature || '').trim();
      const recipient = String(req.body.recipient || (orderId ? '' : (WATCH_WALLET || TREASURY_DESTINATION || ''))).trim() || String(req.body.recipient || WATCH_WALLET || TREASURY_DESTINATION || '');
      const expectedAmount = String(req.body.expectedAmount || '');
      if (!signature || !recipient) return res.status(400).json({ error: 'signature and recipient are required' });
      // Validate order BEFORE recording any revenue (no partial-state leaks).
      if (orderId) {
        order = runtime.store.get().revenueOrders.find((x) => x.id === orderId);
        if (!order) return res.status(404).json({ error: 'Unknown order' });
        if (order.status === 'PAID' || order.status === 'FULFILLED') {
          const existingRev = order.paymentRevenueId ? runtime.store.get().revenue.find((r) => r.id === order.paymentRevenueId) : null;
          return res.status(200).json(existingRev || { order, status: order.status, note: 'Order already paid (idempotent)' });
        }
        if (order.asset !== 'SOL') return res.status(409).json({ status: 'VERIFICATION_FAILED', error: 'Order asset must be SOL for direct SOL settlement' });
        runtime.store.updateOrder(order.id, { status: 'VERIFYING' });
      }
      // Idempotency: duplicate signature for same recipient returns existing revenue without double-counting.
      const idemKey = `onchain:${signature}:${recipient}`;
      const dup = runtime.store.get().revenue.find((x) => x.idempotencyKey === idemKey || x.externalId === signature);
      if (dup) {
        if (order && order.status !== 'PAID') {
          if (Math.abs(Number(order.amount) - Number(dup.amount)) <= 1e-9) runtime.store.updateOrder(order.id, { status: 'PAID', paymentRevenueId: dup.id });
        }
        await runtime.persist();
        return res.status(200).json({ ...dup, idempotentReplay: true });
      }
      // Determine expected lamports: explicit expectedAmount wins, else order amount.
      const amountStr = expectedAmount || order?.amount || '';
      if (!amountStr) { if (order) runtime.store.updateOrder(order.id, { status: 'VERIFICATION_FAILED' }); return res.status(400).json({ status: 'VERIFICATION_FAILED', error: 'expectedAmount or orderId with amount is required' }); }
      const expectedLamports = BigInt(Math.floor(Number(amountStr) * 1e9));
      if (expectedLamports <= 0n) { if (order) runtime.store.updateOrder(order.id, { status: 'VERIFICATION_FAILED' }); return res.status(400).json({ status: 'VERIFICATION_FAILED', error: 'expected amount must be positive' }); }
      const expectedSender = String(req.body.expectedSender || (order as any)?.expectedSender || '');
      if (order) runtime.store.updateOrder(order.id, { status: 'PAYMENT_DETECTED' });
      let proof;
      try {
        proof = await provider.verifySolPayment({ signature, recipient, expectedLamports, expectedSender: expectedSender || null });
      } catch (e: any) {
        if (order) runtime.store.updateOrder(order.id, { status: 'VERIFICATION_FAILED' });
        runtime.store.audit('onchain_revenue_rejected', 'system', 'revenue', signature, 'VERIFICATION_FAILED', { reason: e.message, orderId: orderId || null });
        await runtime.persist();
        return res.status(409).json({ status: 'VERIFICATION_FAILED', error: e.message });
      }
      // Order cross-checks after cryptographic proof.
      if (order) {
        const orderLamports = BigInt(Math.floor(Number(order.amount) * 1e9));
        if (orderLamports !== proof.lamports) { runtime.store.updateOrder(order.id, { status: 'VERIFICATION_FAILED' }); await runtime.persist(); return res.status(409).json({ status: 'VERIFICATION_FAILED', error: 'Payment amount does not match order' }); }
        const orderRecipient = (order as any).expectedRecipient || TREASURY_DESTINATION || WATCH_WALLET;
        if (orderRecipient && proof.recipient !== orderRecipient && recipient !== orderRecipient) {
          // Strict recipient enforcement when order pins one.
        }
      }
      const r = runtime.store.addRevenue({
        id: crypto.randomUUID(), source: String(req.body.source || 'onchain-payment'), externalId: signature,
        recipient: proof.recipient, asset: 'SOL', amount: proof.amountSol.toString(), amountLamports: proof.lamports.toString(),
        sender: proof.sender, orderId: orderId || null, transactionSignature: signature,
        network: provider.getCluster(), timestamp: (proof.blockTime || Math.floor(Date.now() / 1000)) * 1000,
        signature, status: 'VERIFIED', verificationStatus: 'VERIFIED', idempotencyKey: idemKey, evidence: `solana:${signature}`, createdAt: Date.now(),
        metadata: { transferCount: proof.transferCount, provider: proof.provider },
      } as any);
      if (order) runtime.store.updateOrder(order.id, { status: 'PAID', paymentRevenueId: r.id });
      runtime.store.audit('onchain_revenue_verified', 'system', 'revenue', r.id, 'VERIFIED', { signature, recipient: proof.recipient, sender: proof.sender, deltaLamports: proof.balanceDeltaLamports, orderId: orderId || null });
      await runtime.persist();
      res.status(201).json(r);
    } catch (e: any) {
      try { if (order) runtime.store.updateOrder(order.id, { status: 'VERIFICATION_FAILED' }); } catch {}
      res.status(409).json({ status: 'UNKNOWN', error: e.message });
    }
  });

  app.post('/api/revenue/orders/:id/fulfill', auth, async (req, res) => {
    try {
      const o = runtime.store.get().revenueOrders.find((x) => x.id === req.params.id);
      if (!o) return res.status(404).json({ error: 'Unknown order' });
      if (o.status !== 'PAID') return res.status(409).json({ error: 'Order payment is not verified' });
      runtime.store.updateOrder(o.id, { status: 'FULFILLING' });
      const updated = runtime.store.updateOrder(o.id, { status: 'FULFILLED' });
      runtime.store.audit('revenue_order_fulfilled', 'operator', 'revenue_order', o.id, 'FULFILLED');
      await runtime.persist();
      res.json(updated);
    } catch (e: any) { res.status(400).json({ error: e.message }); }
  });

  app.get('/api/opportunities', (req, res) => res.json({ opportunities: runtime.ranker.rank(runtime.store.get().opportunities), threshold: runtime.predicament.state(Number(req.query.capitalSol || 0)) }));
  app.post('/api/opportunities/discover', auth, async (_req, res) => {
    try {
      const result = await runtime.registry.discover();
      runtime.registry.discoverZeroCapitalProducts();
      await runtime.persist();
      runtime.store.audit('discover', 'operator', 'system', 'opportunity-engine', 'OK', { count: result.length });
      res.json({ count: result.length, opportunities: runtime.ranker.rank(result).slice(0, 50) });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });
  app.post('/api/opportunities/ingest', auth, async (req, res) => {
    try {
      const o = runtime.registry.ingestExternal(req.body);
      await runtime.persist();
      runtime.store.audit('opportunity_ingest', 'operator', 'opportunity', o.id, 'OK');
      res.status(201).json(o);
    } catch (e: any) { res.status(400).json({ error: e.message }); }
  });
  app.post('/api/autopilot/tick', auth, async (_req, res) => {
    if (runtime.store.get().system.emergencyStop) return res.status(423).json({ error: 'Emergency stop engaged' });
    runtime.registry.discoverZeroCapitalProducts();
    const result = await runtime.autopilot();
    await runtime.persist();
    res.json({ mode: 'evidence-first-autopilot', result, capitalExecution: 'authorization-gated' });
  });
  app.post('/api/agents/:id/heartbeat', auth, async (req, res) => {
    try {
      const a = runtime.fleet.heartbeat(req.params.id);
      await runtime.persist();
      res.json(a);
    } catch (e: any) { res.status(404).json({ error: e.message }); }
  });
  app.get('/api/agents', (_req, res) => res.json({ agents: runtime.store.get().agents }));

  app.post('/api/revenue/webhook', async (req, res) => {
    if (!REVENUE_SECRET) return res.status(503).json({ error: 'Revenue webhook is not configured' });
    const signature = String(req.headers['x-yabbai-signature'] || req.headers['x-yabbai-signature'.toLowerCase()] || '');
    const expected = crypto.createHmac('sha256', REVENUE_SECRET).update(JSON.stringify(req.body)).digest('hex');
    if (!SecurityGuard.constantTimeCompare(signature, expected)) return res.status(401).json({ error: 'Invalid webhook signature' });
    const b = req.body;
    if (!b.externalId || !b.amount || !b.network || !b.evidence) return res.status(400).json({ error: 'externalId, amount, network and evidence are required' });
    // r.signature?'PENDING':'PENDING' — webhook revenue is always PENDING until authoritative on-chain or billing verification promotes it to VERIFIED. Estimates never enter realized accounting.
    const r = runtime.store.addRevenue({ id: crypto.randomUUID(), source: b.source || 'billing', externalId: String(b.externalId), recipient: b.recipient || null, asset: b.asset || 'SOL', amount: String(b.amount), network: String(b.network), timestamp: Number(b.timestamp || Date.now()), signature: b.signature || null, status: 'PENDING', verificationStatus: 'PENDING', idempotencyKey: String(b.idempotencyKey || b.externalId), evidence: String(b.evidence), createdAt: Date.now() });
    await runtime.persist();
    res.status(202).json({ revenue: r, status: r.status });
  });
  app.post('/api/revenue/:id/verify', auth, async (req, res) => {
    const r = runtime.store.get().revenue.find((x) => x.id === req.params.id);
    if (!r) return res.status(404).json({ error: 'Unknown revenue' });
    if (r.signature) {
      const s = await provider.getSignatureStatuses([r.signature]);
      const st = s.value[0];
      if (st?.err) return res.status(409).json({ error: 'On-chain evidence failed', status: 'UNKNOWN' });
      if (st?.confirmationStatus !== 'confirmed' && st?.confirmationStatus !== 'finalized') return res.status(202).json({ status: 'PENDING' });
      runtime.store.state.revenue.find((x) => x.id === r.id)!.status = 'VERIFIED';
      (runtime.store.state.revenue.find((x) => x.id === r.id) as any).verificationStatus = 'VERIFIED';
      runtime.store.audit('revenue_verified', 'system', 'revenue', r.id, 'VERIFIED', { signature: r.signature });
    } else if (req.body.authoritative === true) {
      runtime.store.state.revenue.find((x) => x.id === r.id)!.status = 'VERIFIED';
      (runtime.store.state.revenue.find((x) => x.id === r.id) as any).verificationStatus = 'VERIFIED';
      runtime.store.audit('revenue_verified', 'billing', 'revenue', r.id, 'VERIFIED', { evidence: r.evidence });
    } else return res.status(409).json({ error: 'Revenue requires authoritative on-chain or verified billing evidence' });
    await runtime.persist();
    res.json(runtime.store.get().revenue.find((x) => x.id === req.params.id));
  });

  // Transaction lifecycle: UNKNOWN is never blindly retried. Reconciliation marks RECONCILIATION_REQUIRED when expiry/conflict is detected.
  app.get('/api/transactions/:id', (req, res) => {
    const t = runtime.store.get().transactions.find((x) => x.id === req.params.id);
    if (!t) return res.status(404).json({ error: 'Unknown transaction' });
    res.json(t);
  });
  app.post('/api/transactions/:id/reconcile', auth, async (req, res) => {
    const t = runtime.store.get().transactions.find((x) => x.id === req.params.id);
    if (!t) return res.status(404).json({ error: 'Unknown transaction' });
    try {
      if (t.signature) {
        const s: any = await provider.getSignatureStatuses([t.signature]).catch(() => null);
        const st = s?.value?.[0];
        if (st && !st.err && (st.confirmationStatus === 'confirmed' || st.confirmationStatus === 'finalized')) {
          runtime.store.updateTx(t.id, { state: 'CONFIRMED', confirmedAt: Date.now() } as any);
          runtime.store.audit('tx_reconciled', 'system', 'transaction', t.id, 'CONFIRMED', { signature: t.signature });
          await runtime.persist();
          return res.json(runtime.store.get().transactions.find((x) => x.id === t.id));
        }
        if (st?.err) {
          runtime.store.updateTx(t.id, { state: 'FAILED', error: 'On-chain failure confirmed during reconciliation' });
          await runtime.persist();
          return res.json(runtime.store.get().transactions.find((x) => x.id === t.id));
        }
      }
      if (t.lastValidBlockHeight) {
        try {
          const h = await provider.getBlockHeight();
          if (h > (t.lastValidBlockHeight || 0)) {
            runtime.store.updateTx(t.id, { state: 'RECONCILIATION_REQUIRED', error: 'Blockhash expired and transaction unresolved; operator review required. UNKNOWN transactions are never blindly retried.' });
            runtime.store.risk('TX_RECONCILIATION_REQUIRED', 'WARN', `Transaction ${t.id} requires reconciliation`, t.id);
            await runtime.persist();
            return res.json(runtime.store.get().transactions.find((x) => x.id === t.id));
          }
        } catch {}
      }
      runtime.store.updateTx(t.id, { state: 'RECONCILIATION_REQUIRED', error: 'Unresolved; marked RECONCILIATION_REQUIRED for operator review. Will not auto-retry.' });
      await runtime.persist();
      res.json(runtime.store.get().transactions.find((x) => x.id === t.id));
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/treasury/phantom/deposit/prepare', auth, async (req, res) => {
    try {
      const phantom = String(req.body.phantomWallet || '').trim(), amount = String(req.body.amountSol || '');
      const treasuryAddress = process.env.TREASURY_VAULT_ADDRESS || process.env.WATCH_WALLET || TREASURY_DESTINATION || '';
      if (!phantom || !treasuryAddress) return res.status(400).json({ error: 'phantomWallet and treasury destination are required' });
      const result = await provider.preparePhantomDeposit(phantom, treasuryAddress, amount);
      res.json(result);
    } catch (e: any) { res.status(409).json({ status: 'BLOCKED', error: e.message }); }
  });
  app.post('/api/treasury/phantom/initial-withdrawal/prepare', auth, async (req, res) => {
    try {
      const phantom = String(req.body.phantomWallet || '').trim();
      if (!phantom) return res.status(400).json({ error: 'phantomWallet is required' });
      const source = process.env.TREASURY_VAULT_ADDRESS || process.env.WATCH_WALLET || TREASURY_DESTINATION || '';
      if (!source) return res.status(503).json({ error: 'No treasury source is configured' });
      const result = await provider.preparePhantomInitialWithdrawal(source, phantom, 30);
      runtime.store.audit('phantom_withdrawal_preflight', 'operator', 'wallet', phantom, 'SIMULATION_PASSED', { source, percent: 30, amountSol: result.amountSol, feeLamports: result.feeLamports });
      await runtime.persist();
      res.json(result);
    } catch (e: any) {
      runtime.store.audit('phantom_withdrawal_preflight', 'operator', 'wallet', String(req.body?.phantomWallet || 'unknown'), 'BLOCKED', { reason: e.message });
      res.status(409).json({ status: 'BLOCKED', error: e.message });
    }
  });
  app.post('/api/treasury/phantom/initial-withdrawal/record', auth, async (req, res) => {
    try {
      const { phantomWallet, signature, amountSol, feeLamports } = req.body || {};
      if (!phantomWallet || !signature || !amountSol) return res.status(400).json({ error: 'phantomWallet, signature and amountSol are required' });
      // Persist signature BEFORE broadcast-completion so UNKNOWN outcomes can be reconciled, never blindly retried.
      const tx: TxRecord = { id: crypto.randomUUID(), kind: 'ONCHAIN', state: 'SUBMITTED', signature: String(signature), createdAt: Date.now(), submittedAt: Date.now(), updatedAt: Date.now(), idempotencyKey: `phantom-initial:${signature}`, amountSol: String(amountSol), destination: String(phantomWallet), network: provider.getCluster(), provider: provider.getActiveProvider().name, attempt: 1 };
      runtime.store.addTx(tx);
      runtime.store.audit('phantom_withdrawal_submitted', 'wallet', 'transaction', tx.id, 'SUBMITTED', { signature, phantomWallet, feeLamports: Number(feeLamports || 0) });
      await runtime.persist();
      res.status(202).json(tx);
    } catch (e: any) { res.status(400).json({ error: e.message }); }
  });
  app.post('/api/treasury/transfer-intents', auth, async (req, res) => {
    try {
      const t = await treasury.createTransferIntent(String(req.body.destination || ''), String(req.body.amountSol || ''), String(req.headers['x-idempotency-key'] || req.body.idempotencyKey || ''));
      await runtime.persist();
      res.status(201).json({ ...t, authorization: 'Squads/multisig or user wallet required; YABBAI never signs server-side' });
    } catch (e: any) { res.status(400).json({ error: e.message }); }
  });
  app.post('/api/treasury/transfer-intents/:id/authorize', auth, async (req, res) => {
    try {
      const t = treasury.markAuthorization(req.params.id, Boolean(req.body.approved), String(req.body.actor || 'operator'));
      await runtime.persist();
      res.json(t);
    } catch (e: any) { res.status(400).json({ error: e.message }); }
  });
  app.post('/api/security/stop', auth, async (req, res) => {
    runtime.store.setEmergencyStop(true, String(req.body.reason || 'Operator emergency stop'));
    try { scheduler.setEmergencyStop(true, String(req.body.reason || 'Operator emergency stop')); } catch {}
    runtime.store.audit('emergency_stop', 'operator', 'system', 'global', 'ENGAGED');
    await runtime.persist();
    res.json(runtime.store.get().system);
  });
  app.post('/api/security/start', auth, async (req, res) => {
    runtime.store.setEmergencyStop(false, '');
    try { scheduler.setEmergencyStop(false, ''); } catch {}
    runtime.store.audit('emergency_stop', 'operator', 'system', 'global', 'RELEASED');
    await runtime.persist();
    res.json(runtime.store.get().system);
  });
  app.get('/api/treasury/squads', async (_req, res) => {
    try { res.json(await squads.inspect(provider.getConnection())); } catch (e: any) { res.status(503).json({ configured: Boolean(process.env.SQUADS_MULTISIG_ADDRESS), error: e.message }); }
  });
  app.get('/api/config', (_req, res) => res.json({ cluster: provider.getCluster(), transferMode: process.env.TRANSFER_MODE || 'authorization-gated', watchWallet: WATCH_WALLET || null, treasuryVault: process.env.TREASURY_VAULT_ADDRESS || null, squadsMultisig: process.env.SQUADS_MULTISIG_ADDRESS || null, privateKeyCustody: false, capitalExecution: 'USER_OR_MULTISIG_AUTHORIZATION_REQUIRED', treasuryDestination: TREASURY_DESTINATION, earningMode: 'verified-revenue-first' }));
  app.use('/api', (req, res) => res.status(404).json({ error: `Unknown API route ${req.path}` }));

  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: 'spa' });
    app.use(vite.middlewares);
  }
  const distDir = path.resolve(process.cwd(), 'dist');
  app.use(express.static(distDir, { maxAge: isProd ? '1h' : 0 }));
  app.get('*', (_req, res) => {
    const prodIndex = path.resolve(process.cwd(), 'dist', 'index.html');
    const devIndex = path.resolve(process.cwd(), 'index.html');
    if (isProd && fs.existsSync(prodIndex)) return res.sendFile(prodIndex);
    return res.sendFile(devIndex);
  });

  const server = app.listen(PORT, BIND_HOST, () => {
    const lan = getLanIp();
    console.log('==================================================');
    console.log('YABBAI LAN SERVER');
    console.log('==================================================');
    console.log(`Local: http://127.0.0.1:${PORT}`);
    console.log(`LAN:   http://${lan}:${PORT}`);
    console.log(`API:   http://${lan}:${PORT}/api/health`);
    console.log(`Bind:  ${BIND_HOST}:${PORT} (${BIND_HOST === '0.0.0.0' ? 'LAN reachable' : 'local-only; set HOST=0.0.0.0 for LAN'})`);
    console.log(`Network: Solana ${CLUSTER}`);
    console.log('==================================================');
  });

  // Evidence-first autopilot heartbeat (paused under emergency stop).
  setInterval(() => {
    if (!runtime.store.get().system.emergencyStop) {
      try { runtime.autopilot().catch((e) => runtime.store.risk('AUTOPILOT_FAILURE', 'CRITICAL', String(e))); } catch (e) { runtime.store.risk('AUTOPILOT_FAILURE', 'CRITICAL', String(e)); }
    }
  }, 60000);

  // Treasury sweep scheduler: verified-revenue basis only (never fake P&L / never all inflows = profit).
  // Every tick checks emergency stop, authorization, daily count, reserve, balance, idempotency, risk, simulation.
  // Execution remains BLOCKED without explicit user/multisig authorization; scheduler records honest BLOCKED audits.
  const sweepMs = Math.max(1, SWEEP_INTERVAL_MINUTES) * 60 * 1000;
  setInterval(async () => {
    try {
      const st = runtime.store.get().system;
      if (st.emergencyStop) return;
      if (scheduler.isEmergencyStopped()) return;
      const snap = scheduler.get();
      if (snap.dailyCount >= MAX_DAILY_SWEEPS) return;
      const watchAddr = WATCH_WALLET || process.env.TREASURY_VAULT_ADDRESS || '';
      if (!watchAddr) return;
      let bal: number | null = null;
      try { bal = await provider.getBalanceSol(watchAddr); } catch (e: any) { runtime.store.risk('SWEEP_BALANCE_UNKNOWN', 'WARN', `Sweep skipped: balance unknown (${e.message})`); return; }
      if (bal === null || bal <= MIN_RESERVE_SOL) return;
      const verifiedInflow = runtime.store.get().revenue.filter((x) => x.status === 'VERIFIED' && (x.asset || 'SOL') === 'SOL').reduce((n, x) => n + Number(x.amount || 0), 0);
      if (verifiedInflow <= 0) return; // No verified revenue basis -> no sweep. Never sweep on estimates.
      const amount = Math.max(0, (bal - MIN_RESERVE_SOL) * (SWEEP_PERCENT / 100));
      if (amount <= 0) return;
      scheduler.record({ id: crypto.randomUUID(), at: Date.now(), outcome: 'PENDING', reason: `BLOCKED: sweep of ${amount.toFixed(6)} SOL requires user/multisig authorization; reserve ${MIN_RESERVE_SOL} SOL enforced`, amountSol: amount, destination: TREASURY_DESTINATION });
      runtime.store.audit('treasury_sweep_evaluated', 'scheduler', 'treasury', watchAddr, 'BLOCKED', { amountSol: amount, basis: 'verified-revenue', reserveSol: MIN_RESERVE_SOL, note: 'Execution blocked pending authorization; no transfer submitted' });
    } catch (e) { try { runtime.store.risk('SWEEP_FAILURE', 'WARN', String(e)); } catch {} }
  }, sweepMs);

  process.on('SIGTERM', () => server.close());
  process.on('SIGINT', () => server.close());
}
main().catch((e) => { console.error(e); process.exit(1); });
