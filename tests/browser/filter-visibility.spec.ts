import {test,expect,type Page} from '@playwright/test';

/** A page without horizontal scrolling can STILL contain clipped inner scrollbars.
 * Check the bounding box of each control, not only document.scrollWidth. */
async function checkFilterLayout(page:Page,width:number){
  const filters=page.locator('.filter-grid .filter-field');
  await expect(filters).toHaveCount(4);
  const checks=await filters.evaluateAll((labels)=>labels.map(label=>{
    const input=label.querySelector('input,select');
    const viewport=document.documentElement.clientWidth;
    const bounds=[label.getBoundingClientRect(),input?.getBoundingClientRect()];
    return bounds.every(r=>r!==undefined&&r.width>=44&&r.left>=-1&&r.right<=viewport+1);
  }));
  expect(checks).toEqual([true,true,true,true]);
  const pageOverflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
  expect(pageOverflow).toBeLessThanOrEqual(1);
  const columns=await filters.first().evaluate(label=>getComputedStyle(label.parentElement!).gridTemplateColumns.split(' ').length);
  expect(columns).toBe(width<=360?1:width<=1080?2:4);
}

for(const width of [320,390,768,1280]){
  test(`filters are fully visible at ${width}px in RU / EN / HY`,async({page})=>{
    await page.setViewportSize({width,height:850});
    await page.goto('/');
    await page.getByRole('button',{name:'Создать бюджет'}).click();
    await page.getByRole('button',{name:'Операции'}).click();
    await checkFilterLayout(page,width);

    await page.getByRole('button',{name:'Настройки'}).click();
    await page.getByRole('button',{name:'English'}).click();
    await page.getByRole('button',{name:'Transactions'}).click();
    await checkFilterLayout(page,width);

    await page.getByRole('button',{name:'Settings'}).click();
    await page.getByRole('button',{name:'Հայերեն'}).click();
    await page.getByRole('button',{name:'Գործարքներ'}).click();
    await checkFilterLayout(page,width);
    await expect(page.getByRole('combobox',{name:'Օբյեկտ'})).toBeVisible();

    await page.getByRole('button',{name:'Պլան'}).click();
    const statuses=page.locator('.seg-tabs:not(.plan-subtabs) button');
    await expect(statuses).toHaveCount(4);
    const inViewport=await statuses.evaluateAll(btns=>btns.every(el=>{
      const r=el.getBoundingClientRect();
      return r.left>=-1&&r.right<=document.documentElement.clientWidth+1;
    }));
    expect(inViewport).toBe(true);
  });
}
