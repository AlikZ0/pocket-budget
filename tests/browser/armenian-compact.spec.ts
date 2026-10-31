import {test,expect} from '@playwright/test';

for(const width of [320,390]){
  test(`Armenian compact controls are fully readable at ${width}px`,async({page})=>{
    await page.setViewportSize({width,height:844});
    await page.goto('/');
    await page.getByRole('button',{name:'Создать бюджет'}).click();
    await page.getByRole('button',{name:'Настройки'}).click();
    await page.getByRole('button',{name:'Հայերեն'}).click();

    const nav=page.locator('.bottom-nav button');
    await expect(nav).toHaveCount(5);
    const navNames=['Ամփոփում','Գործարքներ','Ավելացնել','Պլան','Կարգավորումներ'];
    const compact=['Գլխավոր','Գործարք',null,'Պլան','Կարգ․'];
    for(let i=0;i<5;i++){ 
      await expect(nav.nth(i)).toHaveAttribute('aria-label',navNames[i]);
      if(compact[i]) await expect(nav.nth(i).locator('span').first()).toHaveText(compact[i]!);
    }
    const navFits=await nav.evaluateAll(buttons=>buttons.every(button=>{
      const label=button.querySelector('span')!;
      const bound=label.getBoundingClientRect();
      const buttonBounds=button.getBoundingClientRect();
      return label.scrollWidth<=label.clientWidth+1 && label.scrollHeight<=label.clientHeight+1 &&
        bound.left>=buttonBounds.left-1&&bound.right<=buttonBounds.right+1;
    }));
    expect(navFits).toBe(true);
    await page.locator('.bottom-nav button[aria-label="Պլան"]').click();
    const statuses=page.locator('.seg-tabs:not(.plan-subtabs) button');
    await expect(statuses).toHaveCount(4);
    await expect(statuses.nth(0)).toHaveAttribute('aria-label','Պլանավորված');
    const statusFits=await statuses.evaluateAll(items=>items.every(item=>{
      const container=item.getBoundingClientRect();
      return item.scrollWidth<=item.clientWidth+1 && item.scrollHeight<=item.clientHeight+1 &&
        container.left>=0 && container.right<=document.documentElement.clientWidth+1;
    }));
    expect(statusFits).toBe(true);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  });
}
