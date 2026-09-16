export class Decimal {
  readonly scale:number; readonly units:bigint;
  constructor(units:bigint|number|string, scale=9){this.units=typeof units==='bigint'?units:BigInt(String(units));this.scale=scale;}
  static from(value:number|string, scale=9){const s=String(value);const [a,b='']=s.split('.');const frac=(b+'0'.repeat(scale)).slice(0,scale);const sign=a.startsWith('-')?-1n:1n;const ai=BigInt(a||'0');return new Decimal(sign*(ai<0n?-ai:ai)*10n**BigInt(scale)+sign*BigInt(frac||'0'),scale)}
  add(o:Decimal){this.assert(o);return new Decimal(this.units+o.units,this.scale)}
  sub(o:Decimal){this.assert(o);return new Decimal(this.units-o.units,this.scale)}
  mulRatio(n:bigint,d:bigint){return new Decimal((this.units*n)/d,this.scale)}
  gte(o:Decimal){this.assert(o);return this.units>=o.units}
  toString(){const neg=this.units<0n;const x=neg?-this.units:this.units;const p=10n**BigInt(this.scale);const a=x/p,b=(x%p).toString().padStart(this.scale,'0').replace(/0+$/,'');return `${neg?'-':''}${a}${b?'.'+b:''}`}
  private assert(o:Decimal){if(this.scale!==o.scale)throw new Error('Decimal scale mismatch')}
}
