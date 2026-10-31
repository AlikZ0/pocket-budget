import type { Currency, Language } from './models';
const decimals: Record<Currency,number>={AMD:2,RUB:2,USD:2,EUR:2};
// AMD uses 2 minor units (luma) in ISO 4217; amounts are stored as integer luma.
export function minorDigits(currency:Currency):number{return decimals[currency];}
export function parseMoney(value:string,currency:Currency):number|null {
  const text=value.trim().replace(/\s/g,'').replace(',','.');
  if (!/^\d+(\.\d{1,2})?$/.test(text))return null;
  const [units,fraction='']=text.split('.');
  const v=Number(units)*10**minorDigits(currency)+Number(fraction.padEnd(minorDigits(currency),'0'));
  return Number.isSafeInteger(v)&&v>0?v:null;
}
export function parseBalance(value:string,currency:Currency):number|null {const minus=value.trim().startsWith('-');const n=parseMoney(value.trim().replace(/^-/,'')||'0.00',currency);if(n===null && /^(0|0[.,]0{1,2})$/.test(value.trim()))return 0;return n===null?null:(minus?-n:n);}
export function moneyInput(minor:number,currency:Currency):string {const digits=minorDigits(currency);const abs=BigInt(Math.abs(minor));const scale=10n**BigInt(digits);return `${minor<0?'-':''}${abs/scale}.${String(abs%scale).padStart(digits,'0')}`;}
export function formatMoney(minor:number,currency:Currency,language:Language='ru'):string {
  const scale=10n**BigInt(minorDigits(currency));const abs=BigInt(Math.abs(minor));
  const formatter=new Intl.NumberFormat(language==='ru'?'ru-RU':language==='hy'?'hy-AM':'en-US',{style:'currency',currency,minimumFractionDigits:2,maximumFractionDigits:2});
  const major=abs/scale;const signedMajor=minor<0?(major===0n?-0:-major):major;
  return formatter.formatToParts(signedMajor).map(part=>part.type==='fraction'?String(abs%scale).padStart(2,'0'):part.value).join('');
}
export function safeSum(a:number,b:number):number {const s=a+b;if(!Number.isSafeInteger(s))throw new Error('Amount exceeds safe integer range');return s;}
