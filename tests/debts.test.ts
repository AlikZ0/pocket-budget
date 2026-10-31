import 'fake-indexeddb/auto';
import {describe,it,expect,afterEach,vi} from 'vitest';
import {newId,type Debt,type Snapshot} from '../src/lib/models';
import {debtOutstanding,debtPaid} from '../src/lib/debts';
import {actualBalance} from '../src/lib/forecast';
import {BudgetDatabase,snapshotDatabase,replaceDatabase,db,recordDebtPayment,deleteDebtPayment} from '../src/lib/db';
import {createBackup,inspectBackup,importBackup,validateSnapshot} from '../src/lib/backup';
const opening='2026-01-01T00:00:00.000Z';
const debt:Debt={id:'debt-1',title:'Apartment',initialMinor:9600000,openedDate:'2026-01-01',createdAt:opening};
const base=():Snapshot=>({settings:[{id:'main',currency:'AMD',initialMinor:11000000,startDate:'2026-01-01',language:'hy',createdAt:opening}],categories:[],objects:[],transactions:[],rules:[],overrides:[],debts:[debt],debtPayments:[]});
const created:BudgetDatabase[]=[];
const fresh=()=>{const d=new BudgetDatabase(`debt-test-${newId()}`);created.push(d);return d;};
afterEach(async()=>{for(const d of created.splice(0)){d.close();await d.delete();}});
describe('debt ledger',()=>{
 it('reduces debt in installments and only debits cash for repayments',()=>{
  const s=base();expect(debtOutstanding(debt,[])).toBe(9600000);expect(actualBalance(s,'2026-02-01')).toBe(11000000);
  s.debtPayments=[{id:'p1',debtId:debt.id,amountMinor:3000000,date:'2026-01-10',transactionId:'t1',createdAt:opening},{id:'p2',debtId:debt.id,amountMinor:2000000,date:'2026-02-10',transactionId:'t2',createdAt:opening}];
  s.transactions=s.debtPayments.map(p=>({id:p.transactionId,debtPaymentId:p.id,kind:'expense',title:debt.title,amountMinor:p.amountMinor,date:p.date,createdAt:opening}));
  expect(debtPaid(debt,s.debtPayments)).toBe(5000000);expect(debtOutstanding(debt,s.debtPayments)).toBe(4600000);
  expect(actualBalance(s,'2026-01-31')).toBe(8000000);expect(actualBalance(s,'2026-02-28')).toBe(6000000);
  validateSnapshot(s);
 });
 it('does not allow overpayment or broken transaction links in backup',()=>{
  const s=base();s.debtPayments=[{id:'pay',debtId:'debt-1',amountMinor:9700000,date:'2026-01-10',transactionId:'tx',createdAt:opening}];
  s.transactions=[{id:'tx',kind:'expense',debtPaymentId:'pay',title:'Apartment',amountMinor:9700000,date:'2026-01-10',createdAt:opening}];
  expect(()=>validateSnapshot(s)).toThrow('Repayments exceed');
  s.debtPayments[0].amountMinor=3000000;
  expect(()=>validateSnapshot(s)).toThrow('Invalid debt repayment link');
 });
 it('retains debts, repayments and linked expenses through ZIP',async()=>{
  const s=base();s.debtPayments=[{id:'pay',debtId:'debt-1',amountMinor:3000000,date:'2026-01-10',transactionId:'tx',createdAt:opening}];
  s.transactions=[{id:'tx',kind:'expense',debtPaymentId:'pay',title:'Apartment',amountMinor:3000000,date:'2026-01-10',createdAt:opening}];
  const source=fresh(),target=fresh();await replaceDatabase(s,source);
  const archive=await createBackup(source);const inspected=await inspectBackup(archive);await importBackup(inspected,target);
  expect(await snapshotDatabase(target)).toEqual(s);
 });
 it('rolls back existing debts when import fails before a write',async()=>{
  const database=fresh();await replaceDatabase(base(),database);const before=await snapshotDatabase(database);
  const corrupt=base();corrupt.debtPayments=[{id:'bad',debtId:'missing',transactionId:'none',amountMinor:300,date:'2026-01-01',createdAt:opening}];
  await expect(importBackup({data:corrupt,manifest:{formatVersion:2,appVersion:'1.1.0',exportedAt:opening}},database)).rejects.toThrow();
  expect(await snapshotDatabase(database)).toEqual(before);
 });
 it('commits repayment and cash expense together and can undo both',async()=>{
  await replaceDatabase(base(),db);
  try{
   await recordDebtPayment('debt-1',3000000,'2026-04-01');
   let result=await snapshotDatabase(db);expect(result.debtPayments).toHaveLength(1);expect(result.transactions).toHaveLength(1);
   expect(actualBalance(result,'2026-05-01')).toBe(8000000);
   await expect(recordDebtPayment('debt-1',7000000,'2026-04-02')).rejects.toThrow('exceeds');
   await deleteDebtPayment(result.debtPayments[0].id);
   result=await snapshotDatabase(db);expect(result.debtPayments).toHaveLength(0);expect(result.transactions).toHaveLength(0);
  }finally{db.close();await db.delete();}
 });
});
describe('UUID generation on insecure HTTP',()=>{
 it('does not require crypto.randomUUID',()=>{
  const current=globalThis.crypto;
  const getRandomValues=(array:Uint8Array)=>{for(let i=0;i<array.length;i++)array[i]=i+1;return array;};
  vi.stubGlobal('crypto',{getRandomValues});
  try{expect(newId()).toMatch(/^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/);}finally{vi.stubGlobal('crypto',current);vi.unstubAllGlobals();}
 });
});
