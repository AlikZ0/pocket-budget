export type Currency = 'AMD' | 'RUB' | 'USD' | 'EUR';
export type Language = 'ru' | 'en' | 'hy';
export type ThemePreference = 'light' | 'dark' | 'system';
export type Kind = 'income' | 'expense';
export type Frequency = 'once' | 'weekly' | 'monthly' | 'yearly';
export type ISODate = string;
export interface Settings { id:'main'; currency:Currency; initialMinor:number; startDate:ISODate; language:Language; theme?:ThemePreference; createdAt:string; }
export interface Category { id:string; name:string; kind:Kind; }
export interface BudgetObject { id:string; name:string; }
export interface Transaction { id:string; kind:Kind; title:string; amountMinor:number; date:ISODate; categoryId?:string; objectId?:string; note?:string; occurrenceId?:string; debtPaymentId?:string; createdAt:string; }
export interface PlanRule { id:string; kind:Kind; title:string; amountMinor:number; startDate:ISODate; endDate?:ISODate; frequency:Frequency; anchorDay:number; categoryId?:string; objectId?:string; note?:string; createdAt:string; }
export interface OccurrenceOverride { id:string; ruleId:string; occurrenceDate:ISODate; date?:ISODate; amountMinor?:number; title?:string; categoryId?:string | null; objectId?:string | null; note?:string; status:'pending'|'completed'|'cancelled'; transactionId?:string; }
/** Debt principal is a liability, not a cash transaction. Each repayment is an expense. */
export interface Debt { id:string; title:string; initialMinor:number; openedDate:ISODate; note?:string; createdAt:string; }
export interface DebtPayment { id:string; debtId:string; amountMinor:number; date:ISODate; note?:string; transactionId:string; createdAt:string; }
export interface Snapshot { debts:Debt[]; debtPayments:DebtPayment[]; settings:Settings[]; categories:Category[]; objects:BudgetObject[]; transactions:Transaction[]; rules:PlanRule[]; overrides:OccurrenceOverride[]; }
export interface Occurrence { id:string; ruleId:string; originalDate:ISODate; date:ISODate; kind:Kind; title:string; amountMinor:number; categoryId?:string; objectId?:string; note?:string; status:'pending'|'completed'|'cancelled'; transactionId?:string; frequency:Frequency; }
export const emptySnapshot = (): Snapshot => ({settings:[],categories:[],objects:[],transactions:[],rules:[],overrides:[],debts:[],debtPayments:[]});
/** UUID v4 compatible with Safari on plain HTTP (e.g. 192.168.x.x).
 * crypto.randomUUID is restricted to secure contexts; getRandomValues is not. */
export const newId = ():string => {
  const bytes=new Uint8Array(16);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues==='function') {
    crypto.getRandomValues(bytes);
  } else {
    // Last resort for legacy WebViews without Web Crypto. Collisions remain extremely unlikely.
    for(let i=0;i<16;i++)bytes[i]=Math.floor(Math.random()*256);
  }
  bytes[6]=(bytes[6]&15)|64;
  bytes[8]=(bytes[8]&63)|128;
  const h=Array.from(bytes,x=>x.toString(16).padStart(2,'0')).join('');
  return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
};
