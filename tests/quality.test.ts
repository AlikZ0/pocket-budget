import 'fake-indexeddb/auto';
import {afterEach,beforeEach,describe,expect,it} from 'vitest';
import {BudgetDatabase,db,replaceDatabase,snapshotDatabase,saveRuleFrom,cancelOccurrence} from '../src/lib/db';
import {expandOccurrences} from '../src/lib/recurrence';
import {debtOutstanding,repaymentTimeline} from '../src/lib/debts';
import {projection} from '../src/lib/forecast';
import type {Snapshot} from '../src/lib/models';

const stamp='2026-01-01T00:00:00.000Z';
const original=():Snapshot=>({settings:[{id:'main',currency:'AMD',initialMinor:9600000,startDate:'2026-01-01',language:'hy',createdAt:stamp}],
  categories:[],objects:[],transactions:[],debts:[],debtPayments:[],
  rules:[{id:'series',kind:'expense',title:'Monthly rent',amountMinor:2000000,frequency:'monthly',startDate:'2026-01-31',anchorDay:31,createdAt:stamp}],overrides:[]});
const opened:BudgetDatabase[]=[];
// db.delete() disables Dexie's auto-open; reopen the shared instance before each test.
beforeEach(async()=>{await db.open();});
afterEach(async()=>{for(const instance of opened.splice(0)){instance.close();await instance.delete();}});

describe('quality regressions',()=>{
  it('keeps a cancelled one-time payment in history without including it in the forecast',async()=>{
    const data=original();data.rules[0].frequency='once';data.rules[0].startDate='2026-12-20';data.rules[0].anchorDay=20;
    await replaceDatabase(data,db);
    try{
      const selected=expandOccurrences(data.rules,[],'2026-12-31')[0];
      await cancelOccurrence(selected);
      const stored=await snapshotDatabase(db);
      expect(stored.rules).toHaveLength(1);
      expect(stored.overrides[0].status).toBe('cancelled');
      expect(expandOccurrences(stored.rules,stored.overrides,'2026-12-31')[0].status).toBe('cancelled');
      expect(projection(stored,'2026-10-30','2026-12-31').projected).toBe(9600000);
    }finally{db.close();await db.delete();}
  });
  it('rejects an edited series if a later calendar occurrence is already completed',async()=>{
    const data=original();data.overrides=[{id:'series@2026-03-31',ruleId:'series',occurrenceDate:'2026-03-31',status:'completed',transactionId:'paid'}];
    data.transactions=[{id:'paid',kind:'expense',title:'Early March rent',amountMinor:2000000,date:'2026-01-31',occurrenceId:'series@2026-03-31',createdAt:stamp}];
    await replaceDatabase(data,db);
    try{
      const selected=expandOccurrences(data.rules,data.overrides,'2026-04-30').find(o=>o.originalDate==='2026-02-28')!;
      await expect(saveRuleFrom(data.rules[0],selected,{...data.rules[0],id:'series-new',startDate:'2026-02-28',amountMinor:2500000})).rejects.toThrow(/later occurrence/);
      expect(await snapshotDatabase(db)).toEqual(data);
    }finally{db.close();await db.delete();}
  });
  it('calculates exact remaining debt after each payment, even if entered out of order',()=>{
    const debt={id:'d',title:'Loan',initialMinor:9600000,openedDate:'2026-01-01',createdAt:stamp};
    const pay=[{id:'later',debtId:'d',date:'2026-03-10',amountMinor:3000000,transactionId:'t2',createdAt:stamp},
      {id:'earlier',debtId:'d',date:'2026-02-10',amountMinor:1000000,transactionId:'t1',createdAt:stamp}];
    expect(repaymentTimeline(debt,pay).map(x=>x.remaining)).toEqual([8600000,5600000]);
    expect(debtOutstanding(debt,pay)).toBe(5600000);
  });
  it('rejects category type mismatches when changing a recurring series',async()=>{
    const data=original();data.categories=[{id:'income-only',kind:'income',name:'Salary'}];
    await replaceDatabase(data,db);
    try{
      const selected=expandOccurrences(data.rules,data.overrides,'2026-04-30').find(o=>o.originalDate==='2026-02-28')!;
      await expect(saveRuleFrom(data.rules[0],selected,{...data.rules[0],id:'new-series',startDate:'2026-02-28',categoryId:'income-only'})).rejects.toThrow(/Invalid category/);
      expect(await snapshotDatabase(db)).toEqual(data);
    }finally{db.close();await db.delete();}
  });
});
