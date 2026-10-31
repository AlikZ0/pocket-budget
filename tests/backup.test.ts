import 'fake-indexeddb/auto';
import {describe,it,expect,afterEach,beforeEach} from 'vitest';
import {db,BudgetDatabase,replaceDatabase,snapshotDatabase,markCompleted} from '../src/lib/db';
import {expandOccurrences} from '../src/lib/recurrence';
import {createBackup,inspectBackup,importBackup,validateSnapshot} from '../src/lib/backup';
import type {Snapshot} from '../src/lib/models';
import JSZip from 'jszip';
const sample=():Snapshot=>({settings:[{id:'main',currency:'AMD',initialMinor:12000,startDate:'2026-01-01',language:'en',createdAt:'2026-01-01T00:00:00.000Z'}],categories:[{id:'cat',name:'Rent',kind:'expense'}],objects:[{id:'obj',name:'House'}],
  transactions:[{id:'tx',kind:'expense',title:'Paid rent',amountMinor:1000,date:'2026-01-10',categoryId:'cat',objectId:'obj',occurrenceId:'rule@2026-01-10',createdAt:'2026-01-10T12:00:00.000Z'}],
  rules:[{id:'rule',kind:'expense',title:'Rent',amountMinor:1500,frequency:'monthly',startDate:'2026-01-10',anchorDay:10,categoryId:'cat',objectId:'obj',createdAt:'2026-01-01T00:00:00.000Z'}],
  overrides:[{id:'rule@2026-01-10',ruleId:'rule',occurrenceDate:'2026-01-10',date:'2026-01-10',status:'completed',transactionId:'tx'}],debts:[],debtPayments:[]});
const active:BudgetDatabase[]=[];
// db.delete() disables Dexie's auto-open; reopen the shared instance before each test.
beforeEach(async()=>{await db.open();});
async function fresh(){const d=new BudgetDatabase(`test-${crypto.randomUUID()}`);active.push(d);return d;}
afterEach(async()=>{for(const d of active.splice(0)){d.close();await d.delete();}});
describe('ZIP backup and recovery',()=>{
  it('round trips every table and linked payment',async()=>{
    const first=await fresh(),second=await fresh();
    await replaceDatabase(sample(),first);
    const zip=await createBackup(first);
    const parsed=await inspectBackup(zip);
    expect(parsed.manifest.formatVersion).toBe(2);
    await importBackup(parsed,second);
    expect(await snapshotDatabase(second)).toEqual(sample());
  });
  it('preserves saved appearance through export and import',async()=>{
    const original=sample();original.settings[0].theme='dark';
    const first=await fresh(),second=await fresh();
    await replaceDatabase(original,first);
    const backup=await createBackup(first);
    await importBackup(await inspectBackup(backup),second);
    expect((await snapshotDatabase(second)).settings[0].theme).toBe('dark');
  });
  it('rejects broken links and duplicate IDs',()=>{
    const broken=sample();broken.overrides[0].transactionId='missing';expect(()=>validateSnapshot(broken)).toThrow();
    const duplicate=sample();duplicate.transactions.push({...duplicate.transactions[0]});expect(()=>validateSnapshot(duplicate)).toThrow();
  });
  it('leaves current data untouched after a rejected import',async()=>{
    const database=await fresh();await replaceDatabase(sample(),database);
    const before=await snapshotDatabase(database);
    const corrupt=sample();corrupt.rules[0].amountMinor=-1;
    await expect(importBackup({data:corrupt,manifest:{appVersion:'1.0.0',formatVersion:1,exportedAt:new Date().toISOString()}},database)).rejects.toThrow();
    expect(await snapshotDatabase(database)).toEqual(before);
  });
  it('rolls back all eight tables after an IndexedDB write error',async()=>{
    const database=await fresh();await replaceDatabase(sample(),database);const before=await snapshotDatabase(database);
    const other=sample();other.transactions[0].id='new-tx';other.transactions[0].occurrenceId=undefined;other.overrides=[];
    const listener=()=>{throw new Error('forced test failure');};
    database.transactions.hook('creating',listener);
    await expect(replaceDatabase(other,database)).rejects.toThrow();
    database.transactions.hook('creating').unsubscribe(listener);
    expect(await snapshotDatabase(database)).toEqual(before);
  });
  it('prevents a scheduled payment from being completed twice',async()=>{
    await replaceDatabase(sample(),db);
    try{
      const s=await snapshotDatabase(db);
      const occurrence=expandOccurrences(s.rules,s.overrides,'2026-01-31')[0];
      await expect(markCompleted(occurrence,'2026-01-10',1000)).rejects.toThrow();
      expect((await snapshotDatabase(db)).transactions).toHaveLength(1);
    } finally {db.close();await db.delete();}
  });
});

describe('legacy backup compatibility',()=>{
  it('imports format v1 and initializes empty debt tables',async()=>{
    const old=sample() as unknown as Record<string,unknown>;
    delete old.debts;delete old.debtPayments;
    const zip=new JSZip();zip.file('manifest.json',JSON.stringify({formatVersion:1,appVersion:'1.0.0',exportedAt:'2026-05-01T10:00:00.000Z'}));
    zip.file('data.json',JSON.stringify(old));
    const blob=await zip.generateAsync({type:'blob'});
    const parsed=await inspectBackup(blob);
    expect(parsed.data.debts).toEqual([]);
    expect(parsed.data.debtPayments).toEqual([]);
    const target=await fresh();await importBackup(parsed,target);
    expect(await snapshotDatabase(target)).toEqual(sample());
  });
});

describe('validation and stale operation protection',()=>{
  it('rejects an overriding date that is not an occurrence of its series',()=>{
    const invalid=sample();invalid.overrides[0].occurrenceDate='2026-01-11';
    invalid.overrides[0].id='rule@2026-01-11';
    invalid.transactions[0].occurrenceId='rule@2026-01-11';
    expect(()=>validateSnapshot(invalid)).toThrow(/recurrence date/);
  });
  it('prevents completing a stale occurrence after its rule was removed',async()=>{
    const data=sample();data.transactions=[];data.overrides=[];
    await replaceDatabase(data,db);
    try{
      const source=expandOccurrences(data.rules,data.overrides,'2026-01-31')[0];
      await db.rules.delete('rule');
      await expect(markCompleted(source,'2026-01-10',1000)).rejects.toThrow(/schedule changed/);
      expect(await db.transactions.count()).toBe(0);
    }finally{db.close();await db.delete();}
  });
});
