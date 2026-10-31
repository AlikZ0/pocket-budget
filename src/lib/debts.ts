import type {Debt,DebtPayment,Snapshot} from './models';
import {safeSum} from './money';
/** Debt liability never decreases cash until a repayment transaction exists. */
export function debtPaid(debt:Debt,payments:DebtPayment[]):number{
  return payments.filter(p=>p.debtId===debt.id).reduce((sum,p)=>safeSum(sum,p.amountMinor),0);
}
export function debtOutstanding(debt:Debt,payments:DebtPayment[]):number{
  return safeSum(debt.initialMinor,-debtPaid(debt,payments));
}
/** Running debt balance in chronological order; corrections recalculate the full history. */
export function repaymentTimeline(debt:Debt,payments:DebtPayment[]):Array<{payment:DebtPayment;remaining:number}>{
  const order=payments.filter(p=>p.debtId===debt.id).sort((a,b)=>a.date.localeCompare(b.date)||a.createdAt.localeCompare(b.createdAt)||a.id.localeCompare(b.id));
  let remaining=debt.initialMinor;
  return order.map(payment=>{remaining=safeSum(remaining,-payment.amountMinor);return {payment,remaining};});
}
export function debtTotals(snapshot:Snapshot):{total:number;paid:number;remaining:number}{
  return snapshot.debts.reduce((v,d)=>({total:safeSum(v.total,d.initialMinor),paid:safeSum(v.paid,debtPaid(d,snapshot.debtPayments)),remaining:safeSum(v.remaining,debtOutstanding(d,snapshot.debtPayments))}),{total:0,paid:0,remaining:0});
}
