import {useRef,useState,type FormEvent} from 'react';
import type {Transaction,PlanRule,Occurrence,Category,BudgetObject,Language,Kind,Frequency,Settings} from '../lib/models';
import {newId} from '../lib/models';
import {localToday,isDate} from '../lib/dates';
import {parseMoney,moneyInput} from '../lib/money';
import {saveTransaction,markCompleted,overrideOccurrence,cancelOccurrence,saveRuleFrom,addPlanRule,anchorFromDate} from '../lib/db';
import {translate as tr,type MessageKey} from '../lib/i18n';
import {Field,ReferenceFields,Sheet,TypeToggle} from './Fields';
interface Shared {settings:Settings;categories:Category[];objects:BudgetObject[];language:Language;onSaved:()=>void;onError:(error:unknown)=>void;onClose:()=>void;}
const errorText=(e:unknown)=>e instanceof Error?e.message:String(e);
const getValidDate=(date:string,min:string,max?:string)=>isDate(date)&&date>=min&&(!max||date<=max);
export function TransactionEditor({item,defaultKind='expense',...p}:Shared&{item?:Transaction;defaultKind?:Kind}){
  const t=(k:MessageKey)=>tr(p.language,k);
  const [kind,setKind]=useState<Kind>(item?.kind??defaultKind),[title,setTitle]=useState(item?.title??''),
  [amount,setAmount]=useState(item?moneyInput(item.amountMinor,p.settings.currency):''),[date,setDate]=useState(item?.date??localToday()),
  [categoryId,setCategoryId]=useState(item?.categoryId??''),[objectId,setObjectId]=useState(item?.objectId??''),[note,setNote]=useState(item?.note??''),
  [errors,setErrors]=useState<Record<string,string>>({}),[saving,setSaving]=useState(false);
  const lock=useRef(false);
  const submit=async(e:FormEvent)=>{
    e.preventDefault();if(lock.current)return;const errs:Record<string,string>={};const minor=parseMoney(amount,p.settings.currency);
    if(!title.trim())errs.title=t('invalidRequired');if(minor===null)errs.amount=t('invalidMoney');
    if(!getValidDate(date,p.settings.startDate,localToday()))errs.date=!isDate(date)?t('invalidDate'):date<p.settings.startDate?t('beforeStart'):t('futureActual');
    setErrors(errs);if(Object.keys(errs).length||minor===null)return;
    lock.current=true;setSaving(true);
    try{await saveTransaction({id:item?.id??newId(),kind:item?.occurrenceId?item.kind:kind,title:title.trim(),amountMinor:minor,date,
      categoryId:categoryId||undefined,objectId:objectId||undefined,note:note.trim()||undefined,createdAt:item?.createdAt??new Date().toISOString(),occurrenceId:item?.occurrenceId});p.onSaved();}
    catch(err){lock.current=false;setSaving(false);p.onError(err);}
  };
  return <Sheet title={item?t('edit'):t('addOperation')} onClose={()=>{if(!saving)p.onClose();}}><form onSubmit={submit} className="editor-form">
    {!item?.occurrenceId&&<TypeToggle value={kind} onChange={k=>{setKind(k);setCategoryId('');}} language={p.language}/>}
    <Field label={t('title')} error={errors.title}><input autoFocus maxLength={200} value={title} onChange={e=>setTitle(e.target.value)} placeholder={kind==='expense'?t('exampleExpense'):t('exampleIncome')}/></Field>
    <div className="two-fields"><Field label={`${t('amount')} · ${p.settings.currency}`} error={errors.amount}><input inputMode="decimal" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="0.00"/></Field>
    <Field label={t('date')} error={errors.date}><input type="date" min={p.settings.startDate} max={localToday()} value={date} onChange={e=>setDate(e.target.value)}/></Field></div>
    <ReferenceFields kind={kind} categoryId={categoryId} objectId={objectId} onCategory={setCategoryId} onObject={setObjectId} categories={p.categories} objects={p.objects} language={p.language}/>
    <Field label={t('note')}><textarea value={note} onChange={e=>setNote(e.target.value)} maxLength={2000} rows={2}/></Field>
    {item?.occurrenceId&&<p className="hint">{t('editLinked')}</p>}
    <button className="primary full" disabled={saving} type="submit">{saving?'…':t('save')}</button>
  </form></Sheet>;
}
export function PlanEditor({rule,selected,defaultKind='expense',...p}:Shared&{rule?:PlanRule;selected?:Occurrence;defaultKind?:Kind}){
  const t=(k:MessageKey)=>tr(p.language,k);
  const [kind,setKind]=useState<Kind>(rule?.kind??defaultKind),[title,setTitle]=useState(selected?.title??rule?.title??''),
  [amount,setAmount]=useState(selected?moneyInput(selected.amountMinor,p.settings.currency):rule?moneyInput(rule.amountMinor,p.settings.currency):''),
  [date,setDate]=useState(selected?.date??rule?.startDate??localToday()),
  [endDate,setEndDate]=useState(rule?.endDate??''),[frequency,setFrequency]=useState<Frequency>(rule?.frequency??'once'),
  [categoryId,setCategoryId]=useState(selected?.categoryId??rule?.categoryId??''),[objectId,setObjectId]=useState(selected?.objectId??rule?.objectId??''),
  [note,setNote]=useState(selected?.note??rule?.note??''),[scope,setScope]=useState<'one'|'future'>('one'),
  [errors,setErrors]=useState<Record<string,string>>({}),[saving,setSaving]=useState(false);
  const lock=useRef(false);
  const submit=async(e:FormEvent)=>{
    e.preventDefault();if(lock.current)return;const errs:Record<string,string>={};const minor=parseMoney(amount,p.settings.currency);
    if(!title.trim())errs.title=t('invalidRequired');if(minor===null)errs.amount=t('invalidMoney');
    if(!getValidDate(date,p.settings.startDate))errs.date=t('invalidDate');
    if(endDate&&(!isDate(endDate)||endDate<date))errs.endDate=t('endBeforeStart');
    if(selected&&rule&&scope==='future'&&date<selected.originalDate)errs.date=t('beforeStart');
    setErrors(errs);if(Object.keys(errs).length||minor===null)return;
    if(selected&&rule&&scope==='future'&&!window.confirm(t('confirmFuture')))return;
    lock.current=true;setSaving(true);
    try{
      if(selected&&rule&&scope==='one'){
        await overrideOccurrence(selected,{date,amountMinor:minor,title:title.trim(),categoryId:categoryId||null,objectId:objectId||null,note:note.trim()});
      }else{
        const newRule:PlanRule={id:rule&&selected&&scope==='future'&&selected.originalDate===rule.startDate?rule.id:newId(),kind,title:title.trim(),amountMinor:minor,
          startDate:date,endDate:endDate||undefined,frequency,anchorDay:rule&&selected&&date===selected.originalDate&&frequency===rule.frequency?rule.anchorDay:anchorFromDate(date),categoryId:categoryId||undefined,
          objectId:objectId||undefined,note:note.trim()||undefined,createdAt:rule?.createdAt??new Date().toISOString()};
        if(selected&&rule)await saveRuleFrom(rule,selected,newRule);else await addPlanRule(newRule);
      }
      p.onSaved();
    }catch(err){lock.current=false;setSaving(false);p.onError(err);}
  };
  return <Sheet title={rule?t('edit'):t('addPlan')} onClose={()=>{if(!saving)p.onClose();}}><form className="editor-form" onSubmit={submit}>
    {!rule&&<TypeToggle language={p.language} value={kind} onChange={k=>{setKind(k);setCategoryId('');}}/>}
    {selected&&rule?.frequency!=='once'&&<Field label={t('editScope')}><div className="scope-options"><label><input type="radio" checked={scope==='one'} onChange={()=>setScope('one')}/>{t('thisOnly')}</label><label><input type="radio" checked={scope==='future'} onChange={()=>setScope('future')}/>{t('thisAndFuture')}</label></div></Field>}
    <Field label={t('title')} error={errors.title}><input autoFocus value={title} onChange={e=>setTitle(e.target.value)} maxLength={200}/></Field>
    <div className="two-fields"><Field label={`${t('amount')} · ${p.settings.currency}`} error={errors.amount}><input inputMode="decimal" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="0.00"/></Field><Field label={t('date')} error={errors.date}><input type="date" value={date} min={p.settings.startDate} onChange={e=>setDate(e.target.value)}/></Field></div>
    {(!selected||scope==='future')&&<><div className="two-fields"><Field label={t('frequency')}><select value={frequency} onChange={e=>setFrequency(e.target.value as Frequency)}>{(['once','weekly','monthly','yearly'] as Frequency[]).map(f=><option value={f} key={f}>{t(f)}</option>)}</select></Field>{frequency!=='once'&&<Field label={t('endDate')} error={errors.endDate}><input type="date" value={endDate} min={date} onChange={e=>setEndDate(e.target.value)}/></Field>}</div></>}
    <ReferenceFields kind={kind} categoryId={categoryId} objectId={objectId} onCategory={setCategoryId} onObject={setObjectId} categories={p.categories} objects={p.objects} language={p.language}/>
    <Field label={t('note')}><textarea rows={2} value={note} onChange={e=>setNote(e.target.value)} maxLength={2000}/></Field>
    <button className="primary full" disabled={saving} type="submit">{saving?'…':t('save')}</button>
  </form></Sheet>;
}
export function OccurrenceActions({item,...p}:Shared&{item:Occurrence}){
  const t=(k:MessageKey)=>tr(p.language,k);
  const [mode,setMode]=useState<'menu'|'pay'|'move'|'amount'>('menu'),
    [date,setDate]=useState(localToday()),[movedDate,setMovedDate]=useState(item.date),
    [amount,setAmount]=useState(moneyInput(item.amountMinor,p.settings.currency)),[error,setError]=useState(''),[saving,setSaving]=useState(false);
  const lock=useRef(false);
  const act=async(action:'pay'|'move'|'amount'|'cancel')=>{
    if(lock.current)return;
    const minor=parseMoney(amount,p.settings.currency);
    if(action!=='cancel'&&action!=='move'&&minor===null){setError(t('invalidMoney'));return;}
    if(action==='pay'&&!getValidDate(date,p.settings.startDate,localToday())){setError(t('invalidDate'));return;}
    if(action==='move'&&!getValidDate(movedDate,p.settings.startDate)){setError(t('invalidDate'));return;}
    if(action==='cancel'&&!window.confirm(t('confirmCancel')))return;
    lock.current=true;setSaving(true);
    try{
      if(action==='pay')await markCompleted(item,date,minor!);
      if(action==='move')await overrideOccurrence(item,{date:movedDate});
      if(action==='amount')await overrideOccurrence(item,{amountMinor:minor!});
      if(action==='cancel')await cancelOccurrence(item);
      p.onSaved();
    }catch(e){lock.current=false;setSaving(false);p.onError(errorText(e));}
  };
  return <Sheet title={item.title} onClose={()=>{if(!saving)p.onClose();}}>
    {mode==='menu'?<div className="action-list">
      <button onClick={()=>setMode('pay')}>{t('paid')}</button><button onClick={()=>setMode('move')}>{t('move')}</button><button onClick={()=>setMode('amount')}>{t('changeAmount')}</button>
      <button className="danger-text" onClick={()=>void act('cancel')}>{t('cancelled')}</button>
    </div>:<div className="editor-form">
      {mode==='pay'&&<Field label={t('actualDate')} error={error}><input type="date" min={p.settings.startDate} max={localToday()} value={date} onChange={e=>setDate(e.target.value)}/></Field>}
      {mode==='move'&&<Field label={t('moveDate')} error={error}><input type="date" min={p.settings.startDate} value={movedDate} onChange={e=>setMovedDate(e.target.value)}/></Field>}
      {(mode==='pay'||mode==='amount')&&<Field label={`${mode==='pay'?t('actualAmount'):t('amount')} · ${p.settings.currency}`} error={error}><input inputMode="decimal" value={amount} onChange={e=>setAmount(e.target.value)}/></Field>}
      <button className="primary full" disabled={saving} onClick={()=>void act(mode)}>{saving?'…':mode==='pay'?t('confirmPayment'):t('save')}</button>
      <button className="ghost full" disabled={saving} onClick={()=>setMode('menu')}>{t('back')}</button>
    </div>}
  </Sheet>;
}
