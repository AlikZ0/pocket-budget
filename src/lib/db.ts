import Dexie, {type Table} from 'dexie';
import type {Settings, Category, BudgetObject, Transaction, PlanRule, OccurrenceOverride, Snapshot, Occurrence, Currency, Language, Debt, DebtPayment} from './models';
import {newId} from './models';
import {parts,isDate,localToday} from './dates';
import {debtOutstanding} from './debts';
import {occurrenceId,previousDate,isScheduledDate,validateRecurrence} from './recurrence';

export class BudgetDatabase extends Dexie {
  settings!:Table<Settings,string>;
  categories!:Table<Category,string>;
  objects!:Table<BudgetObject,string>;
  transactions!:Table<Transaction,string>;
  rules!:Table<PlanRule,string>;
  overrides!:Table<OccurrenceOverride,string>;
  debts!:Table<Debt,string>;
  debtPayments!:Table<DebtPayment,string>;
  constructor(name='pocket-budget-v1'){
    super(name);
    this.version(1).stores({settings:'id', categories:'id,kind',objects:'id',transactions:'id,date,kind,occurrenceId',rules:'id,startDate,frequency',overrides:'id,ruleId,occurrenceDate,status,transactionId'});
    this.version(2).stores({settings:'id', categories:'id,kind',objects:'id',transactions:'id,date,kind,occurrenceId',rules:'id,startDate,frequency',overrides:'id,ruleId,occurrenceDate,status,transactionId'});
    this.version(3).stores({settings:'id', categories:'id,kind',objects:'id',transactions:'id,date,kind,occurrenceId,debtPaymentId',rules:'id,startDate,frequency',overrides:'id,ruleId,occurrenceDate,status,transactionId',debts:'id',debtPayments:'id,debtId,date,transactionId'});
  }
}
export const db=new BudgetDatabase();
const tables=()=>[db.settings,db.categories,db.objects,db.transactions,db.rules,db.overrides,db.debts,db.debtPayments];
export async function snapshotDatabase(database:BudgetDatabase=db):Promise<Snapshot>{
  return database.transaction('r',[database.settings,database.categories,database.objects,database.transactions,database.rules,database.overrides,database.debts,database.debtPayments], async()=>({
    settings:await database.settings.toArray(),categories:await database.categories.toArray(),objects:await database.objects.toArray(),
    transactions:await database.transactions.toArray(),rules:await database.rules.toArray(),overrides:await database.overrides.toArray(),
    debts:await database.debts.toArray(),debtPayments:await database.debtPayments.toArray()
  }));
}
export async function replaceDatabase(data:Snapshot,database:BudgetDatabase=db):Promise<void>{
  await database.transaction('rw',[database.settings,database.categories,database.objects,database.transactions,database.rules,database.overrides,database.debts,database.debtPayments],async()=>{
    await Promise.all([database.settings.clear(),database.categories.clear(),database.objects.clear(),database.transactions.clear(),database.rules.clear(),database.overrides.clear(),database.debts.clear(),database.debtPayments.clear()]);
    await database.settings.bulkAdd(data.settings);await database.categories.bulkAdd(data.categories);await database.objects.bulkAdd(data.objects);
    await database.transactions.bulkAdd(data.transactions);await database.rules.bulkAdd(data.rules);await database.overrides.bulkAdd(data.overrides);
    await database.debts.bulkAdd(data.debts);await database.debtPayments.bulkAdd(data.debtPayments);
  });
}
export async function setup(currency:Currency,initialMinor:number,startDate:string,language:Language){
  await db.transaction('rw',tables(),async()=>{
    if(await db.settings.get('main'))throw new Error('Already initialized');
    if(!['AMD','RUB','USD','EUR'].includes(currency)||!Number.isSafeInteger(initialMinor)||!isDate(startDate)||startDate>localToday()||!['ru','en','hy'].includes(language))throw new Error('Invalid initial settings');
    await db.settings.add({id:'main',currency,initialMinor,startDate,language,theme:'system',createdAt:new Date().toISOString()});
  });
}
export async function saveTransaction(item:Transaction):Promise<void>{
  await db.transaction('rw',db.transactions,db.overrides,db.settings,db.categories,db.objects,async()=>{
    const cfg=await db.settings.get('main');
    if(!cfg||!item.title.trim()||item.title.length>200||!Number.isSafeInteger(item.amountMinor)||item.amountMinor<=0||!isDate(item.date)||item.date<cfg.startDate||item.date>localToday()||!(item.kind==='income'||item.kind==='expense')||item.note&&item.note.length>2000)throw new Error('Invalid actual operation');
    if(item.categoryId){const category=await db.categories.get(item.categoryId);if(!category||category.kind!==item.kind)throw new Error('Invalid category');}
    if(item.objectId&&!await db.objects.get(item.objectId))throw new Error('Invalid object');
    const prior=await db.transactions.get(item.id);
    if(prior?.occurrenceId && prior.occurrenceId!==item.occurrenceId)throw new Error('Linked transaction cannot be detached');
    if(prior?.occurrenceId&&item.kind!==prior.kind)throw new Error('Cannot change the type of a completed payment');
    if(item.debtPaymentId||prior?.debtPaymentId)throw new Error('Edit debt payments from the Debts section');
    if(item.occurrenceId){
      const override=await db.overrides.get(item.occurrenceId);
      if(override?.transactionId!==item.id||override.status!=='completed')throw new Error('Invalid payment link');
      if(prior && prior.occurrenceId!==item.occurrenceId)throw new Error('Invalid payment link');
    }
    await db.transactions.put(item);
  });
}
export async function deleteTransaction(id:string){
  await db.transaction('rw',db.transactions,db.overrides,async()=>{
    const item=await db.transactions.get(id);if(!item)return;
    if(item.debtPaymentId)throw new Error('Delete debt payments from the Debts section');
    if(item.occurrenceId){const o=await db.overrides.get(item.occurrenceId);
      if(o?.transactionId!==id)throw new Error('Broken payment link');
      if(o)await db.overrides.put({...o,status:'pending',transactionId:undefined});
    }
    await db.transactions.delete(id);
  });
}
/** Validates the current rule inside the write transaction, so stale dialogs cannot
 * write a payment for a rule changed or cancelled in another tab. */
async function assertPendingOccurrence(occ:Occurrence):Promise<OccurrenceOverride|undefined>{
  const rule=await db.rules.get(occ.ruleId);
  if(!rule||!isScheduledDate(rule,occ.originalDate)||(rule.endDate&&occ.originalDate>rule.endDate))throw new Error('Payment schedule changed. Reopen the plan.');
  const current=await db.overrides.get(occ.id);
  if(current?.status==='completed'||current?.status==='cancelled')throw new Error('Occurrence already resolved');
  const expectedDate=current?.date??occ.originalDate;
  const expectedCategory=current?.categoryId===null?undefined:current?.categoryId??rule.categoryId;
  const expectedObject=current?.objectId===null?undefined:current?.objectId??rule.objectId;
  if(expectedDate!==occ.date || (current?.amountMinor??rule.amountMinor)!==occ.amountMinor || (current?.title??rule.title)!==occ.title || rule.kind!==occ.kind || expectedCategory!==occ.categoryId || expectedObject!==occ.objectId || (current?.note??rule.note)!==occ.note)
    throw new Error('Payment has changed. Reopen the plan.');
  return current;
}
export async function markCompleted(occ:Occurrence,date:string,amountMinor:number){
  await db.transaction('rw',db.overrides,db.transactions,db.rules,db.settings,async()=>{
    const cfg=await db.settings.get('main');
    if(!cfg||!isDate(date)||date<cfg.startDate||date>localToday()||!Number.isSafeInteger(amountMinor)||amountMinor<=0)throw new Error('Invalid payment date or amount');
    const existing=await assertPendingOccurrence(occ);
    const already=await db.transactions.where('occurrenceId').equals(occ.id).first();
    if(already)throw new Error('Occurrence already resolved');
    const id=newId();
    const txn:Transaction={id,kind:occ.kind,title:occ.title,amountMinor,date,categoryId:occ.categoryId,objectId:occ.objectId,note:occ.note,occurrenceId:occ.id,createdAt:new Date().toISOString()};
    await db.transactions.add(txn);
    await db.overrides.put({...existing,id:occ.id,ruleId:occ.ruleId,occurrenceDate:occ.originalDate,date:occ.date!==occ.originalDate?occ.date:undefined,
      amountMinor:occ.amountMinor,title:occ.title,categoryId:occ.categoryId,objectId:occ.objectId,note:occ.note,status:'completed',transactionId:id});
  });
}
export async function overrideOccurrence(occ:Occurrence,change:Partial<Pick<OccurrenceOverride,'date'|'amountMinor'|'title'|'categoryId'|'objectId'|'note'|'status'>>){
  await db.transaction('rw',db.overrides,db.rules,db.settings,async()=>{
    const cfg=await db.settings.get('main');
    if(!cfg||change.status && change.status!=='pending'||change.date!==undefined&&(!isDate(change.date)||change.date<cfg.startDate)||change.amountMinor!==undefined&&(!Number.isSafeInteger(change.amountMinor)||change.amountMinor<=0)||change.title!==undefined&&!change.title.trim()||change.note!==undefined&&change.note.length>2000)
      throw new Error('Invalid payment change');
    const prev=await assertPendingOccurrence(occ);
    await db.overrides.put({...prev,id:occ.id,ruleId:occ.ruleId,occurrenceDate:occ.originalDate,status:'pending',...change});
  });
}
export async function cancelOccurrence(occ:Occurrence){
  await db.transaction('rw',db.overrides,db.rules,async()=>{
    const prev=await assertPendingOccurrence(occ);
    await db.overrides.put({...prev,id:occ.id,ruleId:occ.ruleId,occurrenceDate:occ.originalDate,status:'cancelled'});
  });
}
/** Only active schedules can be inserted; enforce validation at the database boundary. */
export async function addPlanRule(rule:PlanRule){
  await db.transaction('rw',db.rules,db.settings,db.categories,db.objects,async()=>{
    const cfg=await db.settings.get('main');
    if(!cfg||!validateRecurrence(rule)||rule.startDate<cfg.startDate||!rule.title.trim()||rule.title.length>200||!Number.isSafeInteger(rule.amountMinor)||rule.amountMinor<=0||!['income','expense'].includes(rule.kind)||rule.note&&rule.note.length>2000)throw new Error('Invalid plan');
    if(rule.categoryId){const category=await db.categories.get(rule.categoryId);if(!category||category.kind!==rule.kind)throw new Error('Invalid category');}
    if(rule.objectId&&!await db.objects.get(rule.objectId))throw new Error('Invalid object');
    await db.rules.add(rule);
  });
}
export async function saveRuleFrom(rule:PlanRule,selected:Occurrence,updated:PlanRule){
  await db.transaction('rw',db.rules,db.overrides,db.settings,db.categories,db.objects,async()=>{
    const current=await db.rules.get(rule.id);if(!current)throw new Error('Rule was removed');
    const cfg=await db.settings.get('main');
    if(!cfg||!validateRecurrence(updated)||updated.startDate<cfg.startDate||!updated.title.trim()||updated.title.length>200||
       !Number.isSafeInteger(updated.amountMinor)||updated.amountMinor<=0||updated.kind!==current.kind||
       (updated.note!==undefined&&updated.note.length>2000))throw new Error('Invalid updated plan');
    if(updated.categoryId){const cat=await db.categories.get(updated.categoryId);if(!cat||cat.kind!==updated.kind)throw new Error('Invalid category');}
    if(updated.objectId&&!await db.objects.get(updated.objectId))throw new Error('Invalid object');
    if(!isScheduledDate(current,selected.originalDate)||(current.endDate&&selected.originalDate>current.endDate))throw new Error('Payment schedule changed');
    const selectedOverride=await db.overrides.get(selected.id);
    if(selected.status!=='pending'||selectedOverride?.status==='completed'||selectedOverride?.status==='cancelled')throw new Error('This occurrence is already resolved');
    // An early payment may have been completed for a later calendar occurrence.
    // Splitting/changing the series could create another pending instance at the
    // same date. Reject it instead of silently charging the user twice.
    const allOverrides=await db.overrides.where('ruleId').equals(current.id).toArray();
    if(allOverrides.some(o=>o.status==='completed'&&o.occurrenceDate>=selected.originalDate))
      throw new Error('A later occurrence is already completed. Keep its history and edit single pending dates instead.');
    if(selected.originalDate<=current.startDate){
      // Replace the entire rule, retaining its stable ID and completed history.
      const completed=await db.overrides.where('ruleId').equals(current.id).filter(o=>o.status==='completed').count();
      const scheduleChanged=updated.startDate!==current.startDate||updated.frequency!==current.frequency||updated.anchorDay!==current.anchorDay;
      if(completed&&scheduleChanged)throw new Error('Cannot change recurrence dates when there are completed payments');
      if(scheduleChanged){const futureOverrides=await db.overrides.where('ruleId').equals(current.id).toArray();
        for(const o of futureOverrides)if(o.status!=='completed')await db.overrides.delete(o.id);}
      else {const selectedOverrideId=occurrenceId(current.id,selected.originalDate);
        const selectedOverride=await db.overrides.get(selectedOverrideId);
        if(selectedOverride?.status==='pending')await db.overrides.delete(selectedOverrideId);}
      await db.rules.put({...updated,id:current.id});return;
    }
    await db.rules.put({...current,endDate:previousDate(selected.originalDate)});
    await db.rules.add(updated);
    // Keep resolved historical occurrences of original rule. Move untouched future overrides to the new rule only when date anchor unchanged.
    const future=await db.overrides.where('ruleId').equals(current.id).filter(o=>o.occurrenceDate>=selected.originalDate).toArray();
    const compatible=updated.startDate===selected.originalDate&&updated.frequency===current.frequency&&updated.anchorDay===current.anchorDay;
    for(const o of future){
      if(o.status==='completed')continue; // Historical link remains attached to original rule, transaction is never removed.
      if(o.occurrenceDate===selected.originalDate){await db.overrides.delete(o.id);continue;} // The new series must control its first occurrence.
      if(compatible){const newOccurrenceId=occurrenceId(updated.id,o.occurrenceDate);await db.overrides.delete(o.id);await db.overrides.add({...o,id:newOccurrenceId,ruleId:updated.id});}
      else await db.overrides.delete(o.id); // Caller confirms overwriting future customizations.
    }
  });
}
export async function removeRule(id:string){
  await db.transaction('rw',db.rules,db.overrides,async()=>{
    const overrides=await db.overrides.where('ruleId').equals(id).toArray();
    if(overrides.some(x=>x.status==='completed'))throw new Error('Rule has completed payments; cancel remaining occurrences instead');
    await db.overrides.where('ruleId').equals(id).delete();await db.rules.delete(id);
  });
}
export async function removeReference(kind:'category'|'object',id:string,reassignTo?:string){
  await db.transaction('rw',db.categories,db.objects,db.transactions,db.rules,db.overrides,async()=>{
    const table=kind==='category'?db.categories:db.objects;
    if(reassignTo){
      const old=await table.get(id),replacement=await table.get(reassignTo);
      if(!replacement||kind==='category'&&old&&'kind' in old&&'kind' in replacement&&old.kind!==replacement.kind)throw new Error('Invalid replacement category or object');
    }
    const key=kind==='category'?'categoryId':'objectId';
    for(const item of await db.transactions.toArray())if(item[key]===id)await db.transactions.put({...item,[key]:reassignTo});
    for(const item of await db.rules.toArray())if(item[key]===id)await db.rules.put({...item,[key]:reassignTo});
    for(const item of await db.overrides.toArray())if(item[key]===id)await db.overrides.put({...item,[key]:reassignTo??null});
    await table.delete(id);
  });
}
export function anchorFromDate(date:string){return parts(date).d;}
export async function seedDemo(today:string){
  await db.transaction('rw',db.categories,db.objects,db.transactions,db.rules,db.debts,async()=>{
    if(await db.transactions.count()||await db.rules.count()||await db.debts.count())throw new Error('Existing entries. Demo data can only be added to an empty ledger.');
    const cfg=await db.settings.get('main');if(!cfg)throw new Error('Configure budget first');
    const mortgage=newId(),salary=newId(),food=newId(),home=newId();
    await db.categories.bulkAdd([{id:mortgage,name:'Mortgage / Ипотека',kind:'expense'}, {id:salary,name:'Salary / Зарплата',kind:'income'}, {id:food,name:'Groceries / Продукты',kind:'expense'}]);
    await db.objects.add({id:home,name:'Home / Дом'});
    const dt=new Date().toISOString();
    const {y,m}=parts(today);const nextMonthIndex=y*12+m;const nextY=Math.floor(nextMonthIndex/12),nextM=nextMonthIndex%12+1;
    const salaryDate=`${nextY}-${String(nextM).padStart(2,'0')}-05`;
    const mortgageDate=`${nextY}-${String(nextM).padStart(2,'0')}-25`;
    await db.transactions.add({id:newId(),kind:'expense',title:'Groceries / Продукты',amountMinor:3200000,date:cfg.startDate>today?cfg.startDate:today,categoryId:food,createdAt:dt});
    await db.rules.bulkAdd([
      {id:newId(),kind:'income',title:'Salary / Зарплата',amountMinor:50000000,startDate:salaryDate,frequency:'monthly',anchorDay:5,categoryId:salary,createdAt:dt},
      {id:newId(),kind:'expense',title:'Mortgage / Ипотека',amountMinor:15000000,startDate:mortgageDate,frequency:'monthly',anchorDay:25,categoryId:mortgage,objectId:home,createdAt:dt}
    ]);
  });
}

/** Each debt repayment is committed together with its cash expense. */
export async function saveDebt(item:Debt):Promise<void>{
  await db.transaction('rw',db.debts,db.debtPayments,db.transactions,db.settings,async()=>{
    const cfg=await db.settings.get('main');
    if(!cfg||!item.title.trim()||item.title.length>200||!Number.isSafeInteger(item.initialMinor)||item.initialMinor<=0||
       !isDate(item.openedDate)||item.openedDate>localToday()||(item.note!==undefined&&item.note.length>2000))throw new Error('Invalid debt');
    const payments=await db.debtPayments.where('debtId').equals(item.id).toArray();
    const paid=payments.reduce((sum,p)=>{const v=sum+p.amountMinor;if(!Number.isSafeInteger(v))throw new Error('Amount overflow');return v;},0);
    if(paid>item.initialMinor||payments.some(p=>p.date<item.openedDate))throw new Error('Debt is smaller than its repayments or starts after a payment');
    const previous=await db.debts.get(item.id);
    if(previous&&previous.title!==item.title){
      for(const p of payments){
        const tx=await db.transactions.get(p.transactionId);
        if(!tx||tx.debtPaymentId!==p.id)throw new Error('Broken repayment link');
        await db.transactions.put({...tx,title:item.title});
      }
    }
    await db.debts.put(item);
  });
}
export async function recordDebtPayment(debtId:string,amountMinor:number,date:string,note?:string):Promise<void>{
  await db.transaction('rw',db.debts,db.debtPayments,db.transactions,db.settings,async()=>{
    const debt=await db.debts.get(debtId),cfg=await db.settings.get('main');
    if(!debt||!cfg||!Number.isSafeInteger(amountMinor)||amountMinor<=0||!isDate(date)||date<debt.openedDate||date<cfg.startDate||date>localToday()||(note!==undefined&&note.length>2000))throw new Error('Invalid repayment');
    const existing=await db.debtPayments.where('debtId').equals(debtId).toArray();
    if(amountMinor>debtOutstanding(debt,existing))throw new Error('Payment exceeds remaining debt');
    const id=newId(),transactionId=newId(),createdAt=new Date().toISOString();
    await db.transactions.add({id:transactionId,kind:'expense',title:debt.title,amountMinor,date,note,createdAt,debtPaymentId:id});
    await db.debtPayments.add({id,debtId,amountMinor,date,note,transactionId,createdAt});
  });
}
export async function updateDebtPayment(item:DebtPayment):Promise<void>{
  await db.transaction('rw',db.debts,db.debtPayments,db.transactions,db.settings,async()=>{
    const existing=await db.debtPayments.get(item.id),debt=await db.debts.get(item.debtId),cfg=await db.settings.get('main');
    if(!existing||!debt||!cfg||existing.debtId!==item.debtId||item.transactionId!==existing.transactionId||
      !Number.isSafeInteger(item.amountMinor)||item.amountMinor<=0||!isDate(item.date)||item.date<debt.openedDate||item.date<cfg.startDate||item.date>localToday()||(item.note!==undefined&&item.note.length>2000))throw new Error('Invalid repayment');
    const rest=(await db.debtPayments.where('debtId').equals(item.debtId).toArray()).filter(p=>p.id!==item.id);
    if(item.amountMinor>debtOutstanding(debt,rest))throw new Error('Payment exceeds remaining debt');
    const transaction=await db.transactions.get(item.transactionId);
    if(!transaction||transaction.debtPaymentId!==item.id)throw new Error('Missing repayment transaction');
    await db.debtPayments.put(item);
    await db.transactions.put({...transaction,amountMinor:item.amountMinor,date:item.date,note:item.note,title:debt.title});
  });
}
export async function deleteDebtPayment(id:string):Promise<void>{
  await db.transaction('rw',db.debtPayments,db.transactions,async()=>{
    const item=await db.debtPayments.get(id);if(!item)return;
    const transaction=await db.transactions.get(item.transactionId);
    if(!transaction||transaction.debtPaymentId!==item.id)throw new Error('Missing repayment transaction');
    await db.transactions.delete(item.transactionId);
    await db.debtPayments.delete(id);
  });
}
export async function deleteDebt(id:string):Promise<void>{
  await db.transaction('rw',db.debts,db.debtPayments,async()=>{
    if(await db.debtPayments.where('debtId').equals(id).count())throw new Error('Delete the repayment history first');
    await db.debts.delete(id);
  });
}
