import type { Snapshot, Occurrence, Transaction } from './models';
import {addDays,dayDiff,isDate} from './dates';
import {expandOccurrences} from './recurrence';
import {safeSum} from './money';
export interface Point {date:string;balance:number;}
export interface Projection { actual:number; actualIncome:number; actualExpense:number; projected:number; minBalance:number; minDate:string; shortageDate?:string; shortageMinor?:number; points:Point[]; upcomingExpense:number; upcomingIncome:number; overdueIncome:Occurrence[]; overdueExpense:Occurrence[]; events:Occurrence[]; }
export function actualBalance(s:Snapshot,asOf:string):number {
  const cfg=s.settings[0];if(!cfg)return 0;
  return s.transactions.filter(x=>x.date>=cfg.startDate&&x.date<=asOf).reduce((acc,x)=>safeSum(acc,x.kind==='income'?x.amountMinor:-x.amountMinor),cfg.initialMinor);
}
export function totalsForMonth(s:Snapshot,selected:string,asOf:string){
  const prefix=selected.slice(0,7);
  const ops=s.transactions.filter(x=>x.date.startsWith(prefix)&&x.date<=asOf&&x.date>=s.settings[0].startDate);
  return {income:ops.filter(x=>x.kind==='income').reduce((x,a)=>safeSum(x,a.amountMinor),0),expense:ops.filter(x=>x.kind==='expense').reduce((x,a)=>safeSum(x,a.amountMinor),0)};
}
export function projection(s:Snapshot,today:string,end:string):Projection {
  if(!s.settings[0]||!isDate(today)||!isDate(end))throw new Error('Invalid projection');
  const cfg=s.settings[0];
  const actual=actualBalance(s,today);
  const horizon=[end,today,...s.overrides.filter(o=>o.date&&o.date<=end).map(o=>o.occurrenceDate)].sort().at(-1)!;
  const events=expandOccurrences(s.rules,s.overrides,horizon,cfg.startDate).filter(o=>o.status==='pending');
  const overdueIncome=events.filter(x=>x.date<today&&x.kind==='income');
  const overdueExpense=events.filter(x=>x.date<today&&x.kind==='expense');
  const future=end<today?[]:events.filter(x=>x.kind==='expense'||x.date>=today).filter(x=>x.date<=end||x.date<today&&x.kind==='expense');
  const start=cfg.startDate>today?cfg.startDate:today;
  const steps=Math.max(0,dayDiff(start,end));
  if(steps>10000)throw new Error('Forecast horizon too long');
  let balance=end<today?actualBalance(s,end):actual;
  let minBalance=balance,minDate=end<today?end:start;
  let shortageDate:string|undefined=balance<0?start:undefined,shortageMinor:number|undefined=balance<0?-balance:undefined;
  const points:Point[]=[];
  const grouped=new Map<string,number>();
  for(const o of future){const at=o.date<today?today:o.date;if(at<start||at>end)continue;grouped.set(at,safeSum(grouped.get(at)??0,o.kind==='income'?o.amountMinor:-o.amountMinor));}
  if(end>=start){for(let i=0;i<=steps;i++){
    const date=addDays(start,i);balance=safeSum(balance,grouped.get(date)??0);
    points.push({date,balance});
    if(balance<minBalance){minBalance=balance;minDate=date;}
    if(balance<0&&!shortageDate){shortageDate=date;shortageMinor=-balance;}
  }} else if(balance<0){shortageDate=end;shortageMinor=-balance;}
  return {actual,actualIncome:0,actualExpense:0,projected:balance,minBalance,minDate,shortageDate,shortageMinor,points,
    upcomingExpense:future.filter(o=>o.kind==='expense'&&(o.date>=today||o.date<today)).reduce((sum,o)=>safeSum(sum,o.amountMinor),0),
    upcomingIncome:future.filter(o=>o.kind==='income'&&o.date>=today).reduce((sum,o)=>safeSum(sum,o.amountMinor),0),
    overdueIncome,overdueExpense,events};
}
export function transactionSign(t:Transaction){return t.kind==='income'?1:-1;}
