import {Connection,LAMPORTS_PER_SOL,PublicKey,SystemProgram,Transaction,VersionedTransaction} from '@solana/web3.js';
export type Cluster='mainnet-beta'|'devnet';
type Provider={id:'helius'|'alchemy'|'quicknode'|'public';name:string;url:string;latencyMs:number|null;errorCount:number;successCount:number;lastChecked:number|null;isHealthy:boolean};
const url=(n:string,f:string)=>(process.env[n]||'').trim()||f;
const firstUrl=(names:string[],fallback='')=>{for(const n of names){const v=(process.env[n]||'').trim();if(v)return v}return fallback};
export class SolanaProviderManager{
 private providers:Provider[];private activeIndex=0;private cluster:Cluster=process.env.SOLANA_CLUSTER==='devnet'||process.env.SOLANA_NETWORK==='devnet'?'devnet':'mainnet-beta';private connections=new Map<string,Connection>();
 constructor(){const d=this.cluster==='devnet';this.providers=[{id:'helius',name:'Helius',url:firstUrl(['SOLANA_RPC_URL','HELIUS_SOLANA_RPC_URL'],''),latencyMs:null,errorCount:0,successCount:0,lastChecked:null,isHealthy:false},{id:'alchemy',name:'Alchemy',url:firstUrl(['SOLANA_RPC_URL_2','ALCHEMY_SOLANA_RPC_URL'],''),latencyMs:null,errorCount:0,successCount:0,lastChecked:null,isHealthy:false},{id:'quicknode',name:'QuickNode',url:firstUrl(['SOLANA_RPC_URL_3','QUICKNODE_SOLANA_RPC_URL'],''),latencyMs:null,errorCount:0,successCount:0,lastChecked:null,isHealthy:false},{id:'public',name:'Solana Public RPC',url:d?'https://api.devnet.solana.com':'https://api.mainnet-beta.solana.com',latencyMs:null,errorCount:0,successCount:0,lastChecked:null,isHealthy:false}]}
 getCluster(){return this.cluster} getActiveProvider(){for(let n=0;n<this.providers.length;n++){const p=this.providers[(this.activeIndex+n)%this.providers.length];if(p.url){this.activeIndex=this.providers.indexOf(p);return p}}throw new Error('No Solana RPC provider')}
 getConnection(){return this.conn(this.getActiveProvider())}
 private conn(p:Provider){let c=this.connections.get(p.url);if(!c){c=new Connection(p.url,{commitment:'confirmed',confirmTransactionInitialTimeout:30000});this.connections.set(p.url,c)}return c}
 private async fail<T>(fn:(c:Connection)=>Promise<T>){let last:any;for(let n=0;n<this.providers.length;n++){const i=(this.activeIndex+n)%this.providers.length,p=this.providers[i];if(!p.url)continue;const t=Date.now();try{const v=await fn(this.conn(p));p.latencyMs=Date.now()-t;p.lastChecked=Date.now();p.successCount++;p.isHealthy=true;this.activeIndex=i;return v}catch(e){p.latencyMs=Date.now()-t;p.lastChecked=Date.now();p.errorCount++;p.isHealthy=false;last=e}}throw new Error(`All available Solana RPC providers failed: ${last?.message||'unknown error'}`)}
 private mask(u:string){if(!u)return'Not configured';try{const x=new URL(u);return x.origin+x.pathname+(x.search?'?••••••••':'')}catch{return'Configured'}}
 getHealthSummary(){return this.providers.map((p,i)=>({id:p.id,name:p.name,url:this.mask(p.url),isActive:i===this.activeIndex,isHealthy:p.isHealthy,latencyMs:p.latencyMs,errorRatePercent:p.successCount+p.errorCount?Math.round(p.errorCount/(p.successCount+p.errorCount)*1000)/10:null,lastChecked:p.lastChecked,supportedFeatures:['read','simulate','confirm','reconcile']}))}
 async getBalanceLamports(a:string){const r:any=await this.fail(c=>c.getBalance(new PublicKey(a),'confirmed'));return r} async getBalanceSol(a:string){return(await this.getBalanceLamports(a))/LAMPORTS_PER_SOL}
 async getSignaturesForAddress(a:string,l=25,b?:string){return this.fail(c=>c.getSignaturesForAddress(new PublicKey(a),{limit:l,before:b}))}
 async getParsedTransaction(s:string){return this.fail(c=>c.getParsedTransaction(s,{commitment:'confirmed',maxSupportedTransactionVersion:0}))}
 async getSignatureStatuses(s:string[]){return this.fail(c=>c.getSignatureStatuses(s,{searchTransactionHistory:true}))}
 async getBlockHeight(){return this.fail(c=>c.getBlockHeight('confirmed'))}
 async getLatestBlockhash(){return this.fail(c=>c.getLatestBlockhash('confirmed'))}
 async simulateSolTransfer(from:string,destination:string,amountSol:string){const f=new PublicKey(from),to=new PublicKey(destination),bh=await this.getLatestBlockhash();const tx=new Transaction({recentBlockhash:bh.blockhash,feePayer:f}).add(SystemProgram.transfer({fromPubkey:f,toPubkey:to,lamports:Math.floor(Number(amountSol)*LAMPORTS_PER_SOL)}));const result:any=await this.fail(c=>c.simulateTransaction(new VersionedTransaction(tx.compileMessage()),{sigVerify:false,replaceRecentBlockhash:true}));return result}
 async validateTransferIntent(from:string,destination:string,amountSol:string){try{const f=new PublicKey(from),to=new PublicKey(destination);if(f.equals(to))return{ok:false,error:'Destination must differ from treasury vault'};if(!PublicKey.isOnCurve(to.toBytes()))return{ok:false,error:'Destination is not an on-curve Solana address'};const amount=Number(amountSol);if(!Number.isFinite(amount)||amount<=0)return{ok:false,error:'Transfer amount must be positive'};const bal=await this.getBalanceSol(from);const bh=await this.getLatestBlockhash();const tx=new Transaction({recentBlockhash:bh.blockhash,feePayer:f}).add(SystemProgram.transfer({fromPubkey:f,toPubkey:to,lamports:Math.floor(amount*LAMPORTS_PER_SOL)}));const fee=await this.fail(c=>c.getFeeForMessage(tx.compileMessage(),'confirmed'));if(bal<amount+(fee.value??5000)/LAMPORTS_PER_SOL)return{ok:false,error:'Insufficient balance for requested transfer plus network fee'};return{ok:true,preview:{from:f.toBase58(),to:to.toBase58(),amountSol,balanceSol:bal,lastValidBlockHeight:bh.lastValidBlockHeight,feeLamports:fee.value??5000}}}catch(e:any){return{ok:false,error:e.message}}}
 async preparePhantomDeposit(phantomWallet:string,treasury:string,amountSol:string){
  const from=new PublicKey(phantomWallet),to=new PublicKey(treasury);
  if(from.equals(to)) throw new Error('Phantom wallet and treasury destination must differ');
  const amount=Number(amountSol);
  if(!Number.isFinite(amount)||amount<=0) throw new Error('Deposit amount must be positive');
  const [phantomLamports,bh]=await Promise.all([this.getBalanceLamports(phantomWallet),this.getLatestBlockhash()]);
  const lamports=Math.floor(amount*LAMPORTS_PER_SOL);
  const tx=new Transaction({recentBlockhash:bh.blockhash,feePayer:from}).add(SystemProgram.transfer({fromPubkey:from,toPubkey:to,lamports}));
  const feeInfo:any=await this.fail(c=>c.getFeeForMessage(tx.compileMessage(),'confirmed'));
  const feeLamports=feeInfo.value??5000;
  if(phantomLamports<lamports+feeLamports) throw new Error('Phantom wallet lacks enough SOL for deposit plus network fee');
  const sim:any=await this.fail(c=>c.simulateTransaction(new VersionedTransaction(tx.compileMessage()),{sigVerify:false,replaceRecentBlockhash:true}));
  if(sim?.value?.err||sim?.err) throw new Error(`Deposit simulation failed: ${JSON.stringify(sim?.value?.err||sim?.err)}`);
  return {ok:true,from:from.toBase58(),destination:to.toBase58(),amountLamports:lamports,amountSol:lamports/LAMPORTS_PER_SOL,feeLamports,feeSol:feeLamports/LAMPORTS_PER_SOL,lastValidBlockHeight:bh.lastValidBlockHeight,serializedTransaction:Buffer.from(tx.serialize({requireAllSignatures:false,verifySignatures:false})).toString('base64')};
 }
 async preparePhantomInitialWithdrawal(source:string,phantomWallet:string,percent=30){
  const from=new PublicKey(source),to=new PublicKey(phantomWallet);
  if(from.equals(to)) throw new Error('Withdrawal destination must be the connected Phantom wallet and must differ from the treasury source');
  if(!PublicKey.isOnCurve(to.toBytes())) throw new Error('Connected Phantom wallet is not an on-curve Solana address');
  if(!Number.isFinite(percent)||percent<=0||percent>100) throw new Error('Withdrawal percentage must be between 0 and 100');
  const [sourceLamports,phantomLamports,bh]=await Promise.all([this.getBalanceLamports(source),this.getBalanceLamports(phantomWallet),this.getLatestBlockhash()]);
  if(sourceLamports<=0) throw new Error('Treasury has no SOL. Phantom will not be prompted and no gas will be requested.');
  const amountLamports=Math.floor(sourceLamports*percent/100);
  if(amountLamports<=0) throw new Error('Calculated withdrawal amount is zero. Phantom will not be prompted.');
  const tx=new Transaction({recentBlockhash:bh.blockhash,feePayer:to}).add(SystemProgram.transfer({fromPubkey:from,toPubkey:to,lamports:amountLamports}));
  const feeInfo:any=await this.fail(c=>c.getFeeForMessage(tx.compileMessage(),'confirmed'));
  const feeLamports=feeInfo.value??5000;
  if(phantomLamports<feeLamports) throw new Error(`Connected Phantom wallet does not have enough SOL for the network fee (${feeLamports} lamports). Phantom will not be prompted.`);
  const sim:any=await this.fail(c=>c.simulateTransaction(new VersionedTransaction(tx.compileMessage()),{sigVerify:false,replaceRecentBlockhash:true}));
  if(sim?.value?.err||sim?.err) throw new Error(`Withdrawal simulation failed; Phantom will not be prompted: ${JSON.stringify(sim?.value?.err||sim?.err)}`);
  return {ok:true,percent,source:from.toBase58(),destination:to.toBase58(),amountLamports,amountSol:amountLamports/LAMPORTS_PER_SOL,feeLamports,feeSol:feeLamports/LAMPORTS_PER_SOL,phantomBalanceLamports:phantomLamports,lastValidBlockHeight:bh.lastValidBlockHeight,serializedTransaction:Buffer.from(tx.serialize({requireAllSignatures:false,verifySignatures:false})).toString('base64'),requiresSourceAuthorization:!from.equals(to),warning:'The treasury source must still be authorized by its owner or Squads vault. Phantom is fee payer and recipient only.'};
 }
 async getNetSolInflowSince(address:string,sinceMs:number,untilMs=Date.now()){let before:string|undefined,complete=false,net=0n;for(let page=0;page<10;page++){const sigs=await this.getSignaturesForAddress(address,1000,before);if(!sigs.length){complete=true;break}for(const s of sigs){const bt=typeof s.blockTime==='number'?s.blockTime*1000:null;if(bt===null)continue;if(bt<sinceMs){complete=true;break}if(bt>untilMs)continue;const tx:any=await this.getParsedTransaction(s.signature);const idx=tx?.transaction?.message?.accountKeys?.findIndex((k:any)=>(k.pubkey?.toBase58?.()||String(k.pubkey))===address)??-1;if(idx<0||!tx?.meta||s.err||tx.meta.err)continue;net+=BigInt((tx.meta.postBalances[idx]??0)-(tx.meta.preBalances[idx]??0))}if(complete)break;before=sigs[sigs.length-1].signature}if(!complete)throw new Error('Unable to prove the entire SOL inflow window; no revenue amount calculated');return{lamports:net.toString(),sol:Number(net)/1e9,sinceMs,untilMs}}
 /** Extract all SystemProgram transfer instructions (top-level + inner) from a parsed transaction. Never trusts balance deltas alone. */
 extractSystemTransfers(tx:any):Array<{source:string,destination:string,lamports:bigint}>{const out:Array<{source:string,destination:string,lamports:bigint}>=[];
  const push=(info:any)=>{try{if(!info||typeof info!=='object')return;const dest=String(info.destination||info.to||'');const src=String(info.source||info.from||'');const lam=info.lamports;if(!dest||!src||lam===undefined||lam===null)return;out.push({source:src,destination:dest,lamports:BigInt(String(lam))})}catch{}};
  try{const ixs=tx?.transaction?.message?.instructions||[];for(const ix of ixs){const parsed=(ix as any)?.parsed;if(parsed?.type==='transfer'&&parsed?.info)push(parsed.info);else if((ix as any)?.program==='system'&&(ix as any)?.parsed?.info)push((ix as any).parsed.info)}const inner=tx?.meta?.innerInstructions||[];for(const g of inner){for(const ix of (g?.instructions||[])){const parsed=(ix as any)?.parsed;if(parsed?.type==='transfer'&&parsed?.info)push(parsed.info)}}}catch{}
  return out}
 /** Server-side authoritative SOL payment verification. Checks existence, success, confirmation, exact SystemProgram transfer(s), sender/recipient, and balance-delta consistency. */
 async verifySolPayment(opts:{signature:string,recipient:string,expectedLamports:bigint,expectedSender?:string|null,requireFinality?:boolean}){
  const {signature,recipient,expectedLamports,expectedSender}=opts;const requireFinality=opts.requireFinality!==false;
  if(!signature||!recipient)throw new Error('signature and recipient are required');
  if(expectedLamports<=0n)throw new Error('expected amount must be positive');
  let recipientKey:string;let senderKey:string|null=null;
  try{recipientKey=new PublicKey(recipient).toBase58()}catch{throw new Error('Recipient is not a valid Solana address')}
  if(expectedSender){try{senderKey=new PublicKey(expectedSender).toBase58()}catch{throw new Error('Expected sender is not a valid Solana address')}}
  const tx:any=await this.getParsedTransaction(signature);
  if(!tx?.meta)throw new Error('Transaction not found or metadata unavailable');
  if(tx.meta.err)throw new Error('Transaction failed on-chain; failed transactions can never verify payment');
  const keys=tx.transaction?.message?.accountKeys||[];
  const keyStr=(k:any)=>{try{return k?.pubkey?.toBase58?.()||String(k?.pubkey||k)}catch{return String(k)}};
  const idx=keys.findIndex((k:any)=>keyStr(k)===recipientKey);
  if(idx<0)throw new Error('Recipient was not present in the verified transaction');
  // Confirmation / finality check (independent of parsed fetch).
  try{const st:any=await this.getSignatureStatuses([signature]);const s0=st?.value?.[0];if(s0?.err)throw new Error('Transaction failed on-chain');
   if(requireFinality&&s0&&s0.confirmationStatus&&s0.confirmationStatus!=='confirmed'&&s0.confirmationStatus!=='finalized')throw new Error(`Transaction is not yet confirmed (status=${s0.confirmationStatus}); retry after confirmation`)}catch(e:any){if(String(e?.message||'').includes('not yet confirmed'))throw e}
  // Instruction-level proof: sum matching SystemProgram transfers.
  const transfers=this.extractSystemTransfers(tx);
  const matching=transfers.filter(t=>t.destination===recipientKey&&(!senderKey||t.source===senderKey));
  if(!matching.length)throw new Error('No verified SystemProgram transfer to the intended recipient in this transaction; balance deltas alone are not payment proof');
  if(senderKey&&!matching.some(t=>t.source===senderKey))throw new Error('Verified transfer sender does not match the expected sender');
  const totalMatching=matching.reduce((n,t)=>n+t.lamports,0n);
  if(totalMatching!==expectedLamports)throw new Error(`Verified transfer total ${totalMatching.toString()} lamports does not equal expected ${expectedLamports.toString()} lamports`);
  // Balance-delta consistency (secondary, accounts for fees/multi-instruction noise).
  const delta=BigInt((tx.meta.postBalances[idx]??0)-(tx.meta.preBalances[idx]??0));
  if(delta<expectedLamports)throw new Error('Recipient balance delta is smaller than the verified transfer total; unrelated transfers or fees detected');
  // Sender resolution.
  const sender=matching[0]?.source||null;
  return {verified:true as const,signature,recipient:recipientKey,sender,lamports:expectedLamports,amountSol:Number(expectedLamports)/LAMPORTS_PER_SOL,transferCount:matching.length,totalTransfersObserved:transfers.length,balanceDeltaLamports:delta.toString(),blockTime:tx.blockTime||null,slot:tx.slot??null,provider:this.getActiveProvider().name,cluster:this.getCluster()};
 }
}
