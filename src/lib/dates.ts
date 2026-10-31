import type { ISODate, Language } from './models';
const DAY = 86400000;
export function isDate(s:unknown): s is ISODate {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const y=Number(s.slice(0,4)), m=Number(s.slice(5,7)), d=Number(s.slice(8,10));
  return y>=1900 && y<=2200 && m>=1 && m<=12 && d>=1 && d<=daysInMonth(y,m);
}
export function daysInMonth(y:number,m:number):number {return new Date(Date.UTC(y,m,0)).getUTCDate();}
export function fromParts(y:number,m:number,d:number):ISODate {return `${String(y).padStart(4,'0')}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;}
export function parts(s:ISODate){return {y:Number(s.slice(0,4)),m:Number(s.slice(5,7)),d:Number(s.slice(8,10))};}
export function addDays(s:ISODate, delta:number):ISODate {const {y,m,d}=parts(s);return new Date(Date.UTC(y,m-1,d+delta)).toISOString().slice(0,10);}
export function addMonthsAnchor(s:ISODate, months:number, anchor:number):ISODate {const {y,m}=parts(s);const n=y*12+m-1+months;const ny=Math.floor(n/12),nm=n%12+1;return fromParts(ny,nm,Math.min(anchor,daysInMonth(ny,nm)));}
export function addYearsAnchor(s:ISODate, years:number, anchor:number):ISODate {const {y,m}=parts(s);return fromParts(y+years,m,Math.min(anchor,daysInMonth(y+years,m)));}
export function localToday():ISODate {const d=new Date();return fromParts(d.getFullYear(),d.getMonth()+1,d.getDate());}
export function monthEnd(s:ISODate):ISODate {const {y,m}=parts(s);return fromParts(y,m,daysInMonth(y,m));}
export function dayDiff(a:ISODate,b:ISODate):number {const x=parts(a),z=parts(b);return Math.round((Date.UTC(z.y,z.m-1,z.d)-Date.UTC(x.y,x.m-1,x.d))/DAY);}
export function formatDate(s:string, language:Language='ru'):string {if (!isDate(s))return s;const {y,m,d}=parts(s);return new Intl.DateTimeFormat(language==='ru'?'ru-RU':language==='hy'?'hy-AM':'en-GB',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(Date.UTC(y,m-1,d)));}
