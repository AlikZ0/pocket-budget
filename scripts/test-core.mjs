/** Run dependency-free core smoke tests even when the npm registry is unavailable.
 * The full Dexie/ZIP/browser tests still run with npm test and npm run test:e2e. */
import {mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const tmp=mkdtempSync(join(tmpdir(),'pocket-budget-core-'));
try {
  const cmd=['src/lib/models.ts','src/lib/money.ts','src/lib/dates.ts','src/lib/recurrence.ts','src/lib/forecast.ts','src/lib/debts.ts','--module','commonjs','--moduleResolution','node','--target','es2022','--strict','--skipLibCheck','--outDir',tmp];
  const compile=spawnSync('tsc',cmd,{encoding:'utf8'});
  if(compile.status!==0){process.stderr.write(compile.stdout+compile.stderr);process.exit(1);}
  writeFileSync(join(tmp,'package.json'),'{"type":"commonjs"}');
  const require=createRequire(import.meta.url);
  const dates=require(join(tmp,'dates.js'));
  const r=require(join(tmp,'recurrence.js'));
  const f=require(join(tmp,'forecast.js'));
  const d=require(join(tmp,'debts.js'));
  const m=require(join(tmp,'money.js'));
  const rule=(startDate,anchorDay=31)=>({id:'monthly',kind:'expense',title:'Mortgage',amountMinor:20000,startDate,anchorDay,frequency:'monthly',createdAt:'2026-01-01T00:00:00Z'});
  const snap=()=>({settings:[{id:'main',currency:'AMD',initialMinor:50000,startDate:'2026-01-01',language:'hy',createdAt:'2026-01-01T00:00:00Z'}],categories:[],objects:[],transactions:[],rules:[],overrides:[],debts:[],debtPayments:[]});
  const cases=[];
  const test=(label,fn)=>{fn();cases.push(label);};
  test('31st day returns after February and April',()=>{
    assert.deepEqual(r.occurrenceDates(rule('2026-01-31'),'2026-05-31'),['2026-01-31','2026-02-28','2026-03-31','2026-04-30','2026-05-31']);
  });
  test('29th with leap years',()=>{
    assert.deepEqual(r.occurrenceDates(rule('2024-01-29',29),'2024-03-29'),['2024-01-29','2024-02-29','2024-03-29']);
    assert.equal(r.isScheduledDate(rule('2026-01-31'),'2026-02-28'),true);
    assert.equal(r.isScheduledDate(rule('2026-01-31'),'2026-02-27'),false);
  });
  test('long recurrence jumps to recent window without losing dates',()=>{
    const old={...rule('2000-01-31'),endDate:'2026-12-31'};
    assert.deepEqual(r.occurrenceDates(old,'2026-05-31','2026-02-01'),['2026-02-28','2026-03-31','2026-04-30','2026-05-31']);
  });
  test('date and amount exactness',()=>{
    assert.equal(dates.isDate('2026-02-29'),false);
    assert.equal(m.parseMoney('96000,25','AMD'),9600025);
    assert.equal(m.parseMoney('9007199254740991000','AMD'),null);
    assert.equal(m.moneyInput(9600025,'AMD'),'96000.25');
  });
  test('actual cash and upcoming plans are separate',()=>{
    const s=snap();s.rules=[{...rule('2026-01-10'),frequency:'once'}];
    assert.equal(f.actualBalance(s,'2026-01-10'),50000);
    assert.equal(f.projection(s,'2026-01-05','2026-01-31').projected,30000);
    s.transactions.push({id:'actual',kind:'expense',title:'Paid',amountMinor:15000,date:'2026-01-10',createdAt:'2026-01-10T10:00:00Z',occurrenceId:'monthly@2026-01-10'});
    s.overrides=[{id:'monthly@2026-01-10',ruleId:'monthly',occurrenceDate:'2026-01-10',status:'completed',transactionId:'actual'}];
    assert.equal(f.projection(s,'2026-01-11','2026-01-31').projected,35000);
  });
  test('daily forecast detects shortage before payday',()=>{
    const s=snap();s.settings[0].initialMinor=5000;
    s.rules=[{...rule('2026-01-04'),frequency:'once',amountMinor:20000},{...rule('2026-01-10'),id:'salary',kind:'income',frequency:'once',amountMinor:40000}];
    const p=f.projection(s,'2026-01-01','2026-01-31');
    assert.equal(p.shortageDate,'2026-01-04');assert.equal(p.shortageMinor,15000);assert.equal(p.projected,25000);
  });
  test('cancelled and overdue income never count',()=>{
    const s=snap();s.rules=[{...rule('2026-01-02'),frequency:'once',amountMinor:10000},{...rule('2026-01-03'),frequency:'once',id:'salary',kind:'income',amountMinor:20000}];
    s.overrides=[{id:'monthly@2026-01-02',ruleId:'monthly',occurrenceDate:'2026-01-02',status:'cancelled'}];
    assert.equal(f.projection(s,'2026-01-10','2026-01-31').projected,50000);
  });
  test('completed future occurrence survives splitting its former series',()=>{
    const s=snap();s.rules=[{...rule('2026-01-31'),endDate:'2026-02-27'}];
    s.overrides=[{id:'monthly@2026-03-31',ruleId:'monthly',occurrenceDate:'2026-03-31',status:'completed',transactionId:'done'}];
    assert.equal(r.expandOccurrences(s.rules,s.overrides,'2026-12-31').find(x=>x.id==='monthly@2026-03-31')?.status,'completed');
  });
  test('postponed payment is shown by effective date',()=>{
    const s=snap();s.rules=[{...rule('2026-12-31')}];
    s.overrides=[{id:'monthly@2026-12-31',ruleId:'monthly',occurrenceDate:'2026-12-31',date:'2026-11-15',status:'pending'}];
    const occ=r.expandOccurrences(s.rules,s.overrides,'2026-11-30');
    assert.equal(occ.length,1);assert.equal(occ[0].date,'2026-11-15');
  });
  test('debt repayments are liabilities plus real cash expenses',()=>{
    const s=snap();s.debts=[{id:'debt',title:'House',initialMinor:96000,openedDate:'2026-01-01',createdAt:'2026-01-01T00:00:00Z'}];
    s.debtPayments=[{id:'p',debtId:'debt',amountMinor:15000,date:'2026-01-10',transactionId:'tx',createdAt:'2026-01-10T10:00:00Z'}];
    s.transactions=[{id:'tx',kind:'expense',title:'House',amountMinor:15000,date:'2026-01-10',createdAt:'2026-01-10T10:00:00Z',debtPaymentId:'p'}];
    assert.equal(d.debtOutstanding(s.debts[0],s.debtPayments),81000);
    assert.equal(f.actualBalance(s,'2026-01-11'),35000);
  });
  test('repayment history shows the remaining balance after each payment',()=>{
    const debt={id:'d1',title:'House',initialMinor:96000,openedDate:'2026-01-01',createdAt:'2026-01-01T00:00:00Z'};
    const payments=[
      {id:'second',debtId:'d1',amountMinor:15000,date:'2026-02-10',createdAt:'2026-02-10T00:00:00Z',transactionId:'t2'},
      {id:'first',debtId:'d1',amountMinor:10000,date:'2026-01-10',createdAt:'2026-01-10T00:00:00Z',transactionId:'t1'}
    ];
    const timeline=d.repaymentTimeline(debt,payments);
    assert.deepEqual(timeline.map(x=>[x.payment.id,x.remaining]),[['first',86000],['second',71000]]);
    assert.equal(d.debtOutstanding(debt,payments),71000);
  });
  console.log(`PASS: ${cases.length} core checks`);
  for(const c of cases)console.log(`  ✓ ${c}`);
} finally {rmSync(tmp,{recursive:true,force:true});}
