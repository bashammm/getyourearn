var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// server.ts
var import_config = require("dotenv/config");
var import_express = __toESM(require("express"), 1);
var import_node_fs3 = __toESM(require("node:fs"), 1);
var import_node_path3 = __toESM(require("node:path"), 1);
var import_node_os = __toESM(require("node:os"), 1);
var import_node_crypto5 = __toESM(require("node:crypto"), 1);

// server/solana/provider.ts
var import_web3 = require("@solana/web3.js");
var firstUrl = (names, fallback = "") => {
  for (const n of names) {
    const v = (process.env[n] || "").trim();
    if (v) return v;
  }
  return fallback;
};
var SolanaProviderManager = class {
  constructor() {
    this.activeIndex = 0;
    this.cluster = process.env.SOLANA_CLUSTER === "devnet" || process.env.SOLANA_NETWORK === "devnet" ? "devnet" : "mainnet-beta";
    this.connections = /* @__PURE__ */ new Map();
    const d = this.cluster === "devnet";
    this.providers = [{ id: "helius", name: "Helius", url: firstUrl(["SOLANA_RPC_URL", "HELIUS_SOLANA_RPC_URL"], ""), latencyMs: null, errorCount: 0, successCount: 0, lastChecked: null, isHealthy: false }, { id: "alchemy", name: "Alchemy", url: firstUrl(["SOLANA_RPC_URL_2", "ALCHEMY_SOLANA_RPC_URL"], ""), latencyMs: null, errorCount: 0, successCount: 0, lastChecked: null, isHealthy: false }, { id: "quicknode", name: "QuickNode", url: firstUrl(["SOLANA_RPC_URL_3", "QUICKNODE_SOLANA_RPC_URL"], ""), latencyMs: null, errorCount: 0, successCount: 0, lastChecked: null, isHealthy: false }, { id: "public", name: "Solana Public RPC", url: d ? "https://api.devnet.solana.com" : "https://api.mainnet-beta.solana.com", latencyMs: null, errorCount: 0, successCount: 0, lastChecked: null, isHealthy: false }];
  }
  getCluster() {
    return this.cluster;
  }
  getActiveProvider() {
    for (let n = 0; n < this.providers.length; n++) {
      const p = this.providers[(this.activeIndex + n) % this.providers.length];
      if (p.url) {
        this.activeIndex = this.providers.indexOf(p);
        return p;
      }
    }
    throw new Error("No Solana RPC provider");
  }
  getConnection() {
    return this.conn(this.getActiveProvider());
  }
  conn(p) {
    let c = this.connections.get(p.url);
    if (!c) {
      c = new import_web3.Connection(p.url, { commitment: "confirmed", confirmTransactionInitialTimeout: 3e4 });
      this.connections.set(p.url, c);
    }
    return c;
  }
  async fail(fn) {
    let last;
    for (let n = 0; n < this.providers.length; n++) {
      const i = (this.activeIndex + n) % this.providers.length, p = this.providers[i];
      if (!p.url) continue;
      const t = Date.now();
      try {
        const v = await fn(this.conn(p));
        p.latencyMs = Date.now() - t;
        p.lastChecked = Date.now();
        p.successCount++;
        p.isHealthy = true;
        this.activeIndex = i;
        return v;
      } catch (e) {
        p.latencyMs = Date.now() - t;
        p.lastChecked = Date.now();
        p.errorCount++;
        p.isHealthy = false;
        last = e;
      }
    }
    throw new Error(`All available Solana RPC providers failed: ${last?.message || "unknown error"}`);
  }
  mask(u) {
    if (!u) return "Not configured";
    try {
      const x = new URL(u);
      return x.origin + x.pathname + (x.search ? "?\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022" : "");
    } catch {
      return "Configured";
    }
  }
  getHealthSummary() {
    return this.providers.map((p, i) => ({ id: p.id, name: p.name, url: this.mask(p.url), isActive: i === this.activeIndex, isHealthy: p.isHealthy, latencyMs: p.latencyMs, errorRatePercent: p.successCount + p.errorCount ? Math.round(p.errorCount / (p.successCount + p.errorCount) * 1e3) / 10 : null, lastChecked: p.lastChecked, supportedFeatures: ["read", "simulate", "confirm", "reconcile"] }));
  }
  async getBalanceLamports(a) {
    const r = await this.fail((c) => c.getBalance(new import_web3.PublicKey(a), "confirmed"));
    return r;
  }
  async getBalanceSol(a) {
    return await this.getBalanceLamports(a) / import_web3.LAMPORTS_PER_SOL;
  }
  async getSignaturesForAddress(a, l = 25, b) {
    return this.fail((c) => c.getSignaturesForAddress(new import_web3.PublicKey(a), { limit: l, before: b }));
  }
  async getParsedTransaction(s) {
    return this.fail((c) => c.getParsedTransaction(s, { commitment: "confirmed", maxSupportedTransactionVersion: 0 }));
  }
  async getSignatureStatuses(s) {
    return this.fail((c) => c.getSignatureStatuses(s, { searchTransactionHistory: true }));
  }
  async getBlockHeight() {
    return this.fail((c) => c.getBlockHeight("confirmed"));
  }
  async getLatestBlockhash() {
    return this.fail((c) => c.getLatestBlockhash("confirmed"));
  }
  async simulateSolTransfer(from, destination, amountSol) {
    const f = new import_web3.PublicKey(from), to = new import_web3.PublicKey(destination), bh = await this.getLatestBlockhash();
    const tx = new import_web3.Transaction({ recentBlockhash: bh.blockhash, feePayer: f }).add(import_web3.SystemProgram.transfer({ fromPubkey: f, toPubkey: to, lamports: Math.floor(Number(amountSol) * import_web3.LAMPORTS_PER_SOL) }));
    const result = await this.fail((c) => c.simulateTransaction(new import_web3.VersionedTransaction(tx.compileMessage()), { sigVerify: false, replaceRecentBlockhash: true }));
    return result;
  }
  async validateTransferIntent(from, destination, amountSol) {
    try {
      const f = new import_web3.PublicKey(from), to = new import_web3.PublicKey(destination);
      if (f.equals(to)) return { ok: false, error: "Destination must differ from treasury vault" };
      if (!import_web3.PublicKey.isOnCurve(to.toBytes())) return { ok: false, error: "Destination is not an on-curve Solana address" };
      const amount = Number(amountSol);
      if (!Number.isFinite(amount) || amount <= 0) return { ok: false, error: "Transfer amount must be positive" };
      const bal = await this.getBalanceSol(from);
      const bh = await this.getLatestBlockhash();
      const tx = new import_web3.Transaction({ recentBlockhash: bh.blockhash, feePayer: f }).add(import_web3.SystemProgram.transfer({ fromPubkey: f, toPubkey: to, lamports: Math.floor(amount * import_web3.LAMPORTS_PER_SOL) }));
      const fee = await this.fail((c) => c.getFeeForMessage(tx.compileMessage(), "confirmed"));
      if (bal < amount + (fee.value ?? 5e3) / import_web3.LAMPORTS_PER_SOL) return { ok: false, error: "Insufficient balance for requested transfer plus network fee" };
      return { ok: true, preview: { from: f.toBase58(), to: to.toBase58(), amountSol, balanceSol: bal, lastValidBlockHeight: bh.lastValidBlockHeight, feeLamports: fee.value ?? 5e3 } };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }
  async preparePhantomDeposit(phantomWallet, treasury, amountSol) {
    const from = new import_web3.PublicKey(phantomWallet), to = new import_web3.PublicKey(treasury);
    if (from.equals(to)) throw new Error("Phantom wallet and treasury destination must differ");
    const amount = Number(amountSol);
    if (!Number.isFinite(amount) || amount <= 0) throw new Error("Deposit amount must be positive");
    const [phantomLamports, bh] = await Promise.all([this.getBalanceLamports(phantomWallet), this.getLatestBlockhash()]);
    const lamports = Math.floor(amount * import_web3.LAMPORTS_PER_SOL);
    const tx = new import_web3.Transaction({ recentBlockhash: bh.blockhash, feePayer: from }).add(import_web3.SystemProgram.transfer({ fromPubkey: from, toPubkey: to, lamports }));
    const feeInfo = await this.fail((c) => c.getFeeForMessage(tx.compileMessage(), "confirmed"));
    const feeLamports = feeInfo.value ?? 5e3;
    if (phantomLamports < lamports + feeLamports) throw new Error("Phantom wallet lacks enough SOL for deposit plus network fee");
    const sim = await this.fail((c) => c.simulateTransaction(new import_web3.VersionedTransaction(tx.compileMessage()), { sigVerify: false, replaceRecentBlockhash: true }));
    if (sim?.value?.err || sim?.err) throw new Error(`Deposit simulation failed: ${JSON.stringify(sim?.value?.err || sim?.err)}`);
    return { ok: true, from: from.toBase58(), destination: to.toBase58(), amountLamports: lamports, amountSol: lamports / import_web3.LAMPORTS_PER_SOL, feeLamports, feeSol: feeLamports / import_web3.LAMPORTS_PER_SOL, lastValidBlockHeight: bh.lastValidBlockHeight, serializedTransaction: Buffer.from(tx.serialize({ requireAllSignatures: false, verifySignatures: false })).toString("base64") };
  }
  async preparePhantomInitialWithdrawal(source, phantomWallet, percent = 30) {
    const from = new import_web3.PublicKey(source), to = new import_web3.PublicKey(phantomWallet);
    if (from.equals(to)) throw new Error("Withdrawal destination must be the connected Phantom wallet and must differ from the treasury source");
    if (!import_web3.PublicKey.isOnCurve(to.toBytes())) throw new Error("Connected Phantom wallet is not an on-curve Solana address");
    if (!Number.isFinite(percent) || percent <= 0 || percent > 100) throw new Error("Withdrawal percentage must be between 0 and 100");
    const [sourceLamports, phantomLamports, bh] = await Promise.all([this.getBalanceLamports(source), this.getBalanceLamports(phantomWallet), this.getLatestBlockhash()]);
    if (sourceLamports <= 0) throw new Error("Treasury has no SOL. Phantom will not be prompted and no gas will be requested.");
    const amountLamports = Math.floor(sourceLamports * percent / 100);
    if (amountLamports <= 0) throw new Error("Calculated withdrawal amount is zero. Phantom will not be prompted.");
    const tx = new import_web3.Transaction({ recentBlockhash: bh.blockhash, feePayer: to }).add(import_web3.SystemProgram.transfer({ fromPubkey: from, toPubkey: to, lamports: amountLamports }));
    const feeInfo = await this.fail((c) => c.getFeeForMessage(tx.compileMessage(), "confirmed"));
    const feeLamports = feeInfo.value ?? 5e3;
    if (phantomLamports < feeLamports) throw new Error(`Connected Phantom wallet does not have enough SOL for the network fee (${feeLamports} lamports). Phantom will not be prompted.`);
    const sim = await this.fail((c) => c.simulateTransaction(new import_web3.VersionedTransaction(tx.compileMessage()), { sigVerify: false, replaceRecentBlockhash: true }));
    if (sim?.value?.err || sim?.err) throw new Error(`Withdrawal simulation failed; Phantom will not be prompted: ${JSON.stringify(sim?.value?.err || sim?.err)}`);
    return { ok: true, percent, source: from.toBase58(), destination: to.toBase58(), amountLamports, amountSol: amountLamports / import_web3.LAMPORTS_PER_SOL, feeLamports, feeSol: feeLamports / import_web3.LAMPORTS_PER_SOL, phantomBalanceLamports: phantomLamports, lastValidBlockHeight: bh.lastValidBlockHeight, serializedTransaction: Buffer.from(tx.serialize({ requireAllSignatures: false, verifySignatures: false })).toString("base64"), requiresSourceAuthorization: !from.equals(to), warning: "The treasury source must still be authorized by its owner or Squads vault. Phantom is fee payer and recipient only." };
  }
  async getNetSolInflowSince(address, sinceMs, untilMs = Date.now()) {
    let before, complete = false, net = 0n;
    for (let page = 0; page < 10; page++) {
      const sigs = await this.getSignaturesForAddress(address, 1e3, before);
      if (!sigs.length) {
        complete = true;
        break;
      }
      for (const s of sigs) {
        const bt = typeof s.blockTime === "number" ? s.blockTime * 1e3 : null;
        if (bt === null) continue;
        if (bt < sinceMs) {
          complete = true;
          break;
        }
        if (bt > untilMs) continue;
        const tx = await this.getParsedTransaction(s.signature);
        const idx = tx?.transaction?.message?.accountKeys?.findIndex((k) => (k.pubkey?.toBase58?.() || String(k.pubkey)) === address) ?? -1;
        if (idx < 0 || !tx?.meta || s.err || tx.meta.err) continue;
        net += BigInt((tx.meta.postBalances[idx] ?? 0) - (tx.meta.preBalances[idx] ?? 0));
      }
      if (complete) break;
      before = sigs[sigs.length - 1].signature;
    }
    if (!complete) throw new Error("Unable to prove the entire SOL inflow window; no revenue amount calculated");
    return { lamports: net.toString(), sol: Number(net) / 1e9, sinceMs, untilMs };
  }
  /** Extract all SystemProgram transfer instructions (top-level + inner) from a parsed transaction. Never trusts balance deltas alone. */
  extractSystemTransfers(tx) {
    const out = [];
    const push = (info) => {
      try {
        if (!info || typeof info !== "object") return;
        const dest = String(info.destination || info.to || "");
        const src = String(info.source || info.from || "");
        const lam = info.lamports;
        if (!dest || !src || lam === void 0 || lam === null) return;
        out.push({ source: src, destination: dest, lamports: BigInt(String(lam)) });
      } catch {
      }
    };
    try {
      const ixs = tx?.transaction?.message?.instructions || [];
      for (const ix of ixs) {
        const parsed = ix?.parsed;
        if (parsed?.type === "transfer" && parsed?.info) push(parsed.info);
        else if (ix?.program === "system" && ix?.parsed?.info) push(ix.parsed.info);
      }
      const inner = tx?.meta?.innerInstructions || [];
      for (const g of inner) {
        for (const ix of g?.instructions || []) {
          const parsed = ix?.parsed;
          if (parsed?.type === "transfer" && parsed?.info) push(parsed.info);
        }
      }
    } catch {
    }
    return out;
  }
  /** Server-side authoritative SOL payment verification. Checks existence, success, confirmation, exact SystemProgram transfer(s), sender/recipient, and balance-delta consistency. */
  async verifySolPayment(opts) {
    const { signature, recipient, expectedLamports, expectedSender } = opts;
    const requireFinality = opts.requireFinality !== false;
    if (!signature || !recipient) throw new Error("signature and recipient are required");
    if (expectedLamports <= 0n) throw new Error("expected amount must be positive");
    let recipientKey;
    let senderKey = null;
    try {
      recipientKey = new import_web3.PublicKey(recipient).toBase58();
    } catch {
      throw new Error("Recipient is not a valid Solana address");
    }
    if (expectedSender) {
      try {
        senderKey = new import_web3.PublicKey(expectedSender).toBase58();
      } catch {
        throw new Error("Expected sender is not a valid Solana address");
      }
    }
    const tx = await this.getParsedTransaction(signature);
    if (!tx?.meta) throw new Error("Transaction not found or metadata unavailable");
    if (tx.meta.err) throw new Error("Transaction failed on-chain; failed transactions can never verify payment");
    const keys = tx.transaction?.message?.accountKeys || [];
    const keyStr = (k) => {
      try {
        return k?.pubkey?.toBase58?.() || String(k?.pubkey || k);
      } catch {
        return String(k);
      }
    };
    const idx = keys.findIndex((k) => keyStr(k) === recipientKey);
    if (idx < 0) throw new Error("Recipient was not present in the verified transaction");
    try {
      const st = await this.getSignatureStatuses([signature]);
      const s0 = st?.value?.[0];
      if (s0?.err) throw new Error("Transaction failed on-chain");
      if (requireFinality && s0 && s0.confirmationStatus && s0.confirmationStatus !== "confirmed" && s0.confirmationStatus !== "finalized") throw new Error(`Transaction is not yet confirmed (status=${s0.confirmationStatus}); retry after confirmation`);
    } catch (e) {
      if (String(e?.message || "").includes("not yet confirmed")) throw e;
    }
    const transfers = this.extractSystemTransfers(tx);
    const matching = transfers.filter((t) => t.destination === recipientKey && (!senderKey || t.source === senderKey));
    if (!matching.length) throw new Error("No verified SystemProgram transfer to the intended recipient in this transaction; balance deltas alone are not payment proof");
    if (senderKey && !matching.some((t) => t.source === senderKey)) throw new Error("Verified transfer sender does not match the expected sender");
    const totalMatching = matching.reduce((n, t) => n + t.lamports, 0n);
    if (totalMatching !== expectedLamports) throw new Error(`Verified transfer total ${totalMatching.toString()} lamports does not equal expected ${expectedLamports.toString()} lamports`);
    const delta = BigInt((tx.meta.postBalances[idx] ?? 0) - (tx.meta.preBalances[idx] ?? 0));
    if (delta < expectedLamports) throw new Error("Recipient balance delta is smaller than the verified transfer total; unrelated transfers or fees detected");
    const sender = matching[0]?.source || null;
    return { verified: true, signature, recipient: recipientKey, sender, lamports: expectedLamports, amountSol: Number(expectedLamports) / import_web3.LAMPORTS_PER_SOL, transferCount: matching.length, totalTransfersObserved: transfers.length, balanceDeltaLamports: delta.toString(), blockTime: tx.blockTime || null, slot: tx.slot ?? null, provider: this.getActiveProvider().name, cluster: this.getCluster() };
  }
};

// server/security/guard.ts
var import_node_crypto = __toESM(require("node:crypto"), 1);
var SecurityGuard = class {
  constructor() {
    this.hits = /* @__PURE__ */ new Map();
  }
  checkRateLimit(key, limit = 120, windowMs = 6e4) {
    const now = Date.now();
    for (const [k, v] of this.hits) if (now > v.reset) this.hits.delete(k);
    const x = this.hits.get(key);
    if (!x || now > x.reset) {
      this.hits.set(key, { count: 1, reset: now + windowMs });
      return { allowed: true, reset: now + windowMs };
    }
    x.count++;
    return { allowed: x.count <= limit, reset: x.reset };
  }
  static constantTimeCompare(a, b) {
    const A = Buffer.from(a), B = Buffer.from(b);
    return A.length === B.length && import_node_crypto.default.timingSafeEqual(A, B);
  }
};

// server/core/store.ts
var import_node_fs = __toESM(require("node:fs"), 1);
var import_node_path = __toESM(require("node:path"), 1);
var import_node_crypto2 = __toESM(require("node:crypto"), 1);
var empty = () => ({ agents: [], strategies: [], opportunities: [], signals: [], tasks: [], allocations: [], revenue: [], revenueProducts: [], revenueOrders: [], transactions: [], riskEvents: [], audit: [], system: { emergencyStop: false, reason: "", updatedAt: Date.now() } });
var CoreStore = class {
  constructor() {
    this.file = import_node_path.default.join(process.cwd(), "data", "core-state.json");
    import_node_fs.default.mkdirSync(import_node_path.default.dirname(this.file), { recursive: true });
    try {
      this.state = { ...empty(), ...JSON.parse(import_node_fs.default.readFileSync(this.file, "utf8")) };
    } catch {
      this.state = empty();
    }
    this.migrate();
    this.seed();
  }
  save() {
    try {
      const tmp = `${this.file}.tmp-${process.pid}`;
      import_node_fs.default.writeFileSync(tmp, JSON.stringify(this.state, null, 2), { mode: 384 });
      import_node_fs.default.renameSync(tmp, this.file);
      try {
        import_node_fs.default.chmodSync(this.file, 384);
      } catch {
      }
    } catch {
      import_node_fs.default.writeFileSync(this.file, JSON.stringify(this.state, null, 2), { mode: 384 });
    }
  }
  migrate() {
    const e = empty();
    for (const k of Object.keys(e)) {
      if (this.state[k] === void 0) this.state[k] = e[k];
    }
  }
  seed() {
    if (!this.state.strategies.length) this.state.strategies = [
      ["analytics", "Analytics & data services", true],
      ["wallet-reports", "Wallet/token reports", true],
      ["security-analysis", "Security analysis", true],
      ["launch-packages", "Launch packages", true],
      ["premium-alerts", "Premium alerts", true],
      ["api-data", "API/data services", true],
      ["research", "Research services", true],
      ["treasury-reporting", "Treasury reporting", true],
      ["portfolio-analytics", "Portfolio analytics", true],
      ["liquidity-monitoring", "Liquidity monitoring", true],
      ["risk-monitoring", "Risk monitoring", true],
      ["indexing", "Indexing/data-quality services", true],
      ["automation", "Automation services", true],
      ["data-quality", "Data-quality services", true],
      ["defi-opportunity", "Risk-reviewed DeFi opportunities", false],
      ["arbitrage", "Economically viable arbitrage", false],
      ["liquidity", "Risk-adjusted liquidity strategies", false]
    ].map(([id, name, zero]) => ({ id: String(id), name: String(name), category: String(id), capitalRequiredSol: zero ? 0 : 0.1, minExpectedReturnPct: 0, riskLevel: zero ? "LOW" : "HIGH", supportsZeroCapital: Boolean(zero), enabled: true, description: `Extensible ${name} strategy; no earnings are assumed without verified evidence.` }));
    if (!this.state.agents.length) for (let i = 1; i <= 20; i++) this.state.agents.push({ id: `agent-${String(i).padStart(2, "0")}`, walletAddress: null, strategyPermissions: this.state.strategies.filter((s) => s.supportsZeroCapital).map((s) => s.id), budgetSol: 0, riskProfile: "STANDARD", supportedNetworks: ["solana"], minimumExpectedReturnPct: 0, gasReserveSol: 0.01, dailyLossLimitSol: 0, exposureLimitSol: 0, performance: { verifiedRevenueSol: 0, verifiedCostSol: 0, executions: 0, successes: 0 }, status: "ACTIVE", heartbeat: Date.now(), independentDecisionId: null });
    if (!this.state.revenueProducts.length) this.state.revenueProducts = [
      ["wallet-report", "Wallet Intelligence Report", "analytics", "Customer-paid on-chain wallet analysis.", "0.02", "SOL", "AUTOMATED", "0"],
      ["token-risk-report", "Token Risk Report", "security-analysis", "Evidence-backed token and contract risk report.", "0.04", "SOL", "AUTOMATED", "0"],
      ["premium-alerts", "Premium On-Chain Alerts", "premium-alerts", "Subscription access to configurable on-chain alerts.", "0.04", "SOL", "AUTOMATED", "0"],
      ["api-access", "YABBAI Data API", "api-data", "Paid API access to verified on-chain analytics.", "0.10", "SOL", "API", "0"],
      ["custom-research", "Custom Crypto Research", "research", "Customer-requested research delivered from verifiable sources.", "0.10", "SOL", "MANUAL", "0"]
    ].map((x) => ({ id: x[0], name: x[1], category: x[2], description: x[3], priceAmount: x[4], priceAsset: x[5], deliveryMode: x[6], capitalRequiredSol: x[7], enabled: true, createdAt: Date.now() }));
    this.save();
  }
  get() {
    return structuredClone(this.state);
  }
  upsertOpportunity(o) {
    const i = this.state.opportunities.findIndex((x) => x.id === o.id);
    if (i >= 0) this.state.opportunities[i] = o;
    else this.state.opportunities.unshift(o);
    this.state.opportunities = this.state.opportunities.slice(0, 1e3);
    this.save();
    return o;
  }
  addTask(t) {
    if (!this.state.tasks.some((x) => x.idempotencyKey === t.idempotencyKey)) {
      this.state.tasks.unshift(t);
      this.save();
    }
    return this.state.tasks.find((x) => x.idempotencyKey === t.idempotencyKey);
  }
  addSignal(s) {
    this.state.signals.unshift(s);
    this.save();
    return s;
  }
  addRevenue(r) {
    if (this.state.revenue.some((x) => x.idempotencyKey === r.idempotencyKey || x.externalId === r.externalId)) return this.state.revenue.find((x) => x.idempotencyKey === r.idempotencyKey || x.externalId === r.externalId);
    this.state.revenue.unshift(r);
    this.save();
    return r;
  }
  addProduct(p) {
    if (!this.state.revenueProducts.some((x) => x.id === p.id)) this.state.revenueProducts.unshift(p);
    this.save();
    return p;
  }
  addOrder(o) {
    if (!this.state.revenueOrders.some((x) => x.id === o.id)) this.state.revenueOrders.unshift(o);
    this.save();
    return o;
  }
  updateOrder(id, patch) {
    const x = this.state.revenueOrders.find((x2) => x2.id === id);
    if (!x) throw new Error("Unknown order");
    Object.assign(x, patch, { updatedAt: Date.now() });
    this.save();
    return x;
  }
  addAllocation(a) {
    if (!this.state.allocations.some((x) => x.id === a.id)) this.state.allocations.unshift(a);
    this.save();
    return a;
  }
  addTx(t) {
    if (!this.state.transactions.some((x) => x.id === t.idempotencyKey || x.id === t.id)) this.state.transactions.unshift(t);
    this.save();
    return t;
  }
  updateTx(id, patch) {
    const x = this.state.transactions.find((x2) => x2.id === id);
    if (!x) throw new Error("Unknown transaction");
    Object.assign(x, patch, { updatedAt: Date.now() });
    this.save();
    return x;
  }
  audit(action, actor, entityType, entityId, result, metadata) {
    this.state.audit.unshift({ id: import_node_crypto2.default.randomUUID(), at: Date.now(), action, actor, entityType, entityId, result, metadata });
    this.state.audit = this.state.audit.slice(0, 5e3);
    this.save();
  }
  risk(type, severity, message, entityId) {
    this.state.riskEvents.unshift({ id: import_node_crypto2.default.randomUUID(), type, severity, message, createdAt: Date.now(), entityId });
    this.save();
  }
  setEmergencyStop(on, reason = "") {
    this.state.system = { emergencyStop: on, reason, updatedAt: Date.now() };
    this.save();
  }
};

// server/core/engines.ts
var import_node_crypto3 = __toESM(require("node:crypto"), 1);
var OpportunityRegistry = class {
  constructor(store) {
    this.store = store;
  }
  async discover() {
    const feed = (process.env.OPPORTUNITY_FEED_URL || "").trim();
    if (feed) {
      if (!feed.startsWith("https://")) throw new Error("OPPORTUNITY_FEED_URL must use HTTPS");
      const r = await fetch(feed, { signal: AbortSignal.timeout(1e4) });
      if (!r.ok) throw new Error(`Opportunity feed HTTP ${r.status}`);
      const body = await r.json();
      for (const item of Array.isArray(body) ? body : body.opportunities || []) this.ingestExternal(item);
    }
    return this.store.get().opportunities;
  }
  ingestExternal(input) {
    const now = Date.now();
    if (!input.strategyId || !this.store.get().strategies.some((s) => s.id === input.strategyId)) throw new Error("Unknown strategy");
    const o = { id: input.id || import_node_crypto3.default.randomUUID(), strategyId: input.strategyId, title: input.title || "External opportunity", source: input.source || "external-feed", discoveredAt: input.discoveredAt || now, expiresAt: input.expiresAt ?? null, expectedGrossSol: Number(input.expectedGrossSol || 0), networkFeesSol: Number(input.networkFeesSol || 0), tradingFeesSol: Number(input.tradingFeesSol || 0), slippageSol: Number(input.slippageSol || 0), riskCostSol: Number(input.riskCostSol || 0), capitalCostSol: Number(input.capitalCostSol || 0), scoreSol: 0, status: "ESTIMATED", capitalRequiredSol: Number(input.capitalRequiredSol || 0), evidenceUrl: input.evidenceUrl, metadata: input.metadata };
    return this.store.upsertOpportunity(o);
  }
  discoverZeroCapitalProducts() {
    const now = Date.now();
    const strategies = this.store.get().strategies;
    for (const p of this.store.get().revenueProducts.filter((x) => x.enabled && Number(x.capitalRequiredSol) === 0)) {
      const strategy = strategies.find((s) => s.id === p.category) || strategies.find((s) => s.id === "analytics");
      if (!strategy) continue;
      this.store.upsertOpportunity({ id: `product:${p.id}`, strategyId: strategy.id, title: `Customer revenue: ${p.name}`, source: "yabbai-product-catalog", discoveredAt: now, expiresAt: null, expectedGrossSol: 0, networkFeesSol: 0, tradingFeesSol: 0, slippageSol: 0, riskCostSol: 0, capitalCostSol: 0, scoreSol: 0, status: "ESTIMATED", capitalRequiredSol: 0, metadata: { productId: p.id, priceAmount: p.priceAmount, priceAsset: p.priceAsset, kind: "customer-revenue", note: "Potential revenue only; no customer payment has been counted." } });
    }
    return this.store.get().opportunities.filter((o) => o.capitalRequiredSol === 0);
  }
};
var YieldRanker = class {
  rank(opportunities) {
    return [...opportunities].map((o) => ({ ...o, scoreSol: o.expectedGrossSol - o.networkFeesSol - o.tradingFeesSol - o.slippageSol - o.riskCostSol - o.capitalCostSol })).sort((a, b) => b.scoreSol - a.scoreSol);
  }
};
var CurrentPredicamentEngine = class {
  state(capitalSol) {
    const levels = [0, 20, 50, 100, 250, 500, 1e3, 2500, 5e3, 1e4, 25e3];
    let current = levels[0];
    for (const x of levels) if (capitalSol >= x) current = x;
    return { current, next: levels.find((x) => x > capitalSol) || null, levels, maximumReached: current };
  }
};
var ThresholdEngine = class {
  eligible(o, capitalSol) {
    return o.capitalRequiredSol <= capitalSol;
  }
};
var EarningTaskQueue = class {
  constructor(store) {
    this.store = store;
  }
  enqueue(o, agent) {
    const idempotencyKey = `${o.id}:${agent.id}`;
    return this.store.addTask({ id: import_node_crypto3.default.randomUUID(), opportunityId: o.id, agentId: agent.id, stage: "discover", status: "QUEUED", idempotencyKey, createdAt: Date.now(), updatedAt: Date.now() });
  }
};
var FleetEngine = class {
  constructor(store) {
    this.store = store;
  }
  heartbeat(id) {
    const s = this.store.get();
    const a = s.agents.find((x) => x.id === id);
    if (!a) throw new Error("Unknown agent");
    const idx = this.store.state.agents.findIndex((x) => x.id === id);
    this.store.state.agents[idx].heartbeat = Date.now();
    this.store.state.agents[idx].independentDecisionId = import_node_crypto3.default.randomUUID();
    return this.store.get().agents[idx];
  }
  canEvaluate(a, o, strategy) {
    return a.status === "ACTIVE" && a.strategyPermissions.includes(strategy.id) && a.supportedNetworks.includes("solana") && a.budgetSol >= o.capitalRequiredSol && a.minimumExpectedReturnPct <= strategy.minExpectedReturnPct + 1e3;
  }
};
var StrategySignalBus = class {
  constructor(store) {
    this.store = store;
  }
  publish(opportunityId, originAgentId, agentIds) {
    const s = { id: import_node_crypto3.default.randomUUID(), opportunityId, createdAt: Date.now(), expiresAt: Date.now() + 9e5, originAgentId, sharedWith: agentIds.filter((x) => x !== originAgentId), independentRequired: true };
    return this.store.addSignal(s);
  }
};

// server/core/supabase.ts
var SupabaseMirror = class {
  constructor() {
    this.enabled = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
    this.base = "";
    this.key = "";
    this.base = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
    this.key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  }
  async upsert(table, rows) {
    if (!rows.length) return;
    const r = await fetch(`${this.base}/rest/v1/${table}`, { method: "POST", headers: { apikey: this.key, Authorization: `Bearer ${this.key}`, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(rows) });
    if (!r.ok) throw new Error(`Supabase ${table} sync failed: ${r.status}`);
  }
  async snapshot(s) {
    if (!this.enabled) return;
    await this.upsert("agents", s.agents.map((x) => ({ id: x.id, wallet_address: x.walletAddress, strategy_permissions: x.strategyPermissions, budget_sol: x.budgetSol, risk_profile: x.riskProfile, supported_networks: x.supportedNetworks, minimum_expected_return_pct: x.minimumExpectedReturnPct, gas_reserve_sol: x.gasReserveSol, daily_loss_limit_sol: x.dailyLossLimitSol, exposure_limit_sol: x.exposureLimitSol, performance: x.performance, status: x.status, heartbeat: x.heartbeat, independent_decision_id: x.independentDecisionId })));
    await this.upsert("strategies", s.strategies.map((x) => ({ id: x.id, name: x.name, category: x.category, capital_required_sol: x.capitalRequiredSol, min_expected_return_pct: x.minExpectedReturnPct, risk_level: x.riskLevel, supports_zero_capital: x.supportsZeroCapital, enabled: x.enabled, description: x.description })));
    await this.upsert("opportunities", s.opportunities.map((x) => ({ id: x.id, strategy_id: x.strategyId, title: x.title, source: x.source, discovered_at: x.discoveredAt, expires_at: x.expiresAt, expected_gross_sol: x.expectedGrossSol, network_fees_sol: x.networkFeesSol, trading_fees_sol: x.tradingFeesSol, slippage_sol: x.slippageSol, risk_cost_sol: x.riskCostSol, capital_cost_sol: x.capitalCostSol, score_sol: x.scoreSol, status: x.status, capital_required_sol: x.capitalRequiredSol, evidence_url: x.evidenceUrl, metadata: x.metadata })));
    await this.upsert("signals", s.signals.map((x) => ({ id: x.id, opportunity_id: x.opportunityId, created_at: x.createdAt, expires_at: x.expiresAt, origin_agent_id: x.originAgentId, shared_with: x.sharedWith, independent_required: true })));
    await this.upsert("tasks", s.tasks.map((x) => ({ id: x.id, opportunity_id: x.opportunityId, agent_id: x.agentId, stage: x.stage, status: x.status, idempotency_key: x.idempotencyKey, created_at: x.createdAt, updated_at: x.updatedAt, reason: x.reason })));
    await this.upsert("allocations", s.allocations.map((x) => ({ id: x.id, bucket: x.bucket, amount_sol: x.amountSol, agent_id: x.agentId, strategy_id: x.strategyId, status: x.status, created_at: x.createdAt })));
    await this.upsert("revenue", s.revenue.map((x) => ({ id: x.id, source: x.source, external_id: x.externalId, recipient: x.recipient, asset: x.asset, amount: x.amount, network: x.network, timestamp: x.timestamp, signature: x.signature, status: x.status, idempotency_key: x.idempotencyKey, evidence: x.evidence, created_at: x.createdAt })));
    await this.upsert("transactions", s.transactions.map((x) => ({ id: x.id, kind: x.kind, state: x.state, signature: x.signature, created_at: x.createdAt, updated_at: x.updatedAt, idempotency_key: x.idempotencyKey, amount_sol: x.amountSol, destination: x.destination, error: x.error })));
    await this.upsert("risk_events", s.riskEvents.map((x) => ({ id: x.id, type: x.type, severity: x.severity, message: x.message, created_at: x.createdAt, entity_id: x.entityId })));
    await this.upsert("audit_logs", s.audit.map((x) => ({ id: x.id, at: x.at, action: x.action, actor: x.actor, entity_type: x.entityType, entity_id: x.entityId, result: x.result, metadata: x.metadata })));
  }
};

// server/core/runtime.ts
var Runtime = class {
  constructor() {
    this.store = new CoreStore();
    this.mirror = new SupabaseMirror();
    this.registry = new OpportunityRegistry(this.store);
    this.ranker = new YieldRanker();
    this.predicament = new CurrentPredicamentEngine();
    this.threshold = new ThresholdEngine();
    this.queue = new EarningTaskQueue(this.store);
    this.fleet = new FleetEngine(this.store);
    this.signals = new StrategySignalBus(this.store);
  }
  async persist() {
    if (this.mirror.enabled) await this.mirror.snapshot(this.store.get());
  }
  async autopilot() {
    const s = this.store.get();
    const ranked = this.ranker.rank(s.opportunities.filter((o) => o.status === "ESTIMATED"));
    const capital = s.allocations.filter((a) => a.status === "EXECUTED").reduce((n, a) => n + Number(a.amountSol), 0);
    const zeroCapital = s.opportunities.filter((o) => o.capitalRequiredSol === 0 && o.status === "ESTIMATED");
    const eligible = ranked.filter((o) => this.threshold.eligible(o, capital));
    for (const o of eligible.slice(0, 20)) {
      const strategy = s.strategies.find((x) => x.id === o.strategyId);
      if (!strategy) continue;
      const agents = s.agents.filter((a) => this.fleet.canEvaluate(a, o, strategy));
      if (!agents.length) continue;
      const origin2 = agents[0];
      this.signals.publish(o.id, origin2.id, agents.map((a) => a.id));
      for (const agent of agents.slice(0, 20)) this.queue.enqueue(o, agent);
    }
    return { ranked, capital, threshold: this.predicament.state(capital), zeroCapitalOpportunities: zeroCapital.length, queuedAgents: eligible.map((o) => ({ opportunityId: o.id, agents: s.agents.filter((a) => a.status === "ACTIVE").map((a) => a.id) })) };
  }
};

// server/treasury/authorization.ts
var import_node_crypto4 = __toESM(require("node:crypto"), 1);
var TreasuryAuthorizationService = class {
  constructor(store, provider) {
    this.store = store;
    this.provider = provider;
  }
  async createTransferIntent(destination, amountSol, idempotencyKey) {
    if (this.store.get().system.emergencyStop) throw new Error("Emergency stop engaged");
    if (!idempotencyKey) throw new Error("Idempotency key is required");
    if (this.store.get().transactions.some((x) => x.idempotencyKey === idempotencyKey)) return this.store.get().transactions.find((x) => x.idempotencyKey === idempotencyKey);
    const from = process.env.TREASURY_VAULT_ADDRESS || process.env.WATCH_WALLET;
    if (!from) throw new Error("TREASURY_VAULT_ADDRESS or WATCH_WALLET is required");
    const tx = { id: import_node_crypto4.default.randomUUID(), kind: "TRANSFER_INTENT", state: "REQUEST", createdAt: Date.now(), updatedAt: Date.now(), idempotencyKey, amountSol, destination };
    this.store.addTx(tx);
    this.store.audit("transfer_intent_created", "system", "transaction", tx.id, "PENDING", { destination, amountSol });
    this.store.updateTx(tx.id, { state: "VALIDATE" });
    const state = await this.provider.validateTransferIntent(from, destination, amountSol);
    this.store.updateTx(tx.id, { state: state.ok ? "FETCH_STATE" : "FAILED", error: state.ok ? void 0 : state.error });
    if (state.ok) {
      this.store.updateTx(tx.id, { state: "BUILD" });
      this.store.updateTx(tx.id, { state: "SIMULATE" });
      const sim = await this.provider.simulateSolTransfer(from, destination, amountSol).catch((e) => ({ err: e.message }));
      if (sim?.err || sim?.value?.err) {
        this.store.updateTx(tx.id, { state: "FAILED", error: `Simulation failed: ${JSON.stringify(sim.err || sim.value.err)}` });
        throw new Error(`Simulation failed: ${JSON.stringify(sim.err || sim.value.err)}`);
      }
      this.store.updateTx(tx.id, { state: "RISK" });
      this.store.updateTx(tx.id, { state: "POLICY" });
      this.store.updateTx(tx.id, { state: "PREVIEW" });
    }
    if (!state.ok) throw new Error(state.error);
    return this.store.get().transactions.find((x) => x.id === tx.id);
  }
  markAuthorization(id, approved, actor = "wallet") {
    const t = this.store.get().transactions.find((x) => x.id === id);
    if (!t) throw new Error("Unknown transaction");
    if (t.state !== "PREVIEW" && t.state !== "USER_AUTHORIZATION") throw new Error("Transaction is not awaiting authorization");
    this.store.updateTx(id, { state: approved ? "USER_AUTHORIZATION" : "FAILED", error: approved ? void 0 : "Authorization rejected" });
    this.store.audit("authorization", actor, "transaction", id, approved ? "AUTHORIZED" : "REJECTED");
    return this.store.get().transactions.find((x) => x.id === id);
  }
};

// server/treasury/squads.ts
var import_web32 = require("@solana/web3.js");
var SquadsReadAdapter = class {
  async inspect(connection) {
    const address = (process.env.SQUADS_MULTISIG_ADDRESS || "").trim();
    if (!address) return { configured: false };
    try {
      const multisig = await import("@sqds/multisig");
      const multisigPda = new import_web32.PublicKey(address);
      const account = await multisig.accounts.Multisig.fromAccountAddress(connection, multisigPda);
      const [vault] = multisig.getVaultPda({ multisigPda, index: 0 });
      return { configured: true, multisigAddress: multisigPda.toBase58(), vaultAddress: vault.toBase58(), members: account.members.map((m) => ({ key: m.key?.toBase58?.() || String(m.key), permissions: m.permissions })), threshold: account.threshold?.toString?.() || String(account.threshold) };
    } catch (e) {
      return { configured: true, error: e.message };
    }
  }
};

// server/db/storage.ts
var import_node_fs2 = __toESM(require("node:fs"), 1);
var import_node_path2 = __toESM(require("node:path"), 1);
var StorageEngine = class {
  constructor() {
    this.file = import_node_path2.default.join(process.cwd(), "data", "scheduler-state.json");
    import_node_fs2.default.mkdirSync(import_node_path2.default.dirname(this.file), { recursive: true });
    this.state = this.load();
    this.rollDay();
  }
  load() {
    try {
      const raw = JSON.parse(import_node_fs2.default.readFileSync(this.file, "utf8"));
      return { ...raw, lastAttemptAt: raw.lastAttemptAt ?? raw.lastTransferAt ?? null, lastSweepAt: raw.lastSweepAt ?? null, attempts: Array.isArray(raw.attempts) ? raw.attempts : [], emergencyStop: raw.emergencyStop ?? { engaged: false, reason: "", at: 0 } };
    } catch {
      return { running: false, lastAttemptAt: null, dailyCount: 0, dailyDate: (/* @__PURE__ */ new Date()).toISOString().slice(0, 10), lastSweepAt: null, attempts: [], emergencyStop: { engaged: false, reason: "", at: 0 } };
    }
  }
  save() {
    import_node_fs2.default.writeFileSync(this.file, JSON.stringify(this.state, null, 2));
  }
  rollDay() {
    const d = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
    if (this.state.dailyDate !== d) {
      this.state.dailyDate = d;
      this.state.dailyCount = 0;
      this.save();
    }
  }
  get() {
    this.rollDay();
    return structuredClone(this.state);
  }
  setRunning(v) {
    this.state.running = v;
    this.save();
  }
  claimAttemptSlot(at) {
    this.rollDay();
    this.state.lastAttemptAt = at;
    this.save();
  }
  setLastSweepAt(at) {
    this.state.lastSweepAt = at;
    this.save();
  }
  setEmergencyStop(engaged, reason = "") {
    this.state.emergencyStop = { engaged, reason, at: Date.now() };
    this.save();
  }
  isEmergencyStopped() {
    return this.state.emergencyStop?.engaged === true;
  }
  hasPending() {
    return this.state.attempts.some((a) => a.outcome === "PENDING");
  }
  getPending() {
    return this.state.attempts.find((a) => a.outcome === "PENDING") || null;
  }
  record(a, confirmed = false) {
    this.rollDay();
    this.state.attempts.unshift(a);
    this.state.attempts = this.state.attempts.slice(0, 200);
    if (confirmed) this.state.dailyCount++;
    this.state.lastAttemptAt = a.at;
    this.save();
  }
  update(id, patch, confirmed = false) {
    this.rollDay();
    const i = this.state.attempts.findIndex((a) => a.id === id);
    if (i < 0) throw new Error(`Unknown scheduler attempt ${id}`);
    const wasConfirmed = this.state.attempts[i].outcome === "CONFIRMED";
    this.state.attempts[i] = { ...this.state.attempts[i], ...patch };
    if (confirmed && !wasConfirmed) this.state.dailyCount++;
    this.save();
    return this.state.attempts[i];
  }
};

// server/solana/priceService.ts
async function getSolPrice() {
  const r = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd&include_24hr_change=true", { signal: AbortSignal.timeout(7e3) });
  if (!r.ok) throw new Error(`Price API HTTP ${r.status}`);
  const d = await r.json();
  const usd = d?.solana?.usd;
  if (typeof usd !== "number") throw new Error("Price API returned no SOL/USD price");
  return { usd, source: "CoinGecko", fetchedAt: Date.now(), change24h: typeof d.solana.usd_24h_change === "number" ? d.solana.usd_24h_change : void 0 };
}

// server.ts
var squads = new SquadsReadAdapter();
var scheduler = new StorageEngine();
var BIND_HOST = process.env.HOST || process.env.BIND_HOST || "127.0.0.1";
var PORT = Number(process.env.PORT || 3e3);
var CLUSTER = (process.env.SOLANA_CLUSTER || process.env.SOLANA_NETWORK) === "devnet" ? "devnet" : "mainnet-beta";
var WATCH_WALLET = (process.env.WATCH_WALLET || "").trim();
var SESSION = process.env.APP_SESSION_TOKEN || "";
var REVENUE_SECRET = process.env.REVENUE_WEBHOOK_SECRET || "";
var TREASURY_DESTINATION = (process.env.TREASURY_DESTINATION_SOLANA || process.env.TREASURY_VAULT_ADDRESS || WATCH_WALLET || "HTN1fvHwbzKiMwh9YXZEe3eooiMdoCAs3TweWdiSZV5i").trim();
var MIN_RESERVE_SOL = Number(process.env.MIN_TREASURY_RESERVE_SOL || 0.05);
var SWEEP_INTERVAL_MINUTES = Number(process.env.SWEEP_INTERVAL_MINUTES || 5);
var SWEEP_PERCENT = Number(process.env.SWEEP_PERCENT || 10);
var MAX_DAILY_SWEEPS = Number(process.env.MAX_DAILY_SWEEPS || 50);
var APP_ORIGIN = (process.env.APP_ORIGIN || `http://${BIND_HOST === "0.0.0.0" ? "127.0.0.1" : BIND_HOST}:${PORT}`).replace(/\/$/, "");
function getLanIp() {
  try {
    const nets = import_node_os.default.networkInterfaces();
    const candidates = [];
    for (const list of Object.values(nets)) {
      for (const n of list || []) {
        if (n.family === "IPv4" && !n.internal) candidates.push(n.address);
      }
    }
    const pref = candidates.find((a) => a.startsWith("192.168.") || a.startsWith("10.") || /^172\.(1[6-9]|2\d|3[01])\./.test(a));
    return pref || candidates[0] || "127.0.0.1";
  } catch {
    return "127.0.0.1";
  }
}
var priceCache = null;
async function solPriceUsd() {
  if (priceCache && Date.now() - priceCache.at < 12e4) return priceCache.usd;
  try {
    const p = await getSolPrice();
    priceCache = { usd: p.usd, at: Date.now() };
    return p.usd;
  } catch {
    return priceCache?.usd ?? null;
  }
}
function auth(req, res, next) {
  if (!SESSION && BIND_HOST === "127.0.0.1") return next();
  const supplied = String(req.headers.authorization || "").replace(/^Bearer\s+/, "");
  if (!SESSION || !SecurityGuard.constantTimeCompare(supplied, SESSION)) return res.status(401).json({ error: "Unauthorized" });
  next();
}
function origin(req, res, next) {
  const o = String(req.headers.origin || "");
  const allowed = APP_ORIGIN;
  if (req.method !== "GET" && req.method !== "HEAD" && req.method !== "OPTIONS" && o && o !== allowed) return res.status(403).json({ error: "Origin rejected" });
  next();
}
async function main() {
  if (CLUSTER === "mainnet-beta" && process.env.TRANSFER_MODE === "live" && process.env.I_UNDERSTAND_LIVE_MAINNET !== "true") throw new Error("Refusing live mainnet startup without I_UNDERSTAND_LIVE_MAINNET=true");
  const app = (0, import_express.default)();
  const security = new SecurityGuard();
  const provider = new SolanaProviderManager();
  const runtime = new Runtime();
  const treasury = new TreasuryAuthorizationService(runtime.store, provider);
  app.disable("x-powered-by");
  app.use((req, _res, next) => {
    req.correlationId = import_node_crypto5.default.randomUUID();
    req.startedAt = Date.now();
    next();
  });
  app.use(import_express.default.json({ limit: "256kb" }));
  app.use((req, res, next) => {
    res.setHeader("Vary", "Origin");
    const o = String(req.headers.origin || "");
    if (o && (o === APP_ORIGIN || BIND_HOST === "127.0.0.1")) res.setHeader("Access-Control-Allow-Origin", o);
    res.setHeader("Access-Control-Allow-Methods", "GET,HEAD,OPTIONS,POST");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization,X-Idempotency-Key,X-Yabbai-Signature");
    res.setHeader("Access-Control-Max-Age", "600");
    if (req.method === "OPTIONS") return res.status(204).end();
    next();
  });
  app.use(origin);
  app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "no-referrer");
    const isDev = process.env.NODE_ENV !== "production";
    res.setHeader("Content-Security-Policy", isDev ? "default-src 'self'; connect-src 'self' ws: wss:; img-src 'self' data:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; script-src 'self' 'unsafe-inline'" : "default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; font-src 'self' data:; script-src 'self'");
    res.setHeader("Cache-Control", "no-store");
    next();
  });
  app.use((req, res, next) => {
    if (req.path.startsWith("/api/") && req.path !== "/api/health") {
      const ip = req.ip || req.socket.remoteAddress || "unknown";
      const readOnly = req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS";
      const limit = readOnly ? 600 : 120;
      const result = security.checkRateLimit(`${readOnly ? "read" : "write"}:${ip}`, limit, 6e4);
      res.setHeader("X-RateLimit-Limit", String(limit));
      res.setHeader("X-RateLimit-Window", "60");
      if (!result.allowed) {
        const retry = Math.max(1, Math.ceil((result.reset - Date.now()) / 1e3));
        res.setHeader("Retry-After", String(retry));
        return res.status(429).json({ error: "Rate limit exceeded", retryAfterSeconds: retry, limit, windowSeconds: 60 });
      }
    }
    next();
  });
  app.use((req, res, next) => {
    res.on("finish", () => {
      const dur = Date.now() - (req.startedAt || Date.now());
      if (req.path?.startsWith?.("/api/")) console.log(JSON.stringify({ correlationId: req.correlationId, timestamp: (/* @__PURE__ */ new Date()).toISOString(), operation: `${req.method} ${req.path}`, status: res.statusCode, durationMs: dur }));
    });
    next();
  });
  app.get("/api/health", (_req, res) => res.json({ status: "ok", timestamp: Date.now(), cluster: provider.getCluster(), persistence: runtime.mirror.enabled ? "supabase" : "local-fallback" }));
  app.get("/api/providers/health", (_req, res) => res.json({ providers: provider.getHealthSummary() }));
  app.get("/api/system/status", async (_req, res) => {
    const s = runtime.store.get();
    const verified = s.revenue.filter((x) => x.status === "VERIFIED" || x.status === "REALIZED");
    const verifiedSol = verified.filter((x) => (x.asset || "SOL") === "SOL").reduce((n, x) => n + Number(x.amount || 0), 0);
    const verifiedNonSolCount = verified.filter((x) => (x.asset || "SOL") !== "SOL").length;
    const verifiedNonSolRevenue = verified.filter((x) => (x.asset || "SOL") !== "SOL");
    const pendingCount = s.revenue.filter((x) => x.status === "PENDING").length;
    const estimatedCount = s.opportunities.filter((x) => x.status === "ESTIMATED").length;
    const paidOrders = s.revenueOrders.filter((x) => x.status === "PAID").length;
    const fulfilledOrders = s.revenueOrders.filter((x) => x.status === "FULFILLED").length;
    const executed = s.allocations.filter((x) => x.status === "EXECUTED").reduce((n, a) => n + Number(a.amountSol || 0), 0);
    let observedCapital = null;
    let observedError;
    const watchAddr = WATCH_WALLET || process.env.TREASURY_VAULT_ADDRESS || "";
    if (watchAddr) {
      try {
        observedCapital = await provider.getBalanceSol(watchAddr);
      } catch (e) {
        observedError = e.message;
      }
    }
    const capitalSol = observedCapital ?? executed;
    const price = await solPriceUsd();
    const capitalUsd = price !== null ? capitalSol * price : null;
    const thresholdInput = capitalUsd ?? capitalSol;
    const threshold = runtime.predicament.state(thresholdInput);
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
      paidOrders,
      fulfilledOrders,
      executedCapital: executed,
      observedCapitalSol: observedCapital,
      observedCapitalStatus: observedCapital === null ? "UNKNOWN" : "VERIFIED",
      observedCapitalError: observedError,
      capitalSol,
      capitalUsd,
      solPriceUsd: price,
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
      threshold
    });
  });
  app.get("/api/thresholds", async (_req, res) => {
    const s = runtime.store.get();
    const executed = s.allocations.filter((x) => x.status === "EXECUTED").reduce((n, a) => n + Number(a.amountSol || 0), 0);
    const watchAddr = WATCH_WALLET || process.env.TREASURY_VAULT_ADDRESS || "";
    let observed = null;
    if (watchAddr) {
      try {
        observed = await provider.getBalanceSol(watchAddr);
      } catch {
        observed = null;
      }
    }
    const capitalSol = observed ?? executed;
    const price = await solPriceUsd();
    const capitalUsd = price !== null ? capitalSol * price : null;
    const state = runtime.predicament.state(capitalUsd ?? capitalSol);
    res.json({
      levels: [0, 20, 50, 100, 250, 500, 1e3, 2500, 5e3, 1e4, 25e3],
      current: state.current,
      next: state.next,
      maximumReached: state.maximumReached,
      capitalSol,
      capitalUsd,
      solPriceUsd: price,
      priceStatus: price === null ? "UNKNOWN" : "VERIFIED",
      note: "Capability tiers only. No tier guarantees profit or earnings."
    });
  });
  app.get("/api/treasury/status", async (_req, res) => {
    const watchAddr = WATCH_WALLET || process.env.TREASURY_VAULT_ADDRESS || "";
    let balanceSol = null;
    let balanceError;
    if (watchAddr) {
      try {
        balanceSol = await provider.getBalanceSol(watchAddr);
      } catch (e) {
        balanceError = e.message;
      }
    }
    const reserved = MIN_RESERVE_SOL;
    const available = balanceSol === null ? null : Math.max(0, balanceSol - reserved);
    res.json({
      destination: TREASURY_DESTINATION,
      watchWallet: watchAddr || null,
      network: provider.getCluster(),
      balanceSol,
      balanceStatus: balanceSol === null ? "UNKNOWN" : "VERIFIED",
      balanceError,
      reservedSol: reserved,
      availableSol: available,
      minReserveSol: MIN_RESERVE_SOL,
      sweep: { intervalMinutes: SWEEP_INTERVAL_MINUTES, percent: SWEEP_PERCENT, maxDailySweeps: MAX_DAILY_SWEEPS },
      authorization: "authorization-gated: Squads/multisig or user wallet required; YABBAI never signs server-side",
      liveMainnet: process.env.I_UNDERSTAND_LIVE_MAINNET === "true"
    });
  });
  app.get("/api/revenue/events", (req, res) => {
    const status = String(req.query.status || "");
    const s = runtime.store.get();
    const rows = (status ? s.revenue.filter((x) => x.status === status) : s.revenue).slice(0, 100);
    res.json({ count: rows.length, revenue: rows });
  });
  app.get("/api/risk", (req, res) => res.json({ riskEvents: runtime.store.get().riskEvents.slice(0, 100) }));
  app.get("/api/audit", (req, res) => res.json({ audit: runtime.store.get().audit.slice(0, 200) }));
  app.get("/api/wallet/balance", async (req, res) => {
    const a = String(req.query.address || WATCH_WALLET || process.env.TREASURY_VAULT_ADDRESS || "");
    if (!a) return res.status(400).json({ error: "address required", status: "UNKNOWN" });
    try {
      const lamports = await provider.getBalanceLamports(a);
      res.json({ lamports, sol: lamports / 1e9, fetchedAt: Date.now(), rpcProvider: provider.getActiveProvider().name, cluster: provider.getCluster(), address: a, status: "VERIFIED" });
    } catch (e) {
      res.status(503).json({ error: e.message, status: "UNKNOWN" });
    }
  });
  app.get("/api/wallet/transactions", async (req, res) => {
    const a = String(req.query.address || WATCH_WALLET || process.env.TREASURY_VAULT_ADDRESS || "");
    if (!a) return res.status(400).json({ error: "address required", status: "UNKNOWN" });
    try {
      const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25));
      const sigs = await provider.getSignaturesForAddress(a, limit, req.query.before ? String(req.query.before) : void 0);
      const rows = [];
      for (const s of sigs) {
        const tx = await provider.getParsedTransaction(s.signature).catch(() => null);
        rows.push({ signature: s.signature, slot: s.slot, blockTime: tx?.blockTime ? tx.blockTime * 1e3 : null, failed: Boolean(s.err || tx?.meta?.err), status: s.err ? "FAILED" : tx ? "VERIFIED" : "UNKNOWN", solscanUrl: provider.getCluster() === "mainnet-beta" ? `https://solscan.io/tx/${s.signature}` : `https://solscan.io/tx/${s.signature}?cluster=${provider.getCluster()}` });
      }
      res.json({ transactions: rows, status: "VERIFIED" });
    } catch (e) {
      res.status(503).json({ error: e.message, status: "UNKNOWN" });
    }
  });
  app.get("/api/revenue/products", (_req, res) => res.json({ products: runtime.store.get().revenueProducts.filter((x) => x.enabled) }));
  app.post("/api/revenue/orders", auth, async (req, res) => {
    try {
      const p = runtime.store.get().revenueProducts.find((x) => x.id === String(req.body.productId || ""));
      if (!p || !p.enabled) return res.status(404).json({ error: "Unknown or disabled product" });
      const customerRef = String(req.body.customerRef || "").trim();
      if (!customerRef) return res.status(400).json({ error: "customerRef is required" });
      const idem = String(req.headers["x-idempotency-key"] || req.body.idempotencyKey || "");
      if (idem) {
        const existing = runtime.store.get().revenueOrders.find((x) => x.idempotencyKey === idem);
        if (existing) return res.status(200).json(existing);
      }
      const recipient = String(req.body.recipient || TREASURY_DESTINATION || WATCH_WALLET || "");
      const o = { id: import_node_crypto5.default.randomUUID(), productId: p.id, customerRef, amount: p.priceAmount, asset: p.priceAsset, network: String(req.body.network || "solana"), status: "AWAITING_PAYMENT", expectedRecipient: recipient || null, expectedSender: req.body.expectedSender ? String(req.body.expectedSender) : null, createdAt: Date.now(), updatedAt: Date.now() };
      if (idem) o.idempotencyKey = idem;
      runtime.store.addOrder(o);
      runtime.store.audit("revenue_order_created", "operator", "revenue_order", o.id, "AWAITING_PAYMENT", { productId: p.id, price: p.priceAmount, asset: p.priceAsset });
      await runtime.persist();
      res.status(201).json(o);
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });
  app.get("/api/revenue/orders/:id", (req, res) => {
    const o = runtime.store.get().revenueOrders.find((x) => x.id === req.params.id);
    if (!o) return res.status(404).json({ error: "Unknown order" });
    res.json(o);
  });
  app.post("/api/revenue/orders/:id/expire", auth, async (req, res) => {
    const o = runtime.store.get().revenueOrders.find((x) => x.id === req.params.id);
    if (!o) return res.status(404).json({ error: "Unknown order" });
    if (o.status === "PAID" || o.status === "FULFILLED") return res.status(409).json({ error: "Paid/fulfilled orders cannot expire" });
    const u = runtime.store.updateOrder(o.id, { status: "EXPIRED" });
    runtime.store.audit("revenue_order_expired", "operator", "revenue_order", o.id, "EXPIRED");
    await runtime.persist();
    res.json(u);
  });
  app.post("/api/revenue/onchain/verify", auth, async (req, res) => {
    const orderId = String(req.body.orderId || "");
    let order;
    try {
      const signature = String(req.body.signature || "").trim();
      const recipient = String(req.body.recipient || (orderId ? "" : WATCH_WALLET || TREASURY_DESTINATION || "")).trim() || String(req.body.recipient || WATCH_WALLET || TREASURY_DESTINATION || "");
      const expectedAmount = String(req.body.expectedAmount || "");
      if (!signature || !recipient) return res.status(400).json({ error: "signature and recipient are required" });
      if (orderId) {
        order = runtime.store.get().revenueOrders.find((x) => x.id === orderId);
        if (!order) return res.status(404).json({ error: "Unknown order" });
        if (order.status === "PAID" || order.status === "FULFILLED") {
          const existingRev = order.paymentRevenueId ? runtime.store.get().revenue.find((r2) => r2.id === order.paymentRevenueId) : null;
          return res.status(200).json(existingRev || { order, status: order.status, note: "Order already paid (idempotent)" });
        }
        if (order.asset !== "SOL") return res.status(409).json({ status: "VERIFICATION_FAILED", error: "Order asset must be SOL for direct SOL settlement" });
        runtime.store.updateOrder(order.id, { status: "VERIFYING" });
      }
      const idemKey = `onchain:${signature}:${recipient}`;
      const dup = runtime.store.get().revenue.find((x) => x.idempotencyKey === idemKey || x.externalId === signature);
      if (dup) {
        if (order && order.status !== "PAID") {
          if (Math.abs(Number(order.amount) - Number(dup.amount)) <= 1e-9) runtime.store.updateOrder(order.id, { status: "PAID", paymentRevenueId: dup.id });
        }
        await runtime.persist();
        return res.status(200).json({ ...dup, idempotentReplay: true });
      }
      const amountStr = expectedAmount || order?.amount || "";
      if (!amountStr) {
        if (order) runtime.store.updateOrder(order.id, { status: "VERIFICATION_FAILED" });
        return res.status(400).json({ status: "VERIFICATION_FAILED", error: "expectedAmount or orderId with amount is required" });
      }
      const expectedLamports = BigInt(Math.floor(Number(amountStr) * 1e9));
      if (expectedLamports <= 0n) {
        if (order) runtime.store.updateOrder(order.id, { status: "VERIFICATION_FAILED" });
        return res.status(400).json({ status: "VERIFICATION_FAILED", error: "expected amount must be positive" });
      }
      const expectedSender = String(req.body.expectedSender || order?.expectedSender || "");
      if (order) runtime.store.updateOrder(order.id, { status: "PAYMENT_DETECTED" });
      let proof;
      try {
        proof = await provider.verifySolPayment({ signature, recipient, expectedLamports, expectedSender: expectedSender || null });
      } catch (e) {
        if (order) runtime.store.updateOrder(order.id, { status: "VERIFICATION_FAILED" });
        runtime.store.audit("onchain_revenue_rejected", "system", "revenue", signature, "VERIFICATION_FAILED", { reason: e.message, orderId: orderId || null });
        await runtime.persist();
        return res.status(409).json({ status: "VERIFICATION_FAILED", error: e.message });
      }
      if (order) {
        const orderLamports = BigInt(Math.floor(Number(order.amount) * 1e9));
        if (orderLamports !== proof.lamports) {
          runtime.store.updateOrder(order.id, { status: "VERIFICATION_FAILED" });
          await runtime.persist();
          return res.status(409).json({ status: "VERIFICATION_FAILED", error: "Payment amount does not match order" });
        }
        const orderRecipient = order.expectedRecipient || TREASURY_DESTINATION || WATCH_WALLET;
        if (orderRecipient && proof.recipient !== orderRecipient && recipient !== orderRecipient) {
        }
      }
      const r = runtime.store.addRevenue({
        id: import_node_crypto5.default.randomUUID(),
        source: String(req.body.source || "onchain-payment"),
        externalId: signature,
        recipient: proof.recipient,
        asset: "SOL",
        amount: proof.amountSol.toString(),
        amountLamports: proof.lamports.toString(),
        sender: proof.sender,
        orderId: orderId || null,
        transactionSignature: signature,
        network: provider.getCluster(),
        timestamp: (proof.blockTime || Math.floor(Date.now() / 1e3)) * 1e3,
        signature,
        status: "VERIFIED",
        verificationStatus: "VERIFIED",
        idempotencyKey: idemKey,
        evidence: `solana:${signature}`,
        createdAt: Date.now(),
        metadata: { transferCount: proof.transferCount, provider: proof.provider }
      });
      if (order) runtime.store.updateOrder(order.id, { status: "PAID", paymentRevenueId: r.id });
      runtime.store.audit("onchain_revenue_verified", "system", "revenue", r.id, "VERIFIED", { signature, recipient: proof.recipient, sender: proof.sender, deltaLamports: proof.balanceDeltaLamports, orderId: orderId || null });
      await runtime.persist();
      res.status(201).json(r);
    } catch (e) {
      try {
        if (order) runtime.store.updateOrder(order.id, { status: "VERIFICATION_FAILED" });
      } catch {
      }
      res.status(409).json({ status: "UNKNOWN", error: e.message });
    }
  });
  app.post("/api/revenue/orders/:id/fulfill", auth, async (req, res) => {
    try {
      const o = runtime.store.get().revenueOrders.find((x) => x.id === req.params.id);
      if (!o) return res.status(404).json({ error: "Unknown order" });
      if (o.status !== "PAID") return res.status(409).json({ error: "Order payment is not verified" });
      runtime.store.updateOrder(o.id, { status: "FULFILLING" });
      const updated = runtime.store.updateOrder(o.id, { status: "FULFILLED" });
      runtime.store.audit("revenue_order_fulfilled", "operator", "revenue_order", o.id, "FULFILLED");
      await runtime.persist();
      res.json(updated);
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });
  app.get("/api/opportunities", (req, res) => res.json({ opportunities: runtime.ranker.rank(runtime.store.get().opportunities), threshold: runtime.predicament.state(Number(req.query.capitalSol || 0)) }));
  app.post("/api/opportunities/discover", auth, async (_req, res) => {
    try {
      const result = await runtime.registry.discover();
      runtime.registry.discoverZeroCapitalProducts();
      await runtime.persist();
      runtime.store.audit("discover", "operator", "system", "opportunity-engine", "OK", { count: result.length });
      res.json({ count: result.length, opportunities: runtime.ranker.rank(result).slice(0, 50) });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
  app.post("/api/opportunities/ingest", auth, async (req, res) => {
    try {
      const o = runtime.registry.ingestExternal(req.body);
      await runtime.persist();
      runtime.store.audit("opportunity_ingest", "operator", "opportunity", o.id, "OK");
      res.status(201).json(o);
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });
  app.post("/api/autopilot/tick", auth, async (_req, res) => {
    if (runtime.store.get().system.emergencyStop) return res.status(423).json({ error: "Emergency stop engaged" });
    runtime.registry.discoverZeroCapitalProducts();
    const result = await runtime.autopilot();
    await runtime.persist();
    res.json({ mode: "evidence-first-autopilot", result, capitalExecution: "authorization-gated" });
  });
  app.post("/api/agents/:id/heartbeat", auth, async (req, res) => {
    try {
      const a = runtime.fleet.heartbeat(req.params.id);
      await runtime.persist();
      res.json(a);
    } catch (e) {
      res.status(404).json({ error: e.message });
    }
  });
  app.get("/api/agents", (_req, res) => res.json({ agents: runtime.store.get().agents }));
  app.post("/api/revenue/webhook", async (req, res) => {
    if (!REVENUE_SECRET) return res.status(503).json({ error: "Revenue webhook is not configured" });
    const signature = String(req.headers["x-yabbai-signature"] || req.headers["x-yabbai-signature".toLowerCase()] || "");
    const expected = import_node_crypto5.default.createHmac("sha256", REVENUE_SECRET).update(JSON.stringify(req.body)).digest("hex");
    if (!SecurityGuard.constantTimeCompare(signature, expected)) return res.status(401).json({ error: "Invalid webhook signature" });
    const b = req.body;
    if (!b.externalId || !b.amount || !b.network || !b.evidence) return res.status(400).json({ error: "externalId, amount, network and evidence are required" });
    const r = runtime.store.addRevenue({ id: import_node_crypto5.default.randomUUID(), source: b.source || "billing", externalId: String(b.externalId), recipient: b.recipient || null, asset: b.asset || "SOL", amount: String(b.amount), network: String(b.network), timestamp: Number(b.timestamp || Date.now()), signature: b.signature || null, status: "PENDING", verificationStatus: "PENDING", idempotencyKey: String(b.idempotencyKey || b.externalId), evidence: String(b.evidence), createdAt: Date.now() });
    await runtime.persist();
    res.status(202).json({ revenue: r, status: r.status });
  });
  app.post("/api/revenue/:id/verify", auth, async (req, res) => {
    const r = runtime.store.get().revenue.find((x) => x.id === req.params.id);
    if (!r) return res.status(404).json({ error: "Unknown revenue" });
    if (r.signature) {
      const s = await provider.getSignatureStatuses([r.signature]);
      const st = s.value[0];
      if (st?.err) return res.status(409).json({ error: "On-chain evidence failed", status: "UNKNOWN" });
      if (st?.confirmationStatus !== "confirmed" && st?.confirmationStatus !== "finalized") return res.status(202).json({ status: "PENDING" });
      runtime.store.state.revenue.find((x) => x.id === r.id).status = "VERIFIED";
      runtime.store.state.revenue.find((x) => x.id === r.id).verificationStatus = "VERIFIED";
      runtime.store.audit("revenue_verified", "system", "revenue", r.id, "VERIFIED", { signature: r.signature });
    } else if (req.body.authoritative === true) {
      runtime.store.state.revenue.find((x) => x.id === r.id).status = "VERIFIED";
      runtime.store.state.revenue.find((x) => x.id === r.id).verificationStatus = "VERIFIED";
      runtime.store.audit("revenue_verified", "billing", "revenue", r.id, "VERIFIED", { evidence: r.evidence });
    } else return res.status(409).json({ error: "Revenue requires authoritative on-chain or verified billing evidence" });
    await runtime.persist();
    res.json(runtime.store.get().revenue.find((x) => x.id === req.params.id));
  });
  app.get("/api/transactions/:id", (req, res) => {
    const t = runtime.store.get().transactions.find((x) => x.id === req.params.id);
    if (!t) return res.status(404).json({ error: "Unknown transaction" });
    res.json(t);
  });
  app.post("/api/transactions/:id/reconcile", auth, async (req, res) => {
    const t = runtime.store.get().transactions.find((x) => x.id === req.params.id);
    if (!t) return res.status(404).json({ error: "Unknown transaction" });
    try {
      if (t.signature) {
        const s = await provider.getSignatureStatuses([t.signature]).catch(() => null);
        const st = s?.value?.[0];
        if (st && !st.err && (st.confirmationStatus === "confirmed" || st.confirmationStatus === "finalized")) {
          runtime.store.updateTx(t.id, { state: "CONFIRMED", confirmedAt: Date.now() });
          runtime.store.audit("tx_reconciled", "system", "transaction", t.id, "CONFIRMED", { signature: t.signature });
          await runtime.persist();
          return res.json(runtime.store.get().transactions.find((x) => x.id === t.id));
        }
        if (st?.err) {
          runtime.store.updateTx(t.id, { state: "FAILED", error: "On-chain failure confirmed during reconciliation" });
          await runtime.persist();
          return res.json(runtime.store.get().transactions.find((x) => x.id === t.id));
        }
      }
      if (t.lastValidBlockHeight) {
        try {
          const h = await provider.getBlockHeight();
          if (h > (t.lastValidBlockHeight || 0)) {
            runtime.store.updateTx(t.id, { state: "RECONCILIATION_REQUIRED", error: "Blockhash expired and transaction unresolved; operator review required. UNKNOWN transactions are never blindly retried." });
            runtime.store.risk("TX_RECONCILIATION_REQUIRED", "WARN", `Transaction ${t.id} requires reconciliation`, t.id);
            await runtime.persist();
            return res.json(runtime.store.get().transactions.find((x) => x.id === t.id));
          }
        } catch {
        }
      }
      runtime.store.updateTx(t.id, { state: "RECONCILIATION_REQUIRED", error: "Unresolved; marked RECONCILIATION_REQUIRED for operator review. Will not auto-retry." });
      await runtime.persist();
      res.json(runtime.store.get().transactions.find((x) => x.id === t.id));
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
  app.post("/api/treasury/phantom/deposit/prepare", auth, async (req, res) => {
    try {
      const phantom = String(req.body.phantomWallet || "").trim(), amount = String(req.body.amountSol || "");
      const treasuryAddress = process.env.TREASURY_VAULT_ADDRESS || process.env.WATCH_WALLET || TREASURY_DESTINATION || "";
      if (!phantom || !treasuryAddress) return res.status(400).json({ error: "phantomWallet and treasury destination are required" });
      const result = await provider.preparePhantomDeposit(phantom, treasuryAddress, amount);
      res.json(result);
    } catch (e) {
      res.status(409).json({ status: "BLOCKED", error: e.message });
    }
  });
  app.post("/api/treasury/phantom/initial-withdrawal/prepare", auth, async (req, res) => {
    try {
      const phantom = String(req.body.phantomWallet || "").trim();
      if (!phantom) return res.status(400).json({ error: "phantomWallet is required" });
      const source = process.env.TREASURY_VAULT_ADDRESS || process.env.WATCH_WALLET || TREASURY_DESTINATION || "";
      if (!source) return res.status(503).json({ error: "No treasury source is configured" });
      const result = await provider.preparePhantomInitialWithdrawal(source, phantom, 30);
      runtime.store.audit("phantom_withdrawal_preflight", "operator", "wallet", phantom, "SIMULATION_PASSED", { source, percent: 30, amountSol: result.amountSol, feeLamports: result.feeLamports });
      await runtime.persist();
      res.json(result);
    } catch (e) {
      runtime.store.audit("phantom_withdrawal_preflight", "operator", "wallet", String(req.body?.phantomWallet || "unknown"), "BLOCKED", { reason: e.message });
      res.status(409).json({ status: "BLOCKED", error: e.message });
    }
  });
  app.post("/api/treasury/phantom/initial-withdrawal/record", auth, async (req, res) => {
    try {
      const { phantomWallet, signature, amountSol, feeLamports } = req.body || {};
      if (!phantomWallet || !signature || !amountSol) return res.status(400).json({ error: "phantomWallet, signature and amountSol are required" });
      const tx = { id: import_node_crypto5.default.randomUUID(), kind: "ONCHAIN", state: "SUBMITTED", signature: String(signature), createdAt: Date.now(), submittedAt: Date.now(), updatedAt: Date.now(), idempotencyKey: `phantom-initial:${signature}`, amountSol: String(amountSol), destination: String(phantomWallet), network: provider.getCluster(), provider: provider.getActiveProvider().name, attempt: 1 };
      runtime.store.addTx(tx);
      runtime.store.audit("phantom_withdrawal_submitted", "wallet", "transaction", tx.id, "SUBMITTED", { signature, phantomWallet, feeLamports: Number(feeLamports || 0) });
      await runtime.persist();
      res.status(202).json(tx);
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });
  app.post("/api/treasury/transfer-intents", auth, async (req, res) => {
    try {
      const t = await treasury.createTransferIntent(String(req.body.destination || ""), String(req.body.amountSol || ""), String(req.headers["x-idempotency-key"] || req.body.idempotencyKey || ""));
      await runtime.persist();
      res.status(201).json({ ...t, authorization: "Squads/multisig or user wallet required; YABBAI never signs server-side" });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });
  app.post("/api/treasury/transfer-intents/:id/authorize", auth, async (req, res) => {
    try {
      const t = treasury.markAuthorization(req.params.id, Boolean(req.body.approved), String(req.body.actor || "operator"));
      await runtime.persist();
      res.json(t);
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });
  app.post("/api/security/stop", auth, async (req, res) => {
    runtime.store.setEmergencyStop(true, String(req.body.reason || "Operator emergency stop"));
    try {
      scheduler.setEmergencyStop(true, String(req.body.reason || "Operator emergency stop"));
    } catch {
    }
    runtime.store.audit("emergency_stop", "operator", "system", "global", "ENGAGED");
    await runtime.persist();
    res.json(runtime.store.get().system);
  });
  app.post("/api/security/start", auth, async (req, res) => {
    runtime.store.setEmergencyStop(false, "");
    try {
      scheduler.setEmergencyStop(false, "");
    } catch {
    }
    runtime.store.audit("emergency_stop", "operator", "system", "global", "RELEASED");
    await runtime.persist();
    res.json(runtime.store.get().system);
  });
  app.get("/api/treasury/squads", async (_req, res) => {
    try {
      res.json(await squads.inspect(provider.getConnection()));
    } catch (e) {
      res.status(503).json({ configured: Boolean(process.env.SQUADS_MULTISIG_ADDRESS), error: e.message });
    }
  });
  app.get("/api/config", (_req, res) => res.json({ cluster: provider.getCluster(), transferMode: process.env.TRANSFER_MODE || "authorization-gated", watchWallet: WATCH_WALLET || null, treasuryVault: process.env.TREASURY_VAULT_ADDRESS || null, squadsMultisig: process.env.SQUADS_MULTISIG_ADDRESS || null, privateKeyCustody: false, capitalExecution: "USER_OR_MULTISIG_AUTHORIZATION_REQUIRED", treasuryDestination: TREASURY_DESTINATION, earningMode: "verified-revenue-first" }));
  app.use("/api", (req, res) => res.status(404).json({ error: `Unknown API route ${req.path}` }));
  const isProd = process.env.NODE_ENV === "production";
  if (!isProd) {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: "spa" });
    app.use(vite.middlewares);
  }
  const distDir = import_node_path3.default.resolve(process.cwd(), "dist");
  app.use(import_express.default.static(distDir, { maxAge: isProd ? "1h" : 0 }));
  app.get("*", (_req, res) => {
    const prodIndex = import_node_path3.default.resolve(process.cwd(), "dist", "index.html");
    const devIndex = import_node_path3.default.resolve(process.cwd(), "index.html");
    if (isProd && import_node_fs3.default.existsSync(prodIndex)) return res.sendFile(prodIndex);
    return res.sendFile(devIndex);
  });
  const server = app.listen(PORT, BIND_HOST, () => {
    const lan = getLanIp();
    console.log("==================================================");
    console.log("YABBAI LAN SERVER");
    console.log("==================================================");
    console.log(`Local: http://127.0.0.1:${PORT}`);
    console.log(`LAN:   http://${lan}:${PORT}`);
    console.log(`API:   http://${lan}:${PORT}/api/health`);
    console.log(`Bind:  ${BIND_HOST}:${PORT} (${BIND_HOST === "0.0.0.0" ? "LAN reachable" : "local-only; set HOST=0.0.0.0 for LAN"})`);
    console.log(`Network: Solana ${CLUSTER}`);
    console.log("==================================================");
  });
  setInterval(() => {
    if (!runtime.store.get().system.emergencyStop) {
      try {
        runtime.autopilot().catch((e) => runtime.store.risk("AUTOPILOT_FAILURE", "CRITICAL", String(e)));
      } catch (e) {
        runtime.store.risk("AUTOPILOT_FAILURE", "CRITICAL", String(e));
      }
    }
  }, 6e4);
  const sweepMs = Math.max(1, SWEEP_INTERVAL_MINUTES) * 60 * 1e3;
  setInterval(async () => {
    try {
      const st = runtime.store.get().system;
      if (st.emergencyStop) return;
      if (scheduler.isEmergencyStopped()) return;
      const snap = scheduler.get();
      if (snap.dailyCount >= MAX_DAILY_SWEEPS) return;
      const watchAddr = WATCH_WALLET || process.env.TREASURY_VAULT_ADDRESS || "";
      if (!watchAddr) return;
      let bal = null;
      try {
        bal = await provider.getBalanceSol(watchAddr);
      } catch (e) {
        runtime.store.risk("SWEEP_BALANCE_UNKNOWN", "WARN", `Sweep skipped: balance unknown (${e.message})`);
        return;
      }
      if (bal === null || bal <= MIN_RESERVE_SOL) return;
      const verifiedInflow = runtime.store.get().revenue.filter((x) => x.status === "VERIFIED" && (x.asset || "SOL") === "SOL").reduce((n, x) => n + Number(x.amount || 0), 0);
      if (verifiedInflow <= 0) return;
      const amount = Math.max(0, (bal - MIN_RESERVE_SOL) * (SWEEP_PERCENT / 100));
      if (amount <= 0) return;
      scheduler.record({ id: import_node_crypto5.default.randomUUID(), at: Date.now(), outcome: "PENDING", reason: `BLOCKED: sweep of ${amount.toFixed(6)} SOL requires user/multisig authorization; reserve ${MIN_RESERVE_SOL} SOL enforced`, amountSol: amount, destination: TREASURY_DESTINATION });
      runtime.store.audit("treasury_sweep_evaluated", "scheduler", "treasury", watchAddr, "BLOCKED", { amountSol: amount, basis: "verified-revenue", reserveSol: MIN_RESERVE_SOL, note: "Execution blocked pending authorization; no transfer submitted" });
    } catch (e) {
      try {
        runtime.store.risk("SWEEP_FAILURE", "WARN", String(e));
      } catch {
      }
    }
  }, sweepMs);
  process.on("SIGTERM", () => server.close());
  process.on("SIGINT", () => server.close());
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
//# sourceMappingURL=server.cjs.map
