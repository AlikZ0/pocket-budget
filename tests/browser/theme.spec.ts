import {test,expect} from '@playwright/test';

for(const width of [320,390,768,1280]){
  test(`light / dark / device appearance at ${width}px`, async({page})=>{
    await page.setViewportSize({width,height:850});
    await page.emulateMedia({colorScheme:'light'});
    await page.goto('/');
    await page.getByRole('button',{name:'Создать бюджет'}).click();
    await page.getByRole('button',{name:'Настройки'}).click();
    const light=page.getByRole('button',{name:'Светлая'});
    const dark=page.getByRole('button',{name:'Тёмная'});
    const system=page.getByRole('button',{name:'Как на устройстве'});
    await expect(system).toHaveAttribute('aria-pressed','true');
    await dark.click();
    await expect(dark).toHaveAttribute('aria-pressed','true');
    await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
    await expect.poll(()=>page.evaluate(()=>getComputedStyle(document.documentElement).colorScheme)).toBe('dark');
    const darkBg=await page.locator('.panel').first().evaluate(e=>getComputedStyle(e).backgroundColor);
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
    await page.getByRole('button',{name:'Настройки'}).click();
    await light.click();
    await expect(page.locator('html')).toHaveAttribute('data-theme','light');
    const lightBg=await page.locator('.panel').first().evaluate(e=>getComputedStyle(e).backgroundColor);
    expect(darkBg).not.toBe(lightBg);
    await system.click();
    await expect(page.locator('html')).toHaveAttribute('data-theme','light');
    await page.emulateMedia({colorScheme:'dark'});
    await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
    await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    await page.getByRole('button',{name:'Операции'}).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
    await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  });
}
