import JSZip from 'jszip';
import type {Snapshot, Settings, Transaction, PlanRule, OccurrenceOverride, Category, BudgetObject, Debt, DebtPayment} from './models';
import {db,snapshotDatabase,replaceDatabase,type BudgetDatabase} from './db';
import {isDate} from './dates';
import {occurrenceId,validateRecurrence,isScheduledDate} from './recurrence';
const FORMAT=2;
const VERSION='1.3.1';
const MAX_ZIP=20*1024*1024;
const MAX_DATA=30*1024*1024;
type Manifest={formatVersion:number;appVersion:string;exportedAt:string};
export type PreparedImport={manifest:Manifest;data:Snapshot;};
const plain=(v:unknown):v is Record<string,unknown>=>typeof v==='object'&&v!==null&&!Array.isArray(v);
const str=(v:unknown,max=1000):v is string=>typeof v==='string'&&v.length<=max;
const nonempty=(v:unknown,max=200):v is string=>str(v,max)&&v.trim().length>0;
const optional=(v:unknown,max=1000)=>v===undefined||str(v,max);
const pos=(v:unknown)=>typeof v==='number'&&Number.isSafeInteger(v)&&v>0;
const stamp=(v:unknown)=>str(v,40)&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(v)&&!Number.isNaN(Date.parse(v));
const kinds=['expense','income'];
function validateIds(records:{id:string}[],name:string,global:Set<string>){
  const seen=new Set<string>();
  for(const x of records){if(!nonempty(x.id,200)||seen.has(x.id))throw new Error(`Duplicate or invalid ID in ${name}`);
    seen.add(x.id);if(name!=='overrides'){if(global.has(x.id))throw new Error('IDs overlap between collections');global.add(x.id);}}
}
export function validateSnapshot(value:unknown):asserts value is Snapshot{
  if(!plain(value))throw new Error('data.json must be an object');
  const names=['settings','categories','objects','transactions','rules','overrides','debts','debtPayments'] as const;
  for(const key of names)if(!Array.isArray(value[key]))throw new Error(`Missing array: ${key}`);
  const s=value as unknown as Snapshot;
  if(s.settings.length!==1)throw new Error('A backup must contain exactly one settings record');
  const max={settings:1,categories:10000,objects:10000,transactions:100000,rules:10000,overrides:100000,debts:10000,debtPayments:100000};
  for(const k of names)if(s[k].length>max[k])throw new Error(`Too many records in ${k}`);
  for(const k of names)if(!s[k].every(plain))throw new Error(`Invalid record in ${k}`);
  const global=new Set<string>();for(const k of names)validateIds(s[k],k,global);
  const settings=s.settings[0] as Settings;
  if(settings.id!=='main'||!['AMD','RUB','USD','EUR'].includes(settings.currency)||!Number.isSafeInteger(settings.initialMinor)||!isDate(settings.startDate)||!['ru','en','hy'].includes(settings.language)||(settings.theme!==undefined&&!['light','dark','system'].includes(settings.theme))||!stamp(settings.createdAt))throw new Error('Invalid budget settings');
  for(const x of s.categories as Category[])if(!nonempty(x.name)||!kinds.includes(x.kind))throw new Error('Invalid category');
  for(const x of s.objects as BudgetObject[])if(!nonempty(x.name))throw new Error('Invalid object');
  const categories=new Map(s.categories.map(x=>[x.id,x]));const objects=new Set(s.objects.map(x=>x.id));
  const refs=(x:{categoryId?:string;objectId?:string},kind?:string)=>{
    if(x.categoryId!==undefined&&(!categories.has(x.categoryId)||(kind&&categories.get(x.categoryId)!.kind!==kind)))throw new Error('Broken category link');
    if(x.objectId!==undefined&&!objects.has(x.objectId))throw new Error('Broken object link');
  };
  const txs=new Map(s.transactions.map(x=>[x.id,x]));
  const rules=new Map(s.rules.map(x=>[x.id,x]));
  const overrides=new Map(s.overrides.map(x=>[x.id,x]));
  for(const x of s.rules as PlanRule[]){
    if(!kinds.includes(x.kind)||!nonempty(x.title)||!pos(x.amountMinor)||!stamp(x.createdAt)||!validateRecurrence(x)||x.startDate<settings.startDate||!optional(x.note,2000))throw new Error('Invalid planned entry');
    refs(x,x.kind);
  }
  for(const x of s.transactions as Transaction[]){
    if(!kinds.includes(x.kind)||!nonempty(x.title)||!pos(x.amountMinor)||!isDate(x.date)||x.date<settings.startDate||!stamp(x.createdAt)||!optional(x.note,2000)||!optional(x.occurrenceId,300)||!optional(x.debtPaymentId,200)||x.occurrenceId&&x.debtPaymentId)throw new Error('Invalid actual operation');
    refs(x,x.kind);
  }
  const usedTxnIds=new Set<string>();
  for(const o of s.overrides as OccurrenceOverride[]){
    const rule=rules.get(o.ruleId);
    if(!rule||!isDate(o.occurrenceDate)||o.id!==occurrenceId(o.ruleId,o.occurrenceDate)||!['pending','completed','cancelled'].includes(o.status)||
      (o.date!==undefined&&(!isDate(o.date)||o.date<settings.startDate))||(o.title!==undefined&&!nonempty(o.title))||(o.amountMinor!==undefined&&!pos(o.amountMinor))||
      !optional(o.title,200)||!optional(o.note,2000)||!optional(o.transactionId,200))throw new Error('Invalid occurrence override');
    // Completed occurrences may belong to an archived segment after a future-rule split.
    if(o.occurrenceDate<rule.startDate||!isScheduledDate(rule,o.occurrenceDate))throw new Error('Override has no matching recurrence date');
    if((o.categoryId!==undefined&&o.categoryId!==null)||(o.objectId!==undefined&&o.objectId!==null))refs({categoryId:o.categoryId??undefined,objectId:o.objectId??undefined},rule.kind);
    if(o.status==='completed'){
      if(!o.transactionId||!txs.has(o.transactionId)||usedTxnIds.has(o.transactionId))throw new Error('Missing or reused completed transaction');
      const t=txs.get(o.transactionId)!;
      if(t.occurrenceId!==o.id||t.kind!==rule.kind)throw new Error('Broken completed payment link');
      usedTxnIds.add(t.id);
    } else if(o.transactionId!==undefined)throw new Error('Pending or cancelled item has a completed transaction');
  }
  for(const t of s.transactions){if(t.occurrenceId){const o=overrides.get(t.occurrenceId);if(!o||o.status!=='completed'||o.transactionId!==t.id)throw new Error('Orphaned planned payment');}}
  const debtMap=new Map(s.debts.map(d=>[d.id,d]));
  const payments=new Map(s.debtPayments.map(p=>[p.id,p]));
  const amounts=new Map<string,number>();
  const usedDebtTx=new Set<string>();
  for(const d of s.debts as Debt[]){
    if(!nonempty(d.title)||!pos(d.initialMinor)||!isDate(d.openedDate)||!optional(d.note,2000)||!stamp(d.createdAt))throw new Error('Invalid debt');
  }
  for(const p of s.debtPayments as DebtPayment[]){
    const debt=debtMap.get(p.debtId),tx=txs.get(p.transactionId);
    if(!debt||!pos(p.amountMinor)||!isDate(p.date)||p.date<settings.startDate||p.date<debt.openedDate||!optional(p.note,2000)||!stamp(p.createdAt)||
      !tx||tx.debtPaymentId!==p.id||tx.kind!=='expense'||tx.amountMinor!==p.amountMinor||tx.date!==p.date||usedDebtTx.has(tx.id))throw new Error('Invalid debt repayment link');
    usedDebtTx.add(tx.id);
    const sum=(amounts.get(debt.id)??0)+p.amountMinor;
    if(!Number.isSafeInteger(sum)||sum>debt.initialMinor)throw new Error('Repayments exceed debt amount');
    amounts.set(debt.id,sum);
  }
  for(const tx of s.transactions){if(tx.debtPaymentId){const p=payments.get(tx.debtPaymentId);if(!p||p.transactionId!==tx.id)throw new Error('Orphaned debt repayment');}}

}
export async function createBackup(database:BudgetDatabase=db):Promise<Blob>{
  const data=await snapshotDatabase(database);if(data.settings.length!==1)throw new Error('No configured budget to export');validateSnapshot(data);
  const zip=new JSZip();zip.file('manifest.json',JSON.stringify({formatVersion:FORMAT,appVersion:VERSION,exportedAt:new Date().toISOString()},null,2));
  zip.file('data.json',JSON.stringify(data));return zip.generateAsync({type:'blob',compression:'DEFLATE',compressionOptions:{level:6}});
}
export async function inspectBackup(file:Blob):Promise<PreparedImport>{
  if(file.size>MAX_ZIP)throw new Error('Archive too large (20 MB maximum)');
  let zip:JSZip;let archiveBytes:ArrayBuffer;
  try{archiveBytes=await file.arrayBuffer();zip=await JSZip.loadAsync(archiveBytes,{checkCRC32:false});}catch{throw new Error('Damaged or invalid ZIP archive');}
  const entries=Object.values(zip.files);if(entries.length!==2||entries.some(x=>x.dir||!['data.json','manifest.json'].includes(x.name)))throw new Error('ZIP must contain only manifest.json and data.json');
  const mf=zip.file('manifest.json'),df=zip.file('data.json');if(!mf||!df)throw new Error('Missing manifest.json or data.json');
  // Limit uncompressed ZIP size before allocating the data string, to mitigate ZIP bombs.
  const size=(x:JSZip.JSZipObject)=>((x as unknown as { _data?:{ uncompressedSize?:number } })._data?.uncompressedSize??0);
  if(size(mf)>20000||size(df)>MAX_DATA||size(mf)<1||size(df)<1)throw new Error('Uncompressed archive is too large or invalid');
  try{zip=await JSZip.loadAsync(archiveBytes,{checkCRC32:true});}catch{throw new Error('ZIP checksum mismatch or damaged content');}
  let manifest:unknown,data:unknown;
  try{const m=await mf.async('string'),d=await df.async('string');if(m.length>20000||d.length>MAX_DATA)throw new Error('Uncompressed archive too large');manifest=JSON.parse(m);data=JSON.parse(d);}catch(e){throw new Error(e instanceof Error?`Unable to read backup: ${e.message}`:'Unable to read backup');}
  if(!plain(manifest)||![1,FORMAT].includes(manifest.formatVersion as number)||!str(manifest.appVersion,40)||!stamp(manifest.exportedAt))throw new Error('Unsupported or corrupted backup format');
  // Older backups contain six collections; the new collections are empty after upgrade.
  if(manifest.formatVersion===1){
    if(!plain(data)||'debts' in data||'debtPayments' in data)throw new Error('Invalid legacy backup');
    data={...data,debts:[],debtPayments:[]};
  }
  validateSnapshot(data);
  return {manifest:manifest as Manifest,data};
}
export async function importBackup(prepared:PreparedImport,database:BudgetDatabase=db):Promise<void>{
  // Validate immediately before the only write transaction.
  validateSnapshot(prepared.data);
  await replaceDatabase(prepared.data,database);
}
export function downloadBlob(blob:Blob,filename:string){const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}
