import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
import type {Agent,Allocation,AuditEvent,Opportunity,Revenue,RevenueOrder,RevenueProduct,RiskEvent,Signal,Strategy,Task,TxRecord} from './domain';
export type CoreState={agents:Agent[],strategies:Strategy[],opportunities:Opportunity[],signals:Signal[],tasks:Task[],allocations:Allocation[],revenue:Revenue[],revenueProducts:RevenueProduct[],revenueOrders:RevenueOrder[],transactions:TxRecord[],riskEvents:RiskEvent[],audit:AuditEvent[],system:{emergencyStop:boolean,reason:string,updatedAt:number}};
const empty=():CoreState=>({agents:[],strategies:[],opportunities:[],signals:[],tasks:[],allocations:[],revenue:[],revenueProducts:[],revenueOrders:[],transactions:[],riskEvents:[],audit:[],system:{emergencyStop:false,reason:'',updatedAt:Date.now()}});
export class CoreStore{
 private file=path.join(process.cwd(),'data','core-state.json'); state:CoreState;
 constructor(){fs.mkdirSync(path.dirname(this.file),{recursive:true});try{this.state={...empty(),...JSON.parse(fs.readFileSync(this.file,'utf8'))}}catch{this.state=empty()}this.migrate();this.seed()}
 private save(){try{const tmp=`${this.file}.tmp-${process.pid}`;fs.writeFileSync(tmp,JSON.stringify(this.state,null,2),{mode:0o600});fs.renameSync(tmp,this.file);try{fs.chmodSync(this.file,0o600)}catch{}}catch{fs.writeFileSync(this.file,JSON.stringify(this.state,null,2),{mode:0o600})}}
 private migrate(){const e=empty();for(const k of Object.keys(e) as (keyof CoreState)[]){if((this.state as any)[k]===undefined)(this.state as any)[k]=(e as any)[k]}}
 private seed(){
  if(!this.state.strategies.length)this.state.strategies=[
   ['analytics','Analytics & data services',true],['wallet-reports','Wallet/token reports',true],['security-analysis','Security analysis',true],['launch-packages','Launch packages',true],['premium-alerts','Premium alerts',true],['api-data','API/data services',true],['research','Research services',true],['treasury-reporting','Treasury reporting',true],['portfolio-analytics','Portfolio analytics',true],['liquidity-monitoring','Liquidity monitoring',true],['risk-monitoring','Risk monitoring',true],['indexing','Indexing/data-quality services',true],['automation','Automation services',true],['data-quality','Data-quality services',true],['defi-opportunity','Risk-reviewed DeFi opportunities',false],['arbitrage','Economically viable arbitrage',false],['liquidity','Risk-adjusted liquidity strategies',false]
  ].map(([id,name,zero])=>({id:String(id),name:String(name),category:String(id),capitalRequiredSol:zero?0:0.1,minExpectedReturnPct:0,riskLevel:zero?'LOW':'HIGH',supportsZeroCapital:Boolean(zero),enabled:true,description:`Extensible ${name} strategy; no earnings are assumed without verified evidence.`} as Strategy));
  if(!this.state.agents.length)for(let i=1;i<=20;i++)this.state.agents.push({id:`agent-${String(i).padStart(2,'0')}`,walletAddress:null,strategyPermissions:this.state.strategies.filter(s=>s.supportsZeroCapital).map(s=>s.id),budgetSol:0,riskProfile:'STANDARD',supportedNetworks:['solana'],minimumExpectedReturnPct:0,gasReserveSol:0.01,dailyLossLimitSol:0,exposureLimitSol:0,performance:{verifiedRevenueSol:0,verifiedCostSol:0,executions:0,successes:0},status:'ACTIVE',heartbeat:Date.now(),independentDecisionId:null});
  if(!this.state.revenueProducts.length)this.state.revenueProducts=[
   ['wallet-report','Wallet Intelligence Report','analytics','Customer-paid on-chain wallet analysis.','0.02','SOL','AUTOMATED','0'],
   ['token-risk-report','Token Risk Report','security-analysis','Evidence-backed token and contract risk report.','0.04','SOL','AUTOMATED','0'],
   ['premium-alerts','Premium On-Chain Alerts','premium-alerts','Subscription access to configurable on-chain alerts.','0.04','SOL','AUTOMATED','0'],
   ['api-access','YABBAI Data API','api-data','Paid API access to verified on-chain analytics.','0.10','SOL','API','0'],
   ['custom-research','Custom Crypto Research','research','Customer-requested research delivered from verifiable sources.','0.10','SOL','MANUAL','0']
  ].map(x=>({id:x[0],name:x[1],category:x[2],description:x[3],priceAmount:x[4],priceAsset:x[5],deliveryMode:x[6] as any,capitalRequiredSol:x[7],enabled:true,createdAt:Date.now()}));
  this.save()
 }
 get(){return structuredClone(this.state)}
 upsertOpportunity(o:Opportunity){const i=this.state.opportunities.findIndex(x=>x.id===o.id);if(i>=0)this.state.opportunities[i]=o;else this.state.opportunities.unshift(o);this.state.opportunities=this.state.opportunities.slice(0,1000);this.save();return o}
 addTask(t:Task){if(!this.state.tasks.some(x=>x.idempotencyKey===t.idempotencyKey)){this.state.tasks.unshift(t);this.save()}return this.state.tasks.find(x=>x.idempotencyKey===t.idempotencyKey)!}
 addSignal(s:Signal){this.state.signals.unshift(s);this.save();return s}
 addRevenue(r:Revenue){if(this.state.revenue.some(x=>x.idempotencyKey===r.idempotencyKey||x.externalId===r.externalId))return this.state.revenue.find(x=>x.idempotencyKey===r.idempotencyKey||x.externalId===r.externalId)!;this.state.revenue.unshift(r);this.save();return r}
 addProduct(p:RevenueProduct){if(!this.state.revenueProducts.some(x=>x.id===p.id))this.state.revenueProducts.unshift(p);this.save();return p}
 addOrder(o:RevenueOrder){if(!this.state.revenueOrders.some(x=>x.id===o.id))this.state.revenueOrders.unshift(o);this.save();return o}
 updateOrder(id:string,patch:Partial<RevenueOrder>){const x=this.state.revenueOrders.find(x=>x.id===id);if(!x)throw new Error('Unknown order');Object.assign(x,patch,{updatedAt:Date.now()});this.save();return x}
 addAllocation(a:Allocation){if(!this.state.allocations.some(x=>x.id===a.id))this.state.allocations.unshift(a);this.save();return a}
 addTx(t:TxRecord){if(!this.state.transactions.some(x=>x.id===t.idempotencyKey||x.id===t.id))this.state.transactions.unshift(t);this.save();return t}
 updateTx(id:string,patch:Partial<TxRecord>){const x=this.state.transactions.find(x=>x.id===id);if(!x)throw new Error('Unknown transaction');Object.assign(x,patch,{updatedAt:Date.now()});this.save();return x}
 audit(action:string,actor:string,entityType:string,entityId:string,result:string,metadata?:Record<string,unknown>){this.state.audit.unshift({id:crypto.randomUUID(),at:Date.now(),action,actor,entityType,entityId,result,metadata});this.state.audit=this.state.audit.slice(0,5000);this.save()}
 risk(type:string,severity:RiskEvent['severity'],message:string,entityId?:string){this.state.riskEvents.unshift({id:crypto.randomUUID(),type,severity,message,createdAt:Date.now(),entityId});this.save()}
 setEmergencyStop(on:boolean,reason=''){this.state.system={emergencyStop:on,reason,updatedAt:Date.now()};this.save()}
}
