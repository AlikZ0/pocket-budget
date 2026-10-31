import {useEffect,useMemo,useRef,useState,type ReactNode,type ChangeEvent,type FormEvent,type PointerEvent as ReactPointerEvent} from 'react';
import {useLiveQuery} from 'dexie-react-hooks';
import {LayoutDashboard,ArrowLeftRight,CalendarDays,Settings2,Plus,TrendingUp,TrendingDown,Download,Upload,ChevronRight,AlertTriangle,CheckCircle2,Trash2,Pencil,Wallet,Languages,Repeat,Sun,Moon,Monitor, X} from 'lucide-react';
import type {Snapshot,Language,Kind,Transaction,PlanRule,Occurrence,Category,BudgetObject,Currency,ThemePreference} from './lib/models';
import {newId} from './lib/models';
import {db,snapshotDatabase,setup,removeReference,deleteTransaction,cancelOccurrence,seedDemo} from './lib/db';
import {localToday,formatDate,monthEnd,fromParts,parts,isDate} from './lib/dates';
import {parseBalance,formatMoney,safeSum,moneyInput} from './lib/money';
import {projection,totalsForMonth} from './lib/forecast';
import {debtTotals} from './lib/debts';
import {useToday} from './lib/useToday';
import {expandOccurrences} from './lib/recurrence';
import {createBackup,downloadBlob,inspectBackup,importBackup,validateSnapshot,type PreparedImport} from './lib/backup';
import {translate as tr,compactTranslate as tc,type MessageKey} from './lib/i18n';
import {Empty,Field,Sheet} from './components/Fields';
import {OccurrenceActions,PlanEditor,TransactionEditor} from './components/Editors';
import {DebtsView} from './components/Debts';
import {applyTheme} from './lib/theme';
import './styles.css';

type Tab='overview'|'operations'|'plan'|'settings';
type Editor={type:'transaction';item?:Transaction;kind?:Kind}|{type:'plan';rule?:PlanRule;selected?:Occurrence;kind?:Kind}|{type:'occurrence';item:Occurrence}|{type:'add-choice'};
function formatError(e:unknown){return e instanceof Error?e.message:String(e);}
const CURRENCIES:Currency[]=['AMD','RUB','USD','EUR'];
const YEAR_NOW=Number(localToday().slice(0,4));

function LineChart({values,lang,currency}: {values:{date:string;balance:number}[];lang:Language;currency:Currency}){
  const [selected,setSelected]=useState<number|null>(null);
  if(values.length===0)return <div className="chart-empty">—</div>;
  const width=640,height=178,pad=18;
  const low=Math.min(...values.map(x=>x.balance)),high=Math.max(...values.map(x=>x.balance));
  const spread=Math.max(1,high-low);
  const index=selected===null?values.length-1:Math.max(0,Math.min(selected,values.length-1));
  const x=(i:number)=>pad+i*(width-2*pad)/Math.max(1,values.length-1);
  const y=(v:number)=>height-pad-(v-low)/spread*(height-pad*2);
  const point=(v:{balance:number},i:number)=>`${x(i)},${y(v.balance)}`;
  const path=values.map(point).join(' '),first=point(values[0],0).split(','),last=point(values[values.length-1],values.length-1).split(',');
  const area=`${path} ${last[0]},${height} ${first[0]},${height}`;
  const zeroY=y(0);
  const onPoint=(event:ReactPointerEvent<SVGSVGElement>)=>{
    const rect=event.currentTarget.getBoundingClientRect();
    if(rect.width===0)return;
    const normalized=(event.clientX-rect.left)/rect.width;
    const approximate=(normalized*width-pad)/(width-2*pad)*(values.length-1);
    setSelected(Math.max(0,Math.min(values.length-1,Math.round(approximate))));
  };
  return <div className="chart-wrap"><div className="chart-selection" aria-live="off"><span>{formatDate(values[index].date,lang)}</span><strong className={values[index].balance<0?'negative':''}>{formatMoney(values[index].balance,currency,lang)}</strong></div>
    <svg role="img" aria-label={tr(lang,'cashflow')} onPointerDown={onPoint} onPointerMove={e=>{if(e.pointerType==='mouse'||e.buttons>0)onPoint(e);}} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
      <defs><linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1"><stop stopColor="var(--chart-fill)" stopOpacity=".3"/><stop offset="1" stopColor="var(--chart-fill)" stopOpacity="0"/></linearGradient></defs>
      {[.2,.5,.8].map(r=><line key={r} x1="0" x2={width} y1={height*r} y2={height*r} stroke="var(--chart-grid)" strokeDasharray="5 5"/>)}
      {low<0&&high>0&&<line x1="0" x2={width} y1={zeroY} y2={zeroY} stroke="var(--chart-warning)" strokeDasharray="6 5"/>}
      <polygon points={area} fill="url(#chartFill)"/><polyline points={path} fill="none" stroke="var(--chart-line)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke"/>
      <line x1={x(index)} x2={x(index)} y1={pad} y2={height-pad} stroke="var(--chart-guide)" strokeDasharray="4 4" strokeOpacity=".7" strokeWidth="1.5"/>
      <circle cx={x(index)} cy={y(values[index].balance)} r="5.5" fill={values[index].balance<0?'var(--chart-warning)':'var(--chart-marker)'} stroke="var(--chart-dot-ring)" strokeWidth="2"/>
    </svg>
    <input className="chart-range" type="range" aria-label={tr(lang,'chartPosition')} aria-valuetext={`${formatDate(values[index].date,lang)} · ${formatMoney(values[index].balance,currency,lang)}`} min={0} max={values.length-1} step={1} value={index} onChange={e=>setSelected(Number(e.target.value))}/>
    <div className="chart-foot"><span>{formatDate(values[0].date,lang)}</span><small>{tr(lang,'touchChart')}</small><span>{formatDate(values[values.length-1].date,lang)}</span></div>
  </div>;
}
function Pill({kind,children}:{kind:'income'|'expense'|'danger'|'neutral';children:ReactNode}){return <span className={`pill pill-${kind}`}>{children}</span>;}
function Money({amount,currency,language,kind}: {amount:number;currency:Currency;language:Language;kind?:Kind}){return <strong className={`money ${kind??''}`}>{kind==='income'?'+':kind==='expense'?'−':''}{formatMoney(Math.abs(amount),currency,language)}</strong>;}
function Notice({message,onClose,lang}: {message:string;onClose:()=>void;lang:Language}){return <div className="toast" role="status"><span>{message}</span><button onClick={onClose} aria-label={tr(lang,'close')}><X size={17}/></button></div>;}

function SetupScreen({lang,setLang,onDone,onError}:{lang:Language;setLang:(l:Language)=>void;onDone:(message?:string)=>void;onError:(e:unknown)=>void}){
  const t=(k:MessageKey)=>tr(lang,k);
  const [currency,setCurrency]=useState<Currency>('AMD'),[startDate,setStartDate]=useState(localToday()),[balance,setBalance]=useState('0.00'),[saving,setSaving]=useState(false);
  const [errors,setErrors]=useState<Record<string,string>>({});const lock=useRef(false);
  const [importFile,setImportFile]=useState<PreparedImport|null>(null),[importing,setImporting]=useState(false);
  const fileInput=useRef<HTMLInputElement>(null);
  const pickBackup=async(e:ChangeEvent<HTMLInputElement>)=>{
    const file=e.target.files?.[0];e.target.value='';if(!file)return;
    try{setImportFile(await inspectBackup(file));}catch(err){onError(`${t('failedImport')}: ${formatError(err)}`);}
  };
  const restoreBackup=async()=>{
    if(!importFile||lock.current)return;
    if(!window.confirm(t('confirmReplace')))return;
    lock.current=true;setImporting(true);
    try{await importBackup(importFile);setImportFile(null);onDone(t('imported'));}catch(e){onError(e);lock.current=false;setImporting(false);}
  };
  const submit=async(e:FormEvent)=>{
    e.preventDefault();if(lock.current)return;
    const minor=parseBalance(balance,currency),errs:Record<string,string>={};
    if(minor===null)errs.balance=t('invalidBalance');if(!isDate(startDate)||startDate>localToday())errs.date=t('invalidDate');
    setErrors(errs);if(Object.keys(errs).length||minor===null)return;
    lock.current=true;setSaving(true);
    try{await setup(currency,minor,startDate,lang);onDone();}catch(err){onError(err);lock.current=false;setSaving(false);}
  };
  return <main className="welcome-screen"><div className="welcome-head"><span className="brand-mark"><Wallet size={26}/></span><span>Pocket Budget</span><select className="lang-small" aria-label={t('language')} value={lang} onChange={e=>setLang(e.target.value as Language)}><option value="ru">Русский</option><option value="en">English</option><option value="hy">Հայերեն</option></select></div><div className="welcome-content">
    <div className="eyebrow">Pocket Budget</div><h1>{t('welcome')}</h1><p className="welcome-sub">{t('welcomeText')}</p>
    <form className="setup-card editor-form" onSubmit={submit}>
      <Field label={t('currency')}><div className="currency-grid">{CURRENCIES.map(c=><button key={c} type="button" className={currency===c?'active':''} onClick={()=>setCurrency(c)}>{c}</button>)}</div></Field>
      <Field label={t('initial')} error={errors.balance}><input inputMode="decimal" value={balance} onChange={e=>setBalance(e.target.value)} /></Field>
      <Field label={t('startDate')} error={errors.date}><input type="date" value={startDate} max={localToday()} onChange={e=>setStartDate(e.target.value)}/></Field>
      <div className="hint">{t('zeroBalance')}</div><button className="primary full" type="submit" disabled={saving}>{saving?'…':t('create')}</button>
    </form><div className="onboarding-restore"><p>{t('restoreInstead')}</p><button className="secondary full" type="button" onClick={()=>fileInput.current?.click()} disabled={saving||importing}><Upload size={18}/>{t('restoreBackup')}</button><input className="file-input" ref={fileInput} type="file" accept=".zip,application/zip" onChange={e=>void pickBackup(e)}/></div>
    <p className="privacy-foot">🔒 {t('backupInfo')}</p>
  </div>
  {importFile&&<Sheet title={t('preview')} onClose={()=>{if(!importing)setImportFile(null);}}><div className="editor-form"><div className="import-preview"><div>{t('exportedAt')}<strong>{new Date(importFile.manifest.exportedAt).toLocaleString(lang==='ru'?'ru-RU':lang==='hy'?'hy-AM':'en-GB')}</strong></div><div>{t('currency')}<strong>{importFile.data.settings[0].currency}</strong></div><div>{t('opCount')}<strong>{importFile.data.transactions.length}</strong></div><div>{t('ruleCount')}<strong>{importFile.data.rules.length}</strong></div><div>{t('debtItemCount')}<strong>{importFile.data.debts.length}</strong></div></div><p className="warning-message"><AlertTriangle size={18}/>{t('importWarning')}</p><button type="button" className="primary full" disabled={importing} onClick={()=>void restoreBackup()}>{importing?'…':t('restoreBackup')}</button><button type="button" className="ghost full" disabled={importing} onClick={()=>setImportFile(null)}>{t('cancel')}</button></div></Sheet>}
  </main>;
}

function SpendingBreakdown({data,lang,month}:{data:Snapshot;lang:Language;month:string}){
  const t=(k:MessageKey)=>tr(lang,k),currency=data.settings[0].currency,today=localToday();
  const [showAll,setShowAll]=useState(false);
  const expenses=data.transactions.filter(x=>x.kind==='expense'&&x.date.startsWith(month)&&x.date<=today);
  const byCategory=new Map<string,number>();
  const names=new Map(data.categories.map(c=>[c.id,c.name]));
  // Aggregate by ID, not display label: two categories can legitimately share a name.
  for(const item of expenses){
    const key=item.categoryId??'';
    byCategory.set(key,safeSum(byCategory.get(key)??0,item.amountMinor));
  }
  const rows=Array.from(byCategory.entries()).map(([id,amount])=>({id,name:names.get(id)??t('uncategorized'),amount})).sort((a,b)=>b.amount-a.amount);
  const max=rows[0]?.amount??1;
  return <section className="panel spending-panel"><div className="panel-head"><h2>{t('expenseBreakdown')}</h2><small>{month}</small></div>
    {rows.length?rows.slice(0,showAll?rows.length:6).map(({id,name,amount})=><div className="spending-row" key={id}>
      <div className="spending-label"><span>{name}</span><strong>{formatMoney(amount,currency,lang)}</strong></div>
      <div className="spending-track"><div style={{width:`${amount/max*100}%`}}/></div>
    </div>):<p className="small-note">{t('expensesEmpty')}</p>}
    {rows.length>6&&!showAll&&<button className="small-add spending-more" onClick={()=>setShowAll(true)}>{t('showMore')} (+{rows.length-6})</button>}
  </section>;
}
function Overview({data,lang,month,year,setMonth,setYear,openPlan,openDebts}: {data:Snapshot;lang:Language;month:string;year:number;setMonth:(s:string)=>void;setYear:(y:number)=>void;openPlan:()=>void;openDebts:()=>void}){
  const t=(k:MessageKey)=>tr(lang,k),cfg=data.settings[0],today=localToday();
  const firstYear=parts(cfg.startDate).y;
  const lastYear=Math.min(2200,Math.max(year,parts(today).y+20));
  const yearChoices=Array.from({length:lastYear-firstYear+1},(_,i)=>firstYear+i);
  const monthFinish=monthEnd(`${month}-01`),yearFinish=`${year}-12-31`;
  const monthResult=useMemo(()=>projection(data,today,monthFinish),[data,today,monthFinish]);
  const yearResult=useMemo(()=>projection(data,today,yearFinish),[data,today,yearFinish]);
  const totals=totalsForMonth(data,`${month}-01`,today);
  const soon=yearResult.events.filter(x=>x.status==='pending'&&(x.date>=today||x.kind==='expense')).sort((a,b)=>a.date.localeCompare(b.date)).slice(0,5);
  return <div className="page-stack">
    <div className="page-intro"><div><div className="eyebrow">{t('wallet')}</div><h1>{t('overview')}</h1></div><div className="date-selectors"><label aria-label={t('selectedMonth')}><input type="month" min={cfg.startDate.slice(0,7)} max="2200-12" value={month} onChange={e=>setMonth(e.target.value)} /></label><label aria-label={t('selectedYear')}><select value={year} onChange={e=>setYear(Number(e.target.value))}>{yearChoices.map(y=><option value={y} key={y}>{y}</option>)}</select></label></div></div>
    <div className="hero-card"><div className="hero-kicker"><Wallet size={17}/>{t('balance')} <span className="hero-date">{formatDate(today,lang)}</span></div><div className="hero-number">{formatMoney(monthResult.actual,cfg.currency,lang)}</div><div className="hero-bottom"><span>● {navigator.onLine?t('onlineState'):t('offlineState')}</span><span>{cfg.currency}</span></div></div>
    <div className="stats-grid"><div className="stat"><span className="stat-label"><TrendingUp size={16}/>{t('monthIncome')}</span><Money kind="income" amount={totals.income} currency={cfg.currency} language={lang}/></div><div className="stat"><span className="stat-label"><TrendingDown size={16}/>{t('monthExpense')}</span><Money kind="expense" amount={totals.expense} currency={cfg.currency} language={lang}/></div></div>
    <div className="monthly-net"><span>{t('monthNet')}</span><strong className={safeSum(totals.income,-totals.expense)<0?'negative':''}>{formatMoney(safeSum(totals.income,-totals.expense),cfg.currency,lang)}</strong></div>
    {data.debts.length>0&&<button className="debt-overview-link" onClick={openDebts}><span>{t('debtTotalRemaining')}<strong>{formatMoney(debtTotals(data).remaining,cfg.currency,lang)}</strong></span><span>{t('seeAll')} <ChevronRight size={17}/></span></button>}
    <div className="forecast-grid"><div className="forecast-tile"><span>{t('forecastMonth')}</span><strong>{formatMoney(monthResult.projected,cfg.currency,lang)}</strong><small>{formatDate(monthFinish,lang)}</small></div><div className="forecast-tile"><span>{t('forecastYear')}</span><strong>{formatMoney(yearResult.projected,cfg.currency,lang)}</strong><small>{year}</small></div></div>
    <div className={`risk-card ${yearResult.shortageDate?'has-risk':''}`}>
      <div className="risk-icon">{yearResult.shortageDate?<AlertTriangle size={22}/>:<CheckCircle2 size={22}/>}</div>
      <div className="risk-content"><strong>{yearResult.shortageDate?t('shortfallText'):t('noShort')}</strong>{yearResult.shortageDate&&<div>{formatDate(yearResult.shortageDate,lang)} · {t('notEnough')} {formatMoney(yearResult.shortageMinor??0,cfg.currency,lang)}</div>}<div>{t('minimum')}: {formatMoney(yearResult.minBalance,cfg.currency,lang)} · {formatDate(yearResult.minDate,lang)}</div></div>
    </div>
    <section className="panel"><div className="panel-head"><div><h2>{t('cashflow')}</h2><p>{t('yearEnding')} · {year}</p></div></div><LineChart values={yearResult.points.filter((_,i)=>i%Math.max(1,Math.ceil(yearResult.points.length/200))===0||i===yearResult.points.length-1)} lang={lang} currency={cfg.currency}/></section>
    <div className="stats-grid"><div className="stat border-left-green"><span className="stat-label">{t('incoming')}</span><Money amount={yearResult.upcomingIncome} kind="income" currency={cfg.currency} language={lang}/></div><div className="stat border-left-orange"><span className="stat-label">{t('outgoing')}</span><Money amount={yearResult.upcomingExpense} kind="expense" currency={cfg.currency} language={lang}/></div></div>
    <SpendingBreakdown data={data} lang={lang} month={month}/>
    {yearResult.overdueIncome.length>0&&<p className="inline-alert">{t('overdueIncome')} ({yearResult.overdueIncome.length})</p>}
    {yearResult.overdueExpense.length>0&&<p className="inline-alert">{t('overdueExpense')} ({yearResult.overdueExpense.length})</p>}
    <section className="panel"><div className="panel-head"><h2>{t('next')}</h2><button className="text-button" onClick={openPlan}>{t('seeAll')} <ChevronRight size={16}/></button></div>{soon.length?soon.map(o=><div key={o.id} className="mini-row"><div className="mini-date">{o.date.slice(8,10)}<small>{o.date.slice(5,7)}</small></div><div className="mini-details"><strong>{o.title}</strong><small>{formatDate(o.date,lang)} {o.date<today?`· ${t('overdue')}`:''}</small></div><Money amount={o.amountMinor} currency={cfg.currency} language={lang} kind={o.kind}/></div>):<Empty title={t('nothing')} description={t('emptyPlan')}/>}</section>
  </div>;
}

function FilterBar({lang,search,setSearch,kind,setKind,cat,setCat,obj,setObj,month,setMonth,categories,objects}: {lang:Language;search:string;setSearch:(s:string)=>void;kind:string;setKind:(s:string)=>void;cat:string;setCat:(s:string)=>void;obj:string;setObj:(s:string)=>void;month:string;setMonth:(s:string)=>void;categories:Category[];objects:BudgetObject[]}){
  const t=(k:MessageKey)=>tr(lang,k);
  const reset=()=>{setSearch('');setKind('');setCat('');setObj('');setMonth('');};
  const isFiltered=Boolean(search||kind||cat||obj||month);
  return <section className="filter-bar" aria-label={t('filter')}>
    <input className="filter-search" type="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder={t('search')} aria-label={t('search')}/>
    <div className="filter-heading"><span>{t('filter')}</span><button type="button" className="clear-filter" disabled={!isFiltered} onClick={reset}>{t('resetFilters')}</button></div>
    <div className="filter-grid">
      <label className="filter-field"><span className="filter-label">{t('filterType')}</span><select value={kind} onChange={e=>{setKind(e.target.value);setCat('');}}><option value="">{t('all')}</option><option value="income">{t('income')}</option><option value="expense">{t('expense')}</option></select></label>
      <label className="filter-field"><span className="filter-label">{t('category')}</span><select value={cat} onChange={e=>setCat(e.target.value)}><option value="">{t('all')}</option>{categories.filter(c=>!kind||c.kind===kind).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
      <label className="filter-field"><span className="filter-label">{t('object')}</span><select value={obj} onChange={e=>setObj(e.target.value)}><option value="">{t('all')}</option>{objects.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}</select></label>
      <label className="filter-field"><span className="filter-label">{t('selectedMonth')}</span><input type="month" value={month} onChange={e=>setMonth(e.target.value)}/></label>
    </div>
  </section>;
}
function TransactionList({data,lang,onEdit,onRemove}: {data:Snapshot;lang:Language;onEdit:(x:Transaction)=>void;onRemove:(x:Transaction)=>void}){
  const t=(k:MessageKey)=>tr(lang,k),[search,setSearch]=useState(''),[kind,setKind]=useState(''),[cat,setCat]=useState(''),[obj,setObj]=useState(''),[month,setMonth]=useState('');
  const rows=data.transactions.filter(x=>(!search||x.title.toLowerCase().includes(search.toLowerCase()))&&(!kind||x.kind===kind)&&(!cat||x.categoryId===cat)&&(!obj||x.objectId===obj)&&(!month||x.date.startsWith(month))).sort((a,b)=>b.date.localeCompare(a.date)||b.createdAt.localeCompare(a.createdAt));
  return <div className="page-stack"><div className="page-intro"><div><div className="eyebrow">{t('history')}</div><h1>{t('operations')}</h1></div><span className="count-chip">{rows.length}</span></div>
    <FilterBar lang={lang} search={search} setSearch={setSearch} kind={kind} setKind={setKind} cat={cat} setCat={setCat} obj={obj} setObj={setObj} month={month} setMonth={setMonth} categories={data.categories} objects={data.objects}/>
    {rows.length?<div className="record-list">{rows.map(x=><div key={x.id} className="record"><div className={`record-icon ${x.kind}`}><span>{x.kind==='income'?'↙':'↗'}</span></div><div className="record-detail"><strong>{x.title}</strong><small>{formatDate(x.date,lang)}{x.categoryId?` · ${data.categories.find(c=>c.id===x.categoryId)?.name??''}`:''}{x.objectId?` · ${data.objects.find(o=>o.id===x.objectId)?.name??''}`:''}</small>{x.note&&<small className="record-note">{x.note}</small>}{x.debtPaymentId&&<small className="record-note">{t('repayDebt')}</small>}</div><div className="record-right"><Money amount={x.amountMinor} currency={data.settings[0].currency} language={lang} kind={x.kind}/>{!x.debtPaymentId&&<div className="row-actions"><button aria-label={t('edit')} onClick={()=>onEdit(x)}><Pencil size={15}/></button><button aria-label={t('delete')} onClick={()=>onRemove(x)}><Trash2 size={15}/></button></div>}</div></div>)}</div>:<Empty title={t('nothing')} description={t('emptyOps')}/>}
  </div>;
}
function PlanList({data,lang,onEdit,onAction,onDelete}: {data:Snapshot;lang:Language;onEdit:(o:Occurrence)=>void;onAction:(o:Occurrence)=>void;onDelete:(o:Occurrence)=>void}){
  const t=(k:MessageKey)=>tr(lang,k),[search,setSearch]=useState(''),[kind,setKind]=useState(''),[cat,setCat]=useState(''),[obj,setObj]=useState(''),[month,setMonth]=useState(''),[status,setStatus]=useState<'pending'|'completed'|'cancelled'|'all'>('pending'),[limit,setLimit]=useState(40);
  const today=localToday();
  const horizon=fromParts(Math.min(2200,parts(today).y+2),12,31);
  const items=useMemo(()=>expandOccurrences(data.rules,data.overrides,horizon,data.settings[0].startDate),[data,horizon]);
  const rows=items.filter(x=>(status==='all'||status===x.status)&&(!search||(x.title+' '+(x.note??'')).toLocaleLowerCase().includes(search.toLocaleLowerCase()))&&(!kind||x.kind===kind)&&(!cat||x.categoryId===cat)&&(!obj||x.objectId===obj)&&(!month||x.date.startsWith(month))).sort((a,b)=>status==='completed'?b.date.localeCompare(a.date):a.date.localeCompare(b.date));
  const visibleRows=rows.slice(0,limit);
  return <div className="page-stack"><div className="page-intro"><div><div className="eyebrow">{t('futurePlans')}</div><h1>{t('plan')}</h1></div><span className="count-chip">{rows.length}</span></div>
    <p className="page-hint">{t('planHint')}</p><div className="seg-tabs">{(['pending','completed','cancelled','all'] as const).map(k=>{const label=k==='pending'?'planned':k==='completed'?'done':k==='cancelled'?'cancelled':'all';return <button className={status===k?'selected':''} key={k} aria-label={t(label)} title={t(label)} onClick={()=>setStatus(k)}>{tc(lang,label)}</button>;})}</div>
    <FilterBar lang={lang} search={search} setSearch={setSearch} kind={kind} setKind={setKind} cat={cat} setCat={setCat} obj={obj} setObj={setObj} month={month} setMonth={setMonth} categories={data.categories} objects={data.objects}/>
    {rows.length?<div className="record-list">{visibleRows.map(x=><div className={`record plan-record ${x.status==='completed'?'muted':''}`} key={x.id}><div className={`record-icon ${x.kind}`}><Repeat size={18}/></div><div className="record-detail"><strong>{x.title}</strong><small>{formatDate(x.date,lang)} · {t(x.frequency)}{x.categoryId?` · ${data.categories.find(c=>c.id===x.categoryId)?.name??''}`:''}</small><div className="record-tags">{x.status==='pending'&&x.date<today?<Pill kind="danger">{t('overdue')}</Pill>:<Pill kind="neutral">{x.status==='pending'?t('planned'):x.status==='completed'?t('done'):t('cancelled')}</Pill>}</div></div><div className="record-right"><Money amount={x.amountMinor} kind={x.kind} currency={data.settings[0].currency} language={lang}/>{x.status==='pending'&&<div className="row-actions"><button onClick={()=>onAction(x)} aria-label={t('more')}><CheckCircle2 size={17}/></button><button onClick={()=>onEdit(x)} aria-label={t('edit')}><Pencil size={15}/></button><button onClick={()=>onDelete(x)} aria-label={t('cancelled')}><X size={17}/></button></div>}</div></div>)}</div>:<Empty title={t('nothing')} description={t('emptyPlan')}/>}
    {rows.length>limit&&<button className="secondary full load-more" onClick={()=>setLimit(x=>x+40)}>{t('showMore')} · {t('listedCount')} {visibleRows.length}/{rows.length}</button>}
    <p className="small-note">{t('completedInfo')}</p>
  </div>;
}
function ReferenceSettings({data,lang,onSaved,onError}: {data:Snapshot;lang:Language;onSaved:(message?:string)=>void;onError:(err:unknown)=>void}){
  const t=(k:MessageKey)=>tr(lang,k);
  const [editor,setEditor]=useState<{kind:'category'|'object';item?:Category|BudgetObject}|null>(null);
  const [name,setName]=useState(''),[categoryKind,setCategoryKind]=useState<Kind>('expense'),[saving,setSaving]=useState(false);
  const [removing,setRemoving]=useState<{kind:'category'|'object';item:Category|BudgetObject}|null>(null);
  const [replacement,setReplacement]=useState(''),[error,setError]=useState('');const lock=useRef(false);
  const begin=(kind:'category'|'object',item?:Category|BudgetObject)=>{setEditor({kind,item});setName(item?.name??'');setCategoryKind(item&&'kind' in item?item.kind:'expense');setError('');};
  const save=async(e:FormEvent)=>{
    e.preventDefault();if(lock.current)return;if(!name.trim()){setError(t('invalidRequired'));return;}
    if(!editor)return;lock.current=true;setSaving(true);
    try{if(editor.kind==='category')await db.categories.put({id:editor.item?.id??newId(),name:name.trim(),kind:editor.item&&'kind' in editor.item?editor.item.kind:categoryKind});
    else await db.objects.put({id:editor.item?.id??newId(),name:name.trim()});
    setEditor(null);onSaved();}catch(e){onError(e);}finally{lock.current=false;setSaving(false);}
  };
  const remove=async()=>{if(!removing||lock.current)return;lock.current=true;setSaving(true);
    try{await removeReference(removing.kind,removing.item.id,replacement||undefined);setRemoving(null);onSaved(t('deleted'));}catch(e){onError(e);}finally{lock.current=false;setSaving(false);}
  };
  const referenceRow=(item:Category|BudgetObject,kind:'category'|'object')=><div className="reference-row" key={item.id}><span>{item.name}{'kind' in item&&<small> · {t(item.kind)}</small>}</span><div className="row-actions"><button aria-label={t('edit')} onClick={()=>begin(kind,item)}><Pencil size={16}/></button><button aria-label={t('delete')} onClick={()=>{setRemoving({kind,item});setReplacement('');}}><Trash2 size={16}/></button></div></div>;
  const alternatives=removing?removing.kind==='category'?data.categories.filter(x=>x.id!==removing.item.id&&'kind' in removing.item&&x.kind===removing.item.kind):data.objects.filter(x=>x.id!==removing.item.id):[];
  return <><section className="panel settings-panel"><div className="panel-head"><h2>{t('categories')}</h2><button className="small-add" onClick={()=>begin('category')}><Plus size={17}/>{t('add')}</button></div>{data.categories.length?data.categories.map(c=>referenceRow(c,'category')):<p className="muted-text">{t('nothing')}</p>}</section>
    <section className="panel settings-panel"><div className="panel-head"><h2>{t('objects')}</h2><button className="small-add" onClick={()=>begin('object')}><Plus size={17}/>{t('add')}</button></div>{data.objects.length?data.objects.map(o=>referenceRow(o,'object')):<p className="muted-text">{t('nothing')}</p>}</section>
    {editor&&<Sheet title={editor.item?t('edit'):editor.kind==='category'?t('addCategory'):t('addObject')} onClose={()=>{if(!saving)setEditor(null);}}><form className="editor-form" onSubmit={save}><Field label={t('name')} error={error}><input autoFocus maxLength={200} value={name} onChange={e=>setName(e.target.value)}/></Field>{editor.kind==='category'&&!editor.item&&<Field label={t('allTypes')}><select value={categoryKind} onChange={e=>setCategoryKind(e.target.value as Kind)}><option value="expense">{t('expense')}</option><option value="income">{t('income')}</option></select></Field>}<button className="primary full" type="submit" disabled={saving}>{t('save')}</button></form></Sheet>}
    {removing&&<Sheet title={removing.kind==='category'?t('removeCategory'):t('removeObject')} onClose={()=>{if(!saving)setRemoving(null);}}><div className="editor-form"><p>{t('transferred')}: <strong>{removing.item.name}</strong></p><Field label={t('replaceWith')}><select value={replacement} onChange={e=>setReplacement(e.target.value)}><option value="">{t('detach')}</option>{alternatives.map(x=><option value={x.id} key={x.id}>{x.name}</option>)}</select></Field><button className="danger-button full" disabled={saving} onClick={()=>void remove()}>{t('yes')}</button><button className="ghost full" onClick={()=>setRemoving(null)}>{t('cancel')}</button></div></Sheet>}
  </>;
}
function SettingsView({data,lang,onSaved,onError}: {data:Snapshot;lang:Language;onSaved:(message?:string)=>void;onError:(e:unknown)=>void}){
  const t=(k:MessageKey)=>tr(lang,k);
  const [importFile,setImportFile]=useState<PreparedImport|null>(null),[importing,setImporting]=useState(false);
  const fileInput=useRef<HTMLInputElement>(null);const lock=useRef(false);
  const [editingOpening,setEditingOpening]=useState(false),[openingValue,setOpeningValue]=useState(''),[openingError,setOpeningError]=useState(''),[savingOpening,setSavingOpening]=useState(false);
  const beginOpening=()=>{setOpeningValue(moneyInput(data.settings[0].initialMinor,data.settings[0].currency));setOpeningError('');setEditingOpening(true);};
  const saveOpening=async(e:FormEvent)=>{
    e.preventDefault();if(lock.current)return;
    const amount=parseBalance(openingValue,data.settings[0].currency);
    if(amount===null){setOpeningError(t('invalidBalance'));return;}
    if(!window.confirm(t('openingWarning')))return;
    lock.current=true;setSavingOpening(true);
    try{await db.settings.update('main',{initialMinor:amount});setEditingOpening(false);onSaved();}
    catch(e){onError(e);}finally{lock.current=false;setSavingOpening(false);}
  };
  const exportData=async()=>{
    try{const backup=await createBackup();downloadBlob(backup,`budget-backup-${localToday()}.zip`);onSaved(t('exported'));}
    catch(e){onError(e);}
  };
  const pickFile=async(e:ChangeEvent<HTMLInputElement>)=>{
    const file=e.target.files?.[0];e.target.value='';if(!file)return;
    try{const prepared=await inspectBackup(file);setImportFile(prepared);}catch(err){onError(`${t('failedImport')}: ${formatError(err)}`);}
  };
  const confirmImport=async()=>{
    if(!importFile||lock.current)return;if(!window.confirm(t('confirmReplace')))return;
    lock.current=true;setImporting(true);
    try{await importBackup(importFile);setImportFile(null);onSaved(t('imported'));}catch(e){onError(e);}finally{lock.current=false;setImporting(false);}
  };
  const updateLang=async(next:Language)=>{try{await db.settings.update('main',{language:next});onSaved();}catch(e){onError(e);}};
  const [savingTheme,setSavingTheme]=useState(false);
  const updateTheme=async(next:ThemePreference)=>{
    if(savingTheme||next===(data.settings[0].theme??'system'))return;
    setSavingTheme(true);
    try{await db.settings.update('main',{theme:next});onSaved();}
    catch(e){onError(e);}finally{setSavingTheme(false);}
  };
  const demo=async()=>{if(!window.confirm(t('confirmSeed')))return;try{await seedDemo(localToday());onSaved();}catch(e){onError(e);}};
  const [checking,setChecking]=useState(false);
  const checkIntegrity=async()=>{
    if(checking)return;setChecking(true);
    try{validateSnapshot(await snapshotDatabase());onSaved(t('dataOk'));}
    catch(e){onError(e);}finally{setChecking(false);}
  };
  return <div className="page-stack"><div className="page-intro"><div><div className="eyebrow">{t('settingsText')}</div><h1>{t('settings')}</h1></div></div>
    <section className="panel settings-panel"><div className="panel-head"><h2><Languages size={18}/>{t('language')}</h2></div><div className="language-switch"><button className={lang==='ru'?'selected':''} onClick={()=>void updateLang('ru')}>Русский</button><button className={lang==='en'?'selected':''} onClick={()=>void updateLang('en')}>English</button><button className={lang==='hy'?'selected':''} onClick={()=>void updateLang('hy')}>Հայերեն</button></div><div className="currency-lock"><span>{t('currency')}</span><strong>{data.settings[0].currency}</strong></div><div className="opening-balance-row"><span>{t('initial')}<strong>{formatMoney(data.settings[0].initialMinor,data.settings[0].currency,lang)}</strong></span><button className="small-add" onClick={beginOpening}><Pencil size={17}/>{t('edit')}</button></div><p className="small-note">{t('existingCurrency')}</p></section>
    <section className="panel settings-panel"><div className="panel-head"><h2><Sun size={18}/>{t('appearance')}</h2></div>
      <div className="theme-switch" role="group" aria-label={t('appearance')}>
        {([['light',Sun,'themeLight'],['dark',Moon,'themeDark'],['system',Monitor,'themeSystem']] as const).map(([value,Icon,label])=><button key={value} type="button" disabled={savingTheme} className={(data.settings[0].theme??'system')===value?'selected':''} aria-pressed={(data.settings[0].theme??'system')===value} onClick={()=>void updateTheme(value)}><Icon size={19} aria-hidden="true"/><span>{t(label)}</span></button>)}
      </div>
      <p className="small-note theme-help">{t('themeHint')}</p>
    </section>
    <ReferenceSettings data={data} lang={lang} onSaved={onSaved} onError={onError}/>
    <section className="panel settings-panel"><div className="panel-head"><h2>{t('data')}</h2></div><p className="settings-description">{t('backupInfo')}</p><button className="primary full" onClick={()=>void exportData()}><Download size={18}/>{t('export')}</button><button className="secondary full" onClick={()=>fileInput.current?.click()}><Upload size={18}/>{t('import')}</button>
      <input ref={fileInput} className="file-input" type="file" accept=".zip,application/zip" onChange={e=>void pickFile(e)}/>
      <p className="small-note">{t('checkDataHint')}</p><button className="secondary full" disabled={checking||importing} onClick={()=>void checkIntegrity()}><CheckCircle2 size={18}/>{checking?'…':t('checkData')}</button>
    </section>
    <section className="panel settings-panel"><h2>{t('demo')}</h2><p className="small-note">{t('demoWarning')}</p><button className="secondary full" disabled={Boolean(data.transactions.length||data.rules.length||data.debts.length)} onClick={()=>void demo()}>{t('demo')}</button></section>
    {!window.isSecureContext&&<p className="security-note" role="note"><AlertTriangle size={18}/>{t('insecureOffline')}</p>}
    <div className="footer-version">Pocket Budget · {t('appVersion')} 1.4.1</div>
    {editingOpening&&<Sheet title={t('editOpening')} onClose={()=>{if(!savingOpening)setEditingOpening(false);}}><form className="editor-form" onSubmit={e=>void saveOpening(e)}><p className="warning-message"><AlertTriangle size={18}/>{t('openingWarning')}</p><Field label={`${t('initial')} · ${data.settings[0].currency}`} error={openingError}><input autoFocus inputMode="decimal" value={openingValue} onChange={e=>setOpeningValue(e.target.value)}/></Field><button type="submit" className="primary full" disabled={savingOpening}>{savingOpening?'…':t('save')}</button><button type="button" className="ghost full" disabled={savingOpening} onClick={()=>setEditingOpening(false)}>{t('cancel')}</button></form></Sheet>}
    {importFile&&<Sheet title={t('preview')} onClose={()=>{if(!importing)setImportFile(null);}}><div className="editor-form"><div className="import-preview"><div>{t('exportedAt')}<strong>{new Date(importFile.manifest.exportedAt).toLocaleString(lang==='ru'?'ru-RU':lang==='hy'?'hy-AM':'en-GB')}</strong></div><div>{t('currency')}<strong>{importFile.data.settings[0].currency}</strong></div><div>{t('opCount')}<strong>{importFile.data.transactions.length}</strong></div><div>{t('ruleCount')}<strong>{importFile.data.rules.length}</strong></div><div>{t('debtItemCount')}<strong>{importFile.data.debts.length}</strong></div></div><p className="warning-message"><AlertTriangle size={20}/>{t('importWarning')}</p><button className="secondary full" onClick={()=>void exportData()}><Download size={17}/>{t('downloadCurrent')}</button><button className="danger-button full" disabled={importing} onClick={()=>void confirmImport()}>{importing?'…':t('importConfirm')}</button><button className="ghost full" onClick={()=>setImportFile(null)}>{t('cancel')}</button></div></Sheet>}
  </div>;
}

export default function App(){
  const today=useToday();
  const [temporaryLang,setTemporaryLang]=useState<Language>('ru'),[tab,setTab]=useState<Tab>('overview'),[editor,setEditor]=useState<Editor|null>(null),[notice,setNotice]=useState(''),[error,setError]=useState('');
  const [month,setMonth]=useState(localToday().slice(0,7)),[year,setYear]=useState(YEAR_NOW),[planMode,setPlanMode]=useState<'payments'|'debts'>('payments');
  const data=useLiveQuery(()=>snapshotDatabase(),[],undefined);
  const [storageError,setStorageError]=useState(false);
  useEffect(()=>{let active=true;db.open().catch(()=>{if(active)setStorageError(true);});return ()=>{active=false;};},[]);
  const [online,setOnline]=useState(()=>navigator.onLine);
  useEffect(()=>{const update=()=>setOnline(navigator.onLine);window.addEventListener('online',update);window.addEventListener('offline',update);return ()=>{window.removeEventListener('online',update);window.removeEventListener('offline',update);};},[]);
  useEffect(()=>{if(!notice)return;const timer=window.setTimeout(()=>setNotice(''),5000);return ()=>window.clearTimeout(timer);},[notice]);
  const language=data?.settings[0]?.language??temporaryLang;
  const theme:ThemePreference=data?.settings[0]?.theme??'system';
  useEffect(()=>{
    const media=window.matchMedia('(prefers-color-scheme: dark)');
    const update=()=>applyTheme(theme,media.matches);
    update();
    media.addEventListener('change',update);
    return ()=>media.removeEventListener('change',update);
  },[theme]);
  useEffect(()=>{document.documentElement.lang=language;},[language]);
  const t=(k:MessageKey)=>tr(language,k);
  const showError=(e:unknown)=>{setError(formatError(e));};
  const saved=(message?:string)=>{setEditor(null);setError('');setNotice(message??t('saved'));};
  const closeEditor=()=>setEditor(null);
  const shared=data?.settings[0]?{settings:data.settings[0],categories:data.categories,objects:data.objects,language,onSaved:()=>saved(),onError:showError,onClose:closeEditor}:null;
  const removeOp=async(item:Transaction)=>{if(!window.confirm(`${t('confirmDelete')}${item.occurrenceId?'\n'+t('deleteLinked'):''}`))return;
    try{await deleteTransaction(item.id);saved(t('deleted'));}catch(e){showError(e);}};
  const removePlan=async(item:Occurrence)=>{
    if(!window.confirm(t('confirmCancel')))return;
    try{await cancelOccurrence(item);saved(t('cancelled'));}catch(e){showError(e);}
  };
  if(storageError)return <main className="loading-screen storage-failure"><AlertTriangle size={35}/><h1>{t('error')}</h1><p>{t('storageIssue')}</p><button className="primary" onClick={()=>window.location.reload()}>{t('retry')}</button></main>;
  if(data===undefined)return <div className="loading-screen"><div className="spinner"/><p>{t('loading')}</p></div>;
  if(data.settings.length===0)return <><SetupScreen lang={temporaryLang} setLang={setTemporaryLang} onDone={message=>setNotice(message??t('saved'))} onError={showError}/>{error&&<Notice message={error} lang={temporaryLang} onClose={()=>setError('')}/>}</>;
  return <div className="app-shell"><header className="app-header"><div className="app-header-inner"><div className="brand"><span className="brand-mark"><Wallet size={19}/></span><strong>Pocket<span>Budget</span></strong></div><div className="header-date"><span className="online-dot"/><time className="header-date-text" dateTime={today}>{formatDate(today,language)}</time><span className="currency-header">{data.settings[0].currency}</span></div></div></header>
    <div className="app-main"><aside className="sidebar">{([['overview',LayoutDashboard],['operations',ArrowLeftRight],['plan',CalendarDays],['settings',Settings2]] as const).map(([name,Icon])=><button key={name} className={tab===name?'active':''} onClick={()=>setTab(name)}><Icon size={19}/>{t(name)}</button>)}<div className="sidebar-bottom"><span className={online?'online-dot':'online-dot disconnected'}/>{online?t('onlineState'):t('offlineState')}</div></aside>
      <main className="content">{tab==='overview'&&<Overview data={data} lang={language} month={month} year={year} setMonth={setMonth} setYear={setYear} openPlan={()=>{setPlanMode('payments');setTab('plan');}} openDebts={()=>{setPlanMode('debts');setTab('plan');}}/>}
        {tab==='operations'&&<TransactionList data={data} lang={language} onEdit={item=>setEditor({type:'transaction',item})} onRemove={item=>void removeOp(item)}/>}
        {tab==='plan'&&<><div className="seg-tabs plan-subtabs"><button className={planMode==='payments'?'selected':''} onClick={()=>setPlanMode('payments')}>{t('paymentsTab')}</button><button className={planMode==='debts'?'selected':''} onClick={()=>setPlanMode('debts')}>{t('debts')}</button></div>{planMode==='payments'?<PlanList data={data} lang={language} onEdit={item=>setEditor({type:'plan',selected:item,rule:data.rules.find(x=>x.id===item.ruleId)})} onAction={item=>setEditor({type:'occurrence',item})} onDelete={item=>void removePlan(item)}/>:<DebtsView data={data} lang={language} onSaved={saved} onError={showError}/>}</>}
        {tab==='settings'&&<SettingsView data={data} lang={language} onSaved={saved} onError={showError}/>}
      </main>
    </div>
    <button className="fab" type="button" aria-label={t('add')} onClick={()=>setEditor({type:'add-choice'})}><Plus size={27}/><span>{t('add')}</span></button>
    <nav className="bottom-nav" aria-label={t('mainNavigation')}>
      {([['overview',LayoutDashboard],['operations',ArrowLeftRight]] as const).map(([name,Icon])=><button key={name} type="button" className={tab===name?'active':''} aria-current={tab===name?'page':undefined} aria-label={t(name)} title={t(name)} onClick={()=>setTab(name)}><Icon size={22} strokeWidth={tab===name?2.6:1.9} aria-hidden="true"/><span aria-hidden="true">{tc(language,name)}</span></button>)}
      <button type="button" className="bottom-nav-add" aria-label={t('add')} title={t('add')} onClick={()=>setEditor({type:'add-choice'})}><span className="bottom-nav-add-icon" aria-hidden="true"><Plus size={25}/></span></button>
      {([['plan',CalendarDays],['settings',Settings2]] as const).map(([name,Icon])=><button key={name} type="button" className={tab===name?'active':''} aria-current={tab===name?'page':undefined} aria-label={t(name)} title={t(name)} onClick={()=>setTab(name)}><Icon size={22} strokeWidth={tab===name?2.6:1.9} aria-hidden="true"/><span aria-hidden="true">{tc(language,name)}</span></button>)}
    </nav>
    {editor?.type==='add-choice'&&<Sheet title={t('chooseAction')} onClose={closeEditor}><div className="choice-list"><button onClick={()=>setEditor({type:'transaction'})}><span className="choice-icon choice-green"><ArrowLeftRight size={22}/></span><span>{t('addOperation')}<small>{t('history')}</small></span><ChevronRight size={18}/></button><button onClick={()=>setEditor({type:'plan'})}><span className="choice-icon choice-amber"><CalendarDays size={22}/></span><span>{t('addPlan')}<small>{t('futurePlans')}</small></span><ChevronRight size={18}/></button><button onClick={()=>{setTab('plan');setPlanMode('debts');setEditor(null);}}><span className="choice-icon choice-green"><Wallet size={22}/></span><span>{t('addDebt')}<small>{t('debtHistory')}</small></span><ChevronRight size={18}/></button></div></Sheet>}
    {shared&&editor?.type==='transaction'&&<TransactionEditor key={editor.item?.id??'new'} {...shared} item={editor.item} defaultKind={editor.kind}/>}
    {shared&&editor?.type==='plan'&&<PlanEditor key={editor.selected?.id??'new'} {...shared} rule={editor.rule} selected={editor.selected} defaultKind={editor.kind}/>}
    {shared&&editor?.type==='occurrence'&&<OccurrenceActions {...shared} item={editor.item}/>}
    {error&&<Notice message={`${t('error')}: ${error}`} lang={language} onClose={()=>setError('')}/>}
    {notice&&!error&&<Notice message={notice} lang={language} onClose={()=>setNotice('')}/>}
  </div>;
}
