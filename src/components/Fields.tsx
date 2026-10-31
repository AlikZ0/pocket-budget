import {cloneElement,isValidElement,useEffect,useId,useRef,type ReactElement,type ReactNode} from 'react';
import type {BudgetObject,Category,Kind,Language} from '../lib/models';
import {translate as tr,type MessageKey} from '../lib/i18n';
export function Field({label,error,children,action}: {label:string;error?:string;children:ReactNode;action?:ReactNode}){
  const labelId=useId(),errorId=useId();
  // Label and validation attributes belong to the actual form control, not to a div
  // containing it: otherwise assistive technology and getByLabel() see two matches.
  const isControl=isValidElement(children)&&typeof children.type==='string'&&['input','select','textarea'].includes(children.type);
  const element=isControl?cloneElement(children as ReactElement<Record<string,unknown>>,
    {'aria-labelledby':labelId,...(error?{'aria-invalid':true,'aria-describedby':errorId}:{})}):children;
  return <div className="field"><span id={labelId} className="field-label">{label}</span>{action?<div className="amount-with-action">{element}{action}</div>:element}{error&&<span id={errorId} role="alert" className="field-error">{error}</span>}</div>;
}
export function TypeToggle({value,onChange,language}: {value:Kind;onChange:(kind:Kind)=>void;language:Language}){
  return <div role="group" className="type-toggle" aria-label={tr(language,'allTypes')}><button type="button" className={value==='expense'?'is-selected expense':''} onClick={()=>onChange('expense')}>{tr(language,'expense')}</button><button type="button" className={value==='income'?'is-selected income':''} onClick={()=>onChange('income')}>{tr(language,'income')}</button></div>;
}
export function ReferenceFields({kind,categoryId,objectId,categories,objects,onCategory,onObject,language}: {kind:Kind;categoryId:string;objectId:string;categories:Category[];objects:BudgetObject[];onCategory:(v:string)=>void;onObject:(v:string)=>void;language:Language}){
  const t=(k:MessageKey)=>tr(language,k);
  return <div className="two-fields"><Field label={t('category')}><select value={categoryId} onChange={e=>onCategory(e.target.value)}><option value="">{t('selectCategory')}</option>{categories.filter(c=>c.kind===kind).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></Field><Field label={t('object')}><select value={objectId} onChange={e=>onObject(e.target.value)}><option value="">{t('selectObject')}</option>{objects.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}</select></Field></div>;
}
/** Accessible modal: restore focus, handle Escape and trap Tab within the sheet. */
export function Sheet({title,children,onClose}: {title:string;children:ReactNode;onClose:()=>void}){
  const dialog=useRef<HTMLElement>(null),closeRef=useRef(onClose);
  closeRef.current=onClose;
  useEffect(()=>{
    const previous=document.activeElement instanceof HTMLElement?document.activeElement:null;
    const scroll=document.body.style.overflow;
    document.body.style.overflow='hidden';
    const node=dialog.current;
    if(node && !node.contains(document.activeElement)){
      (node.querySelector('[autofocus]') as HTMLElement|null)?.focus();
      if(!node.contains(document.activeElement))node.focus();
    }
    const keydown=(e:KeyboardEvent)=>{
      if(e.key==='Escape'){e.preventDefault();closeRef.current();return;}
      if(e.key!=='Tab'||!dialog.current)return;
      const controls=Array.from(dialog.current.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'))
        .filter(x=>x.getClientRects().length>0);
      if(!controls.length)return;
      const first=controls[0],last=controls[controls.length-1];
      if(e.shiftKey&&(document.activeElement===first||document.activeElement===dialog.current)){e.preventDefault();last.focus();}
      else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
    };
    document.addEventListener('keydown',keydown);
    return ()=>{document.body.style.overflow=scroll;document.removeEventListener('keydown',keydown);previous?.focus();};
  },[]);
  const closeLabel=document.documentElement.lang==='hy'?'Փակել':document.documentElement.lang==='en'?'Close':'Закрыть';
  return <div className="overlay" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}>
    <section role="dialog" ref={dialog} tabIndex={-1} aria-modal="true" aria-label={title} className="sheet">
      <header className="sheet-head"><h2>{title}</h2><button className="icon-button" type="button" aria-label={closeLabel} onClick={onClose}>×</button></header>
      <div className="sheet-body">{children}</div>
    </section>
  </div>;
}
export function Empty({title,description}: {title:string;description:string}){return <div className="empty"><div className="empty-symbol">◌</div><h3>{title}</h3><p>{description}</p></div>;}
