import {useRef,useState,type FormEvent} from 'react';
import {Plus,Pencil,Trash2,CheckCircle2} from 'lucide-react';
import type {Debt,DebtPayment,Snapshot,Language} from '../lib/models';
import {newId} from '../lib/models';
import {saveDebt,recordDebtPayment,updateDebtPayment,deleteDebtPayment,deleteDebt} from '../lib/db';
import {debtOutstanding,debtPaid,debtTotals,repaymentTimeline} from '../lib/debts';
import {parseMoney,moneyInput,formatMoney} from '../lib/money';
import {isDate,localToday,formatDate} from '../lib/dates';
import {translate as tr,compactTranslate as tc,type MessageKey} from '../lib/i18n';
import {Sheet,Field,Empty} from './Fields';

interface Props {data:Snapshot;lang:Language;onSaved:(message?:string)=>void;onError:(error:unknown)=>void;}
export function DebtsView({data,lang,onSaved,onError}:Props){
  const t=(k:MessageKey)=>tr(lang,k),currency=data.settings[0].currency;
  const [editing,setEditing]=useState<Debt|null|undefined>(undefined);
  const [repaying,setRepaying]=useState<{debt:Debt;payment?:DebtPayment}|null>(null);
  const [expanded,setExpanded]=useState<string|null>(null);
  const [name,setName]=useState(''),[original,setOriginal]=useState(''),[opened,setOpened]=useState(localToday()),[note,setNote]=useState('');
  const [sum,setSum]=useState(''),[date,setDate]=useState(localToday()),[paymentNote,setPaymentNote]=useState('');
  const [errors,setErrors]=useState<Record<string,string>>({}),[busy,setBusy]=useState(false);
  const lock=useRef(false),totals=debtTotals(data);
  const paymentsFor=(id:string)=>data.debtPayments.filter(p=>p.debtId===id).sort((a,b)=>b.date.localeCompare(a.date)||b.createdAt.localeCompare(a.createdAt));
  const openDebt=(debt?:Debt)=>{
    setEditing(debt??null);setName(debt?.title??'');setOriginal(debt?moneyInput(debt.initialMinor,currency):'');
    setOpened(debt?.openedDate??localToday());setNote(debt?.note??'');setErrors({});
  };
  const openPay=(debt:Debt,payment?:DebtPayment)=>{
    setRepaying({debt,payment});setSum(payment?moneyInput(payment.amountMinor,currency):'');setDate(payment?.date??localToday());
    setPaymentNote(payment?.note??'');setErrors({});
  };
  const submitDebt=async(e:FormEvent)=>{
    e.preventDefault();if(lock.current)return;
    const amount=parseMoney(original,currency),err:Record<string,string>={};
    if(!name.trim())err.name=t('invalidRequired');
    if(amount===null)err.amount=t('invalidMoney');
    if(!isDate(opened)||opened>localToday())err.date=t('invalidDate');
    if(editing&&amount!==null&&amount<debtPaid(editing,data.debtPayments))err.amount=t('debtOverpay');
    setErrors(err);if(Object.keys(err).length||amount===null)return;
    lock.current=true;setBusy(true);
    try{await saveDebt({id:editing?.id??newId(),title:name.trim(),initialMinor:amount,openedDate:opened,
      note:note.trim()||undefined,createdAt:editing?.createdAt??new Date().toISOString()});setEditing(undefined);onSaved();}
    catch(e){onError(e);}finally{lock.current=false;setBusy(false);}
  };
  const submitPay=async(e:FormEvent)=>{
    e.preventDefault();if(lock.current||!repaying)return;
    const amount=parseMoney(sum,currency),{debt,payment}=repaying,err:Record<string,string>={};
    if(amount===null)err.amount=t('invalidMoney');
    else if(amount>debtOutstanding(debt,data.debtPayments)+(payment?.amountMinor??0))err.amount=t('debtOverpay');
    if(!isDate(date)||date<debt.openedDate||date<data.settings[0].startDate||date>localToday())err.date=t('invalidDate');
    setErrors(err);if(Object.keys(err).length||amount===null)return;
    lock.current=true;setBusy(true);
    try{
      if(payment)await updateDebtPayment({...payment,amountMinor:amount,date,note:paymentNote.trim()||undefined});
      else await recordDebtPayment(debt.id,amount,date,paymentNote.trim()||undefined);
      setRepaying(null);onSaved(t('debtSaved'));
    }catch(e){onError(e);}finally{lock.current=false;setBusy(false);}
  };
  const removeDebt=async(debt:Debt)=>{
    if(lock.current)return;
    if(paymentsFor(debt.id).length){onError(new Error(t('debtCannotDelete')));return;}
    if(!window.confirm(t('debtDelete')))return;
    lock.current=true;setBusy(true);
    try{await deleteDebt(debt.id);onSaved(t('deleted'));}catch(e){onError(e);}finally{lock.current=false;setBusy(false);}
  };
  const removePayment=async(payment:DebtPayment)=>{
    if(lock.current||!window.confirm(t('debtDeleteHistory')))return;
    lock.current=true;setBusy(true);
    try{await deleteDebtPayment(payment.id);onSaved(t('deleted'));}catch(e){onError(e);}finally{lock.current=false;setBusy(false);}
  };
  return <div className="page-stack">
    <section className="panel debt-summary">
      <div className="panel-head"><h2>{tc(lang,'debtTotalRemaining')}</h2><button className="small-add" type="button" aria-label={t('addDebt')} title={t('addDebt')} onClick={()=>openDebt()}><Plus size={18} aria-hidden="true"/><span aria-hidden="true">{tc(lang,'addDebt')}</span></button></div>
      <div className="debt-large">{formatMoney(totals.remaining,currency,lang)}</div>
      <div className="debt-summary-stats"><span>{t('originalDebt')}: <strong>{formatMoney(totals.total,currency,lang)}</strong></span><span>{t('paidDebt')}: <strong>{formatMoney(totals.paid,currency,lang)}</strong></span></div>
      <p className="small-note">{t('debtExplain')}</p>
    </section>
    {data.debts.length?data.debts.map(debt=>{
      const remaining=debtOutstanding(debt,data.debtPayments),paid=debtPaid(debt,data.debtPayments);
      const history=repaymentTimeline(debt,data.debtPayments).reverse();
      return <section className="panel debt-panel" key={debt.id}>
        <div className="debt-heading"><div><h2>{debt.title}</h2><small>{formatDate(debt.openedDate,lang)}</small></div>
          <div className="row-actions"><button aria-label={t('edit')} onClick={()=>openDebt(debt)}><Pencil size={17}/></button><button aria-label={t('delete')} disabled={busy} onClick={()=>void removeDebt(debt)}><Trash2 size={17}/></button></div></div>
        <div className="debt-remaining-label">{t('remainingDebt')}</div>
        <div className="debt-balance">{formatMoney(remaining,currency,lang)}</div>
        <div className="debt-track" role="progressbar" aria-label={t('paidDebt')} aria-valuenow={Math.round(paid/debt.initialMinor*100)} aria-valuemin={0} aria-valuemax={100}><div style={{width:`${100*paid/debt.initialMinor}%`}}/></div>
        <div className="debt-meta"><span>{t('paidDebt')}: {formatMoney(paid,currency,lang)}</span><span>{t('originalDebt')}: {formatMoney(debt.initialMinor,currency,lang)}</span></div>
        {debt.note&&<p className="small-note">{debt.note}</p>}
        {remaining>0?<button className="primary full" onClick={()=>openPay(debt)}><Plus size={18}/>{t('repayDebt')}</button>:<div className="debt-cleared"><CheckCircle2 size={18}/>{t('debtClear')}</div>}
        <button className="debt-history-toggle" aria-label={`${t('debtHistory')} (${history.length})`} onClick={()=>setExpanded(expanded===debt.id?null:debt.id)}><span aria-hidden="true">{tc(lang,'debtHistory')} ({history.length})</span> <span>{expanded===debt.id?'−':'+'}</span></button>
        {expanded===debt.id&&<div className="debt-history">{history.length?history.map(({payment,remaining:after})=><div className="debt-history-row" key={payment.id}>
          <div><strong>−{formatMoney(payment.amountMinor,currency,lang)}</strong><small>{formatDate(payment.date,lang)}</small><small>{t('afterRepayment')}: {formatMoney(after,currency,lang)}</small>{payment.note&&<small>{payment.note}</small>}</div>
          <div className="row-actions"><button aria-label={t('edit')} onClick={()=>openPay(debt,payment)}><Pencil size={16}/></button><button aria-label={t('delete')} disabled={busy} onClick={()=>void removePayment(payment)}><Trash2 size={16}/></button></div>
        </div>):<p className="small-note">{t('debtNoHistory')}</p>}</div>}
      </section>;
    }):<Empty title={t('nothing')} description={t('debtNoEntries')}/>}
    {editing!==undefined&&<Sheet title={editing?t('edit'):t('addDebt')} onClose={()=>{if(!busy)setEditing(undefined);}}><form className="editor-form" onSubmit={e=>void submitDebt(e)}>
      <Field label={t('title')} error={errors.name}><input autoFocus value={name} maxLength={200} onChange={e=>setName(e.target.value)}/></Field>
      <Field label={`${t('originalDebt')} · ${currency}`} error={errors.amount}><input inputMode="decimal" value={original} onChange={e=>setOriginal(e.target.value)} placeholder="0.00"/></Field>
      <Field label={t('debtStart')} error={errors.date}><input type="date" max={localToday()} value={opened} onChange={e=>setOpened(e.target.value)}/></Field>
      <Field label={t('note')}><textarea rows={2} value={note} maxLength={2000} onChange={e=>setNote(e.target.value)}/></Field>
      <p className="hint">{t('debtExplain')}</p>
      <button className="primary full" type="submit" disabled={busy}>{busy?'…':t('save')}</button>
    </form></Sheet>}
    {repaying&&<Sheet title={repaying.payment?t('debtPayEdit'):t('repayDebt')} onClose={()=>{if(!busy)setRepaying(null);}}><form className="editor-form" onSubmit={e=>void submitPay(e)}>
      <p>{repaying.debt.title}</p><div className="hint">{t('remainingDebt')}: {formatMoney(debtOutstanding(repaying.debt,data.debtPayments),currency,lang)}</div>
      <Field label={`${t('actualAmount')} · ${currency}`} error={errors.amount} action={<button type="button" className="small-add" onClick={()=>setSum(moneyInput(debtOutstanding(repaying.debt,data.debtPayments)+(repaying.payment?.amountMinor??0),currency))}>{t('payRemaining')}</button>}><input autoFocus inputMode="decimal" value={sum} onChange={e=>setSum(e.target.value)} placeholder="0.00"/></Field>
      <Field label={t('actualDate')} error={errors.date}><input type="date" min={repaying.debt.openedDate>data.settings[0].startDate?repaying.debt.openedDate:data.settings[0].startDate} max={localToday()} value={date} onChange={e=>setDate(e.target.value)}/></Field>
      <Field label={t('note')}><textarea rows={2} maxLength={2000} value={paymentNote} onChange={e=>setPaymentNote(e.target.value)}/></Field>
      <button className="primary full" disabled={busy} type="submit">{busy?'…':t('save')}</button>
    </form></Sheet>}
  </div>;
}
