import fs from 'node:fs';
import path from 'node:path';

export type Outcome='CONFIRMED'|'FAILED'|'REFUSED'|'DRY_RUN'|'PENDING';
export type Attempt={id:string,at:number,outcome:Outcome,signature?:string,error?:string,reason?:string,amountSol?:number,destination?:string,lastValidBlockHeight?:number};
export type State={running:boolean,lastAttemptAt:number|null,dailyCount:number,dailyDate:string,lastSweepAt:number|null,attempts:Attempt[],emergencyStop?:{engaged:boolean,reason:string,at:number}};

export class StorageEngine{
 private file=path.join(process.cwd(),'data','scheduler-state.json');
 state:State;
 constructor(){fs.mkdirSync(path.dirname(this.file),{recursive:true});this.state=this.load();this.rollDay();}
 private load():State{
  try{
   const raw=JSON.parse(fs.readFileSync(this.file,'utf8'));
   return {...raw,lastAttemptAt:raw.lastAttemptAt??raw.lastTransferAt??null,lastSweepAt:raw.lastSweepAt??null,attempts:Array.isArray(raw.attempts)?raw.attempts:[],emergencyStop:raw.emergencyStop??{engaged:false,reason:'',at:0}};
  }catch{return {running:false,lastAttemptAt:null,dailyCount:0,dailyDate:new Date().toISOString().slice(0,10),lastSweepAt:null,attempts:[],emergencyStop:{engaged:false,reason:'',at:0}};}
 }
 private save(){fs.writeFileSync(this.file,JSON.stringify(this.state,null,2));}
 private rollDay(){const d=new Date().toISOString().slice(0,10);if(this.state.dailyDate!==d){this.state.dailyDate=d;this.state.dailyCount=0;this.save();}}
 get(){this.rollDay();return structuredClone(this.state);}
 setRunning(v:boolean){this.state.running=v;this.save();}
 claimAttemptSlot(at:number){this.rollDay();this.state.lastAttemptAt=at;this.save();}
 setLastSweepAt(at:number){this.state.lastSweepAt=at;this.save();}
 setEmergencyStop(engaged:boolean,reason=''){this.state.emergencyStop={engaged,reason,at:Date.now()};this.save();}
 isEmergencyStopped(){return this.state.emergencyStop?.engaged===true;}
 hasPending(){return this.state.attempts.some(a=>a.outcome==='PENDING');}
 getPending(){return this.state.attempts.find(a=>a.outcome==='PENDING')||null;}
 record(a:Attempt,confirmed=false){this.rollDay();this.state.attempts.unshift(a);this.state.attempts=this.state.attempts.slice(0,200);if(confirmed)this.state.dailyCount++;this.state.lastAttemptAt=a.at;this.save();}
 update(id:string,patch:Partial<Attempt>,confirmed=false){this.rollDay();const i=this.state.attempts.findIndex(a=>a.id===id);if(i<0)throw new Error(`Unknown scheduler attempt ${id}`);const wasConfirmed=this.state.attempts[i].outcome==='CONFIRMED';this.state.attempts[i]={...this.state.attempts[i],...patch};if(confirmed&&!wasConfirmed)this.state.dailyCount++;this.save();return this.state.attempts[i];}
}
