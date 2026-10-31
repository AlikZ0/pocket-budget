import {useEffect,useState} from 'react';
import {localToday} from './dates';

/** Keep balances, due/overdue labels and year filters correct across midnight.
 * Also resync after a sleeping mobile tab is resumed. */
export function useToday():string {
  const [today,setToday]=useState(localToday);
  useEffect(()=>{
    let timer:ReturnType<typeof setTimeout>;
    const sync=()=>setToday(localToday());
    const schedule=()=>{
      clearTimeout(timer);
      const now=new Date();
      const next=new Date(now.getFullYear(),now.getMonth(),now.getDate()+1,0,0,1);
      timer=setTimeout(()=>{sync();schedule();},Math.max(1000,next.getTime()-now.getTime()));
    };
    const wake=()=>{sync();schedule();};
    document.addEventListener('visibilitychange',wake);
    window.addEventListener('focus',wake);
    schedule();
    return ()=>{clearTimeout(timer);document.removeEventListener('visibilitychange',wake);window.removeEventListener('focus',wake);};
  },[]);
  return today;
}
