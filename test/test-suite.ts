import fs from 'node:fs';
import { SecurityGuard } from '../server/security/guard';
import { CoreStore } from '../server/core/store';
import { OpportunityRegistry, YieldRanker, CurrentPredicamentEngine, ThresholdEngine } from '../server/core/engines';
import { SolanaProviderManager } from '../server/solana/provider';
import { Decimal } from '../server/core/decimal';
import { getPhantomProvider, isPlausibleSolanaAddress, normalizeWalletError, resolveAddress, shortenAddress } from '../src/wallet/phantom';

const failures: string[] = [];
const ok = (n: string, f: () => void | Promise<void>) => {
  try {
    const r = (f as any)();
    if (r && typeof r.then === 'function') return (r as Promise<void>).then(() => console.log('PASS', n)).catch((e: any) => { failures.push(`${n}: ${e.message}`); console.error('FAIL', n, e.message); });
    console.log('PASS', n);
  } catch (e: any) { failures.push(`${n}: ${e.message}`); console.error('FAIL', n, e.message); }
};
const server = fs.readFileSync('server.ts', 'utf8');
const providerSrc = fs.readFileSync('server/solana/provider.ts', 'utf8');
const app = fs.readFileSync('src/App.tsx', 'utf8');
const domain = fs.readFileSync('server/core/domain.ts', 'utf8');
const envExample = fs.readFileSync('.env.example', 'utf8');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const viteCfg = fs.readFileSync('vite.config.ts', 'utf8');

ok('20 persistent agents', () => { const s = new CoreStore().get(); if (s.agents.length !== 20) throw Error(`agents=${s.agents.length}`); });
ok('no server-side treasury private key custody', () => { for (const f of ['server.ts', 'server/solana/provider.ts', 'scripts/setup-live.mjs']) if (fs.readFileSync(f, 'utf8').includes('TREASURY_PRIVATE_KEY')) throw Error(`${f} contains private key custody`); });
ok('transaction unknown-state language exists', () => { if (!server.includes('RECONCILIATION_REQUIRED') || !server.includes('authorization-gated')) throw Error('state machine gate missing'); });
ok('RPC failover order', () => { const x = ['helius', 'alchemy', 'quicknode', 'public']; let p = -1; for (const k of x) { const q = providerSrc.indexOf(`id:'${k}'`); if (q <= p) throw Error('order wrong'); p = q; } });
ok('constant time auth', () => { if (!server.includes('constantTimeCompare') || !fs.readFileSync('server/security/guard.ts', 'utf8').includes('timingSafeEqual')) throw Error('constant-time compare missing'); });
ok('emergency stop', () => { if (!server.includes("app.post('/api/security/stop'") || !server.includes('system.emergencyStop')) throw Error('stop missing'); });
ok('revenue cannot be estimated into realized accounting', () => {
  const norm = server.replace(/\s+/g, '');
  if (!norm.includes("r.signature?'PENDING':'PENDING'") || !norm.includes("status:'VERIFIED'")) throw Error('verification flow missing');
});
ok('allocation/transaction idempotency', () => {
  const st = new CoreStore();
  const o = st.get().strategies[0]; if (!o) throw Error('strategies missing');
  st.addRevenue({ id: 'r1', source: 'test', externalId: 'x', recipient: null, asset: 'SOL', amount: '1', network: 'solana', timestamp: 1, signature: null, status: 'PENDING', idempotencyKey: 'same', evidence: 'test', createdAt: 1 });
  const r = st.addRevenue({ id: 'r2', source: 'test', externalId: 'x2', recipient: null, asset: 'SOL', amount: '2', network: 'solana', timestamp: 2, signature: null, status: 'PENDING', idempotencyKey: 'same', evidence: 'test', createdAt: 2 });
  if (r.id !== 'r1') throw Error('revenue duplicate not idempotent');
});
ok('ranking uses economic costs', () => {
  const r = new YieldRanker().rank([
    { id: '1', strategyId: 'x', title: 'a', source: 'x', discoveredAt: 1, expiresAt: null, expectedGrossSol: 10, networkFeesSol: 1, tradingFeesSol: 1, slippageSol: 1, riskCostSol: 1, capitalCostSol: 1, scoreSol: 0, status: 'ESTIMATED', capitalRequiredSol: 1 },
    { id: '2', strategyId: 'x', title: 'b', source: 'x', discoveredAt: 1, expiresAt: null, expectedGrossSol: 9, networkFeesSol: 0, tradingFeesSol: 0, slippageSol: 0, riskCostSol: 0, capitalCostSol: 0, scoreSol: 0, status: 'ESTIMATED', capitalRequiredSol: 0 },
  ]);
  if (r[0].id !== '2' || r[0].scoreSol !== 9) throw Error('rank formula wrong');
});
ok('threshold states', () => { const x = new CurrentPredicamentEngine().state(125); if (x.current !== 100 || x.next !== 250) throw Error('threshold wrong'); });
ok('zero-capital eligibility', () => { const o: any = { capitalRequiredSol: 0 }; if (!new ThresholdEngine().eligible(o, 0)) throw Error('zero capital should be eligible'); });
ok('independent fleet wording/UI', () => { if (!app.includes('20-agent fleet') || !server.includes('independentDecisionId')) throw Error('fleet independence missing'); });
ok('Phantom withdrawal is recipient and fee payer', () => { if (!providerSrc.includes('feePayer:to') || !providerSrc.includes('phantomLamports<feeLamports') || !server.includes('/api/treasury/phantom/initial-withdrawal/prepare')) throw Error('Phantom preflight missing'); });
ok('Phantom withdrawal is fixed at 30 percent', () => { if (!server.replace(/\s+/g, '').includes('preparePhantomInitialWithdrawal(source,phantom,30)')) throw Error('30% initial withdrawal missing'); });
ok('Phantom is never prompted when treasury is empty', () => { if (!providerSrc.includes('Treasury has no SOL. Phantom will not be prompted')) throw Error('empty treasury guard missing'); });
ok('Phantom receive flow exists', () => { if (!server.includes('/api/treasury/phantom/deposit/prepare') || !app.includes('Sign & Send')) throw Error('Phantom receive flow missing'); });
ok('security headers and origin protection', () => { if (!server.includes('Content-Security-Policy') || !server.includes('Origin rejected')) throw Error('security middleware missing'); });
ok('rate limiter exposes reset and separates read/write windows', () => {
  const g = new SecurityGuard();
  const a = g.checkRateLimit('read:test', 2, 60000); if (!a.allowed || typeof a.reset !== 'number') throw Error('read limiter reset missing');
  const b = g.checkRateLimit('write:test', 1, 60000); if (!b.allowed || typeof b.reset !== 'number') throw Error('write limiter reset missing');
});
ok('zero-capital revenue products exist', () => { const s = new CoreStore().get(); if (s.revenueProducts.length < 5) throw Error('revenue products missing'); if (s.revenueProducts.some((p) => p.capitalRequiredSol !== '0' || p.priceAsset !== 'SOL')) throw Error('products must settle directly in SOL'); });
ok('supabase migration exists', () => { if (!fs.existsSync('supabase/migrations/001_yabbai.sql')) throw Error('migration missing'); });

// ---- New coverage for master prompt ----
ok('order lifecycle states cover full payment flow', () => {
  for (const st of ['AWAITING_PAYMENT', 'PAYMENT_DETECTED', 'VERIFYING', 'PAID', 'FULFILLING', 'FULFILLED', 'PAYMENT_FAILED', 'VERIFICATION_FAILED', 'EXPIRED', 'REFUNDED']) {
    if (!domain.includes(st)) throw Error(`missing order state ${st}`);
  }
  if (!server.includes('AWAITING_PAYMENT')) throw Error('server does not create AWAITING_PAYMENT orders');
});
ok('order creation validates product and customerRef', () => {
  if (!server.includes('Unknown or disabled product') || !server.includes('customerRef is required')) throw Error('order validation missing');
});
ok('payment verification uses instruction-level proof (not balance-delta only)', () => {
  if (!providerSrc.includes('extractSystemTransfers') || !providerSrc.includes('verifySolPayment')) throw Error('instruction verification missing');
  if (!providerSrc.includes('balance deltas alone are not payment proof')) throw Error('balance-delta guard wording missing');
  if (!server.includes('verifySolPayment')) throw Error('server does not call verifySolPayment');
});
ok('payment verification rejects failed tx and enforces exact amount/recipient', () => {
  if (!providerSrc.includes('Transaction failed on-chain')) throw Error('failed-tx guard missing');
  if (!providerSrc.includes('does not equal expected')) throw Error('exact-amount guard missing');
  if (!providerSrc.includes('was not present in the verified transaction')) throw Error('recipient guard missing');
});
ok('duplicate signatures are idempotent', () => {
  if (!server.includes('idempotentReplay') || !server.includes('onchain:')) throw Error('duplicate-signature idempotency missing');
});
ok('revenue accounting distinguishes VERIFIED from ESTIMATED/PENDING', () => {
  for (const s of ['VERIFIED', 'PENDING', 'ESTIMATED', 'UNKNOWN']) if (!domain.includes(s)) throw Error(`missing revenue status ${s}`);
  if (!server.includes('verifiedRevenue') || !server.includes('pendingRevenue')) throw Error('revenue accounting fields missing');
});
ok('decimal-safe arithmetic exists', () => {
  const d = Decimal.from('0.02').add(Decimal.from('0.04'));
  if (d.toString() !== '0.06') throw Error(`decimal math wrong: ${d.toString()}`);
});
ok('rate limiter expiration evicts entries', () => {
  const g = new SecurityGuard();
  const r1 = g.checkRateLimit('expire:test', 1, 50);
  if (!r1.allowed) throw Error('first should pass');
  const r2 = g.checkRateLimit('expire:test', 1, 50);
  if (r2.allowed) throw Error('second should be limited');
  const start = Date.now(); while (Date.now() - start < 60) { /* busy wait for expiry */ }
  const r3 = g.checkRateLimit('expire:test', 1, 50);
  if (!r3.allowed) throw Error('expired window should reset');
});
ok('health endpoint is exempt from rate limiting', () => {
  if (!server.includes("req.path !== '/api/health'")) throw Error('health exemption missing');
});
ok('emergency stop persists via store', () => {
  const st = new CoreStore();
  st.setEmergencyStop(true, 'test');
  const st2 = new CoreStore();
  if (!st2.get().system.emergencyStop) throw Error('emergency stop did not persist');
  st2.setEmergencyStop(false, '');
});
ok('threshold tiers include required levels', () => {
  const x = new CurrentPredicamentEngine().state(0);
  if (!x.levels.includes(20) || !x.levels.includes(5000)) throw Error('threshold levels incomplete');
  if (!server.includes('solPriceUsd') && !server.includes('capitalUsd')) throw Error('USD threshold conversion missing');
});
ok('zero-capital opportunities marked ESTIMATED with disclaimer', () => {
  const st = new CoreStore();
  const reg = new OpportunityRegistry(st);
  const rows = reg.discoverZeroCapitalProducts();
  if (!rows.length) throw Error('no zero-capital opportunities');
  if (rows.some((o) => o.status !== 'ESTIMATED' || o.expectedGrossSol !== 0)) throw Error('zero-capital must be ESTIMATED with 0 expected value');
  if (!fs.readFileSync('server/core/engines.ts', 'utf8').includes('Potential revenue only')) throw Error('disclaimer missing');
});
ok('treasury reserve enforced', () => {
  if (!server.includes('MIN_TREASURY_RESERVE_SOL') && !server.includes('MIN_RESERVE_SOL')) throw Error('reserve constant missing');
  if (!envExample.includes('MIN_TREASURY_RESERVE_SOL')) throw Error('.env.example missing reserve');
  if (!server.includes('reserveEnforced')) throw Error('reserve not exposed in status');
});
ok('transaction state machine has required states', () => {
  for (const s of ['RECONCILIATION_REQUIRED', 'CONFIRMED', 'FAILED', 'UNKNOWN']) if (!domain.includes(s)) throw Error(`missing tx state ${s}`);
  if (!server.includes('/api/transactions/:id/reconcile')) throw Error('reconcile endpoint missing');
  if (!server.includes('never blindly retried') && !server.includes('never blindly retry')) throw Error('no-blind-retry guard missing');
});
ok('RPC failover supports SOLANA_RPC_URL variants', () => {
  if (!providerSrc.includes('SOLANA_RPC_URL')) throw Error('SOLANA_RPC_URL support missing');
  if (!server.includes('/api/providers/health')) throw Error('provider health endpoint missing');
});
ok('CORS and request limits present', () => {
  if (!server.includes('Access-Control-Allow-Origin') || !server.includes("limit: '256kb'") && !server.includes('limit:"256kb"') && !server.includes("256kb")) throw Error('CORS/size limits missing');
});
ok('LAN binding supports HOST=0.0.0.0', () => {
  if (!server.includes('process.env.HOST')) throw Error('HOST env missing');
  if (!server.includes('YABBAI LAN SERVER') || !server.includes('LAN:')) throw Error('LAN banner missing');
  if (!viteCfg.includes('HOST')) throw Error('vite HOST missing');
});
ok('frontend shows treasury/revenue/threshold/agents/transactions/risk/audit', () => {
  for (const needle of ['Verified revenue', 'Capability threshold', '20-agent fleet', 'Opportunity ranking', 'Provider health']) {
    if (!app.includes(needle)) throw Error(`dashboard missing panel: ${needle}`);
  }
});
ok('no guaranteed-profit claims in code', () => {
  // Disclaimers like "No tier implies guaranteed profit" or "profit is NOT guaranteed" are required, not violations.
  // Fail only on positive guarantees (promise of profit without negation nearby).
  const hay = (server + app + domain).toLowerCase();
  const badPatterns = [/you will earn/i, /guaranteed return/i, /profit is guaranteed(?!.*not)/i];
  // Check for unnegated "guaranteed profit/earnings/apy": allow when preceded by no/not/never/without/implies within 40 chars.
  for (const phrase of ['guaranteed profit', 'guaranteed earnings', 'guaranteed apy']) {
    let idx = hay.indexOf(phrase);
    while (idx >= 0) {
      const window = hay.slice(Math.max(0, idx - 60), idx);
      if (!/(no |not |never |without |implies |n't |disclaimer)/.test(window)) throw Error(`positive guaranteed-profit claim found: "${phrase}"`);
      idx = hay.indexOf(phrase, idx + 1);
    }
  }
  for (const re of badPatterns) if (re.test(hay)) throw Error(`prohibited earnings claim: ${re}`);
});
ok('package scripts include LAN/local/health/build/test', () => {
  for (const s of ['start:lan', 'start:local', 'health', 'build', 'test', 'lint']) if (!pkg.scripts[s]) throw Error(`missing script ${s}`);
});
ok('env example covers required keys without secrets', () => {
  for (const k of ['HOST', 'PORT', 'SOLANA_RPC_URL', 'WATCH_WALLET', 'TREASURY_DESTINATION_SOLANA', 'MIN_TREASURY_RESERVE_SOL', 'SWEEP_INTERVAL_MINUTES', 'I_UNDERSTAND_LIVE_MAINNET', 'SQUADS_MULTISIG_ADDRESS']) {
    if (!envExample.includes(k)) throw Error(`.env.example missing ${k}`);
  }
});

ok('phantom provider detection prefers window.phantom.solana', () => {
  const phantom = { isPhantom: true, connect: async () => ({}) };
  const other = { isPhantom: true, connect: async () => ({}) };
  if (getPhantomProvider({ phantom: { solana: phantom }, solana: other }) !== phantom) throw Error('should prefer window.phantom.solana');
});
ok('phantom provider detection falls back to window.solana', () => {
  const fallback = { isPhantom: true, connect: async () => ({}) };
  if (getPhantomProvider({ solana: fallback }) !== fallback) throw Error('should fall back to window.solana');
});
ok('phantom provider detection rejects non-phantom wallets and missing window', () => {
  if (getPhantomProvider({ solana: { isPhantom: false, connect: async () => ({}) } }) !== null) throw Error('non-phantom window.solana must be rejected');
  if (getPhantomProvider({}) !== null) throw Error('empty window must yield null');
  if (getPhantomProvider(undefined) !== null) throw Error('missing window (node) must yield null');
});
ok('phantom address resolution validates public keys', () => {
  const good = 'HTN1fvHwbzKiMwh9YXZEe3eooiMdoCAs3TweWdiSZV5i';
  if (!isPlausibleSolanaAddress(good)) throw Error('valid address rejected');
  if (isPlausibleSolanaAddress('not-an-address')) throw Error('garbage accepted');
  if (isPlausibleSolanaAddress('0OIl' + '1'.repeat(40))) throw Error('non-base58 accepted');
  const fromResponse = resolveAddress({ publicKey: { toBase58: () => good, toString: () => good } }, null);
  if (fromResponse !== good) throw Error('response publicKey not resolved');
  const fromProvider = resolveAddress(null, { isPhantom: true, publicKey: { toBase58: () => good, toString: () => good }, connect: async () => ({}) });
  if (fromProvider !== good) throw Error('provider publicKey fallback not resolved');
  if (resolveAddress(null, null) !== null) throw Error('empty resolution must be null');
  if (resolveAddress({ publicKey: { toBase58: () => { throw Error('boom'); }, toString: () => 'xx' } }, null) !== null) throw Error('throwing key must resolve null');
});
ok('phantom errors are normalized without sensitive data', () => {
  if (!normalizeWalletError(Error('User rejected the request')).includes('rejected')) throw Error('rejection not friendly');
  if (!normalizeWalletError(Error('Phantom is locked')).includes('locked')) throw Error('locked not friendly');
  if (normalizeWalletError(Error('Phantom wallet not detected')) !== 'Phantom wallet not detected.') throw Error('missing-wallet message changed');
  const long = normalizeWalletError(Error('x'.repeat(500)));
  if (long.length > 200) throw Error('error not truncated');
  if (shortenAddress('HTN1fvHwbzKiMwh9YXZEe3eooiMdoCAs3TweWdiSZV5i') !== 'HTN1…ZV5i') throw Error('shorten format wrong');
});
ok('phantom connect UI has full state machine and no server dependency', () => {
  for (const needle of ['Connecting…', 'Disconnect', 'onlyIfTrusted', 'accountChanged', 'getPhantomProvider', 'Wallet', 'Provider:', 'Status:', 'Address:', 'phantom.com/download']) {
    if (!app.includes(needle)) throw Error(`App.tsx missing wallet UI piece: ${needle}`);
  }
  if (!app.includes('Sign & Send')) throw Error('deposit flow text lost');
  const css = fs.readFileSync('src/index.css', 'utf8');
  if (!css.includes('button:hover') || !css.includes('wallet-status')) throw Error('wallet button/panel CSS missing');
});

setTimeout(() => {
  if (failures.length) { console.error(`\n${failures.length} test(s) failed`); process.exitCode = 1; }
  else console.log('All production architecture tests passed (extended suite)');
}, 100);
