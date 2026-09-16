export type PriceResult = { usd:number; source:string; fetchedAt:number; change24h?:number };
export async function getSolPrice():Promise<PriceResult>{
  const r=await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd&include_24hr_change=true',{signal:AbortSignal.timeout(7000)});
  if(!r.ok) throw new Error(`Price API HTTP ${r.status}`);
  const d:any=await r.json(); const usd=d?.solana?.usd; if(typeof usd!=='number') throw new Error('Price API returned no SOL/USD price');
  return {usd,source:'CoinGecko',fetchedAt:Date.now(),change24h:typeof d.solana.usd_24h_change==='number'?d.solana.usd_24h_change:undefined};
}
