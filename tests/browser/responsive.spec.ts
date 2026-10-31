import {test,expect} from '@playwright/test';
for(const width of [320,390,768,1280]){
  test(`responsive layout at ${width}px`,async({page})=>{
    await page.setViewportSize({width,height:850});
    await page.goto('/');
    await page.getByRole('button',{name:'Создать бюджет'}).click();
    await expect(page.getByText('Фактический баланс')).toBeVisible();
    await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    await page.getByRole('button',{name:'Операции'}).click();
    await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    await page.locator(width<=720?'.bottom-nav-add':'.fab').click();
    await page.getByRole('button',{name:'Фактическую операцию'}).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    await page.screenshot({path:`test-results/layout-${width}.png`,fullPage:true});
  });
}
