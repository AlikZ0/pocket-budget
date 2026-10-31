import type { PlanRule, Occurrence, OccurrenceOverride } from './models';
import { addDays, addMonthsAnchor, addYearsAnchor, dayDiff, isDate, parts } from './dates';
export const occurrenceId = (ruleId:string,originalDate:string) => `${ruleId}@${originalDate}`;
export function occurrenceDates(rule:PlanRule,through:string,from?:string):string[]{
  if(!isDate(rule.startDate)||!isDate(through)||rule.startDate>through)return [];
  const dates:string[]=[];
  const at=(n:number)=>rule.frequency==='weekly'?addDays(rule.startDate,7*n):
    rule.frequency==='monthly'?addMonthsAnchor(rule.startDate,n,rule.anchorDay):
    rule.frequency==='yearly'?addYearsAnchor(rule.startDate,n,rule.anchorDay):rule.startDate;
  // Jump close to the requested window rather than allocating historic repeats.
  let i=0;
  if(from&&from>rule.startDate){
    const a=parts(rule.startDate),b=parts(from);
    if(rule.frequency==='once')return [];
    if(rule.frequency==='weekly')i=Math.max(0,Math.floor(dayDiff(rule.startDate,from)/7)-1);
    if(rule.frequency==='monthly')i=Math.max(0,(b.y-a.y)*12+b.m-a.m-1);
    if(rule.frequency==='yearly')i=Math.max(0,b.y-a.y-1);
  }
  for(;i<20000;i++){
    const current=at(i);
    if(current>through||(rule.endDate&&current>rule.endDate))break;
    if(!from||current>=from)dates.push(current);
    if(rule.frequency==='once')break;
  }
  return dates;
}
export function isScheduledDate(rule:PlanRule,date:string):boolean {
  if(!isDate(date)||date<rule.startDate)return false;
  if(rule.frequency==='once')return date===rule.startDate;
  if(rule.frequency==='weekly')return dayDiff(rule.startDate,date)%7===0;
  const a=parts(rule.startDate),b=parts(date);
  if(rule.frequency==='monthly')return addMonthsAnchor(rule.startDate,(b.y-a.y)*12+b.m-a.m,rule.anchorDay)===date;
  if(rule.frequency==='yearly')return a.m===b.m&&addYearsAnchor(rule.startDate,b.y-a.y,rule.anchorDay)===date;
  return false;
}
export function expandOccurrences(rules:PlanRule[],overrides:OccurrenceOverride[],through:string,from?:string):Occurrence[]{
  const map=new Map(overrides.map(o=>[o.id,o]));
  const result=new Map<string,Occurrence>();
  const toOccurrence=(rule:PlanRule,originalDate:string,o?:OccurrenceOverride):Occurrence=>({
    id:occurrenceId(rule.id,originalDate),ruleId:rule.id,originalDate,date:o?.date??originalDate,
    kind:rule.kind,title:o?.title??rule.title,amountMinor:o?.amountMinor??rule.amountMinor,
    categoryId:o?.categoryId===null?undefined:o?.categoryId??rule.categoryId,
    objectId:o?.objectId===null?undefined:o?.objectId??rule.objectId,
    note:o?.note??rule.note,status:o?.status??'pending',transactionId:o?.transactionId,frequency:rule.frequency
  });
  const rulesById=new Map(rules.map(r=>[r.id,r]));
  // Only dates actually visible in the requested window are returned, even when a
  // scheduled occurrence was postponed beyond that window.
  for(const rule of rules)for(const originalDate of occurrenceDates(rule,through,from)){
    const id=occurrenceId(rule.id,originalDate),o=toOccurrence(rule,originalDate,map.get(id));
    if(o.date<=through&&(!from||o.date>=from))result.set(id,o);
  }
  // A shifted occurrence may originate beyond 'through' but be moved into view.
  // A resolved occurrence may belong to the old series, which was truncated
  // after changing this and following instances; it remains part of history.
  for(const o of overrides){
    if(result.has(o.id))continue;
    const rule=rulesById.get(o.ruleId);
    if(!rule||!(o.status==='completed'||o.status==='cancelled'||o.date))continue;
    const date=o.date??o.occurrenceDate;
    if(date>through||(from&&date<from))continue;
    // Verify the original anchor so that malformed overrides cannot make up dates.
    if(!isScheduledDate(rule,o.occurrenceDate))continue;
    if(o.status==='pending' && rule.endDate && o.occurrenceDate>rule.endDate)continue;
    result.set(o.id,toOccurrence(rule,o.occurrenceDate,o));
  }
  return Array.from(result.values()).sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id));
}
export function validateRecurrence(rule:PlanRule):boolean {return isDate(rule.startDate)&&(!rule.endDate || (isDate(rule.endDate)&&rule.endDate>=rule.startDate))&&Number.isInteger(rule.anchorDay)&&rule.anchorDay>=1&&rule.anchorDay<=31&&['once','weekly','monthly','yearly'].includes(rule.frequency);}
export function previousDate(s:string):string{return addDays(s,-1);}
export function isOverdue(o:Occurrence,today:string):boolean{return o.status==='pending'&&o.date<today;}
export function daysUntil(o:Occurrence,today:string):number{return dayDiff(today,o.date);}
