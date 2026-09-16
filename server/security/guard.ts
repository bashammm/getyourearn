import crypto from 'node:crypto';
export class SecurityGuard{
 private hits=new Map<string,{count:number,reset:number}>();
 checkRateLimit(key:string,limit=120,windowMs=60000){ const now=Date.now(); for(const [k,v] of this.hits) if(now>v.reset) this.hits.delete(k); const x=this.hits.get(key); if(!x||now>x.reset){this.hits.set(key,{count:1,reset:now+windowMs});return {allowed:true,reset:now+windowMs};} x.count++; return {allowed:x.count<=limit,reset:x.reset}; }
 static constantTimeCompare(a:string,b:string){const A=Buffer.from(a),B=Buffer.from(b);return A.length===B.length&&crypto.timingSafeEqual(A,B);}
}
