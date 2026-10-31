import {describe,it,expect} from 'vitest';
import {occurrenceDates,expandOccurrences} from '../src/lib/recurrence';
import {fromParts} from '../src/lib/dates';
import type {PlanRule,Snapshot} from '../src/lib/models';
import {actualBalance,projection,totalsForMonth} from '../src/lib/forecast';
const rule=(date:string,day:number):PlanRule=>({id:'rule',kind:'expense',title:'Mortgage',amountMinor:15000,startDate:date,frequency:'monthly',anchorDay:day,createdAt:'2026-01-01T00:00:00Z'});
const base=():Snapshot=>({settings:[{id:'main',currency:'AMD',initialMinor:50000,startDate:'2026-01-01',language:'ru',createdAt:'2026-01-01T00:00:00Z'}],categories:[],objects:[],transactions:[],rules:[],overrides:[],debts:[],debtPayments:[]});
describe('calendar recurrence',()=>{
  it('returns to the 31st after shorter months',()=>{
    expect(occurrenceDates(rule('2026-01-31',31),'2026-05-31')).toEqual(['2026-01-31','2026-02-28','2026-03-31','2026-04-30','2026-05-31']);
  });
  it('handles leap years and 29/30',()=>{
    expect(occurrenceDates(rule('2024-01-29',29),'2024-03-30')).toEqual(['2024-01-29','2024-02-29','2024-03-29']);
    expect(occurrenceDates(rule('2026-01-30',30),'2026-03-30')).toEqual(['2026-01-30','2026-02-28','2026-03-30']);
    expect(occurrenceDates(rule('2026-01-29',29),'2026-03-29')).toEqual(['2026-01-29','2026-02-28','2026-03-29']);
  });
  it('dates stay timezone-free',()=>expect(fromParts(2026,12,15)).toBe('2026-12-15'));
});
describe('balance and daily forecasts',()=>{
  it('calculates actual income and expenses independently of plans',()=>{
    const s=base();s.transactions=[{id:'a',kind:'income',title:'Salary',amountMinor:20000,date:'2026-01-05',createdAt:'2026-01-05T00:00:00Z'},
    {id:'b',kind:'expense',title:'Bills',amountMinor:10000,date:'2026-01-10',createdAt:'2026-01-10T00:00:00Z'}];
    expect(actualBalance(s,'2026-01-11')).toBe(60000);
    expect(totalsForMonth(s,'2026-01-01','2026-01-11')).toEqual({income:20000,expense:10000});
  });
  it('does not double-charge a completed planned payment',()=>{
    const s=base();s.rules=[{...rule('2026-01-10',10),frequency:'once'}];
    s.transactions=[{id:'paid',kind:'expense',title:'Mortgage',amountMinor:12000,date:'2026-01-10',createdAt:'2026-01-10T00:00:00Z',occurrenceId:'rule@2026-01-10'}];
    s.overrides=[{id:'rule@2026-01-10',ruleId:'rule',occurrenceDate:'2026-01-10',status:'completed',transactionId:'paid'}];
    const p=projection(s,'2026-01-15','2026-01-31');
    expect(p.actual).toBe(38000);expect(p.projected).toBe(38000);
    expect(expandOccurrences(s.rules,s.overrides,'2026-01-31')[0].status).toBe('completed');
  });
  it('detects shortfall before a later salary even when month end is positive',()=>{
    const s=base();s.settings[0].initialMinor=5000;
    s.rules=[{...rule('2026-01-04',4),frequency:'once',amountMinor:15000},{...rule('2026-01-10',10),id:'salary',kind:'income',frequency:'once',amountMinor:25000}];
    const p=projection(s,'2026-01-02','2026-01-31');
    expect(p.projected).toBe(15000);expect(p.shortageDate).toBe('2026-01-04');expect(p.shortageMinor).toBe(10000);
  });
  it('treats overdue expenses as due today but excludes overdue income',()=>{
    const s=base();s.settings[0].initialMinor=20000;
    s.rules=[{...rule('2026-01-02',2),frequency:'once',amountMinor:3000},{...rule('2026-01-03',3),id:'salary',kind:'income',frequency:'once',amountMinor:9000}];
    const p=projection(s,'2026-01-07','2026-01-31');
    expect(p.projected).toBe(17000);expect(p.overdueIncome).toHaveLength(1);expect(p.overdueExpense).toHaveLength(1);
  });
  it('ignores cancelled occurrences',()=>{
    const s=base();s.rules=[{...rule('2026-01-10',10),frequency:'once'}];
    s.overrides=[{id:'rule@2026-01-10',ruleId:'rule',occurrenceDate:'2026-01-10',status:'cancelled'}];
    expect(projection(s,'2026-01-01','2026-01-31').projected).toBe(50000);
  });
});

describe('historical changes and moved occurrences',()=>{
  it('keeps a completed instance visible after the original series was truncated',()=>{
    const monthly=rule('2026-01-31',31);monthly.endDate='2026-02-27';
    const overrides=[{id:'rule@2026-03-31',ruleId:'rule',occurrenceDate:'2026-03-31',status:'completed' as const,transactionId:'tx'}];
    const result=expandOccurrences([monthly],overrides,'2026-12-31');
    expect(result.find(x=>x.id==='rule@2026-03-31')?.status).toBe('completed');
  });
  it('includes an occurrence moved into the requested month from later on',()=>{
    const monthly={...rule('2026-12-31',31),endDate:'2026-12-31'};
    const overrides=[{id:'rule@2026-12-31',ruleId:'rule',occurrenceDate:'2026-12-31',date:'2026-11-15',status:'pending' as const}];
    const result=expandOccurrences([monthly],overrides,'2026-11-30');
    expect(result.map(o=>o.date)).toEqual(['2026-11-15']);
  });
  it('leaves dates outside the time window out, including postponed rules',()=>{
    const monthly={...rule('2026-01-31',31),endDate:'2026-01-31'};
    const overrides=[{id:'rule@2026-01-31',ruleId:'rule',occurrenceDate:'2026-01-31',date:'2027-01-31',status:'pending' as const}];
    expect(expandOccurrences([monthly],overrides,'2026-12-31')).toHaveLength(0);
  });
});
