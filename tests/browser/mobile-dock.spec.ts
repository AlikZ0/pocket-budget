import {test,expect} from '@playwright/test';

for(const width of [320,375,390,430]){
  test(`Armenian mobile dock never overlays content at ${width}px`,async({page})=>{
    await page.setViewportSize({width,height:780});
    await page.goto('/');
    await page.getByRole('button',{name:'Создать бюджет'}).click();
    await page.getByRole('button',{name:'Настройки'}).first().click();
    await page.getByRole('button',{name:'Հայերեն'}).click();
    await page.locator('.bottom-nav button[aria-label="Պլան"]').click();
    await page.getByRole('button',{name:'Պարտքեր',exact:true}).click();
    const dock=page.locator('.bottom-nav');
    await expect(dock.locator('button')).toHaveCount(5);
    await expect(page.locator('.fab')).toBeHidden();
    await expect(page.locator('.bottom-nav-add')).toBeVisible();
    await expect(page.getByRole('button',{name:'Ավելացնել պարտք'})).toBeVisible();
    const geometry=await page.evaluate(()=>{
      const nav=document.querySelector('.bottom-nav')!;
      const main=document.querySelector('.content')!;
      const buttons=Array.from(nav.querySelectorAll('button'));
      const r=nav.getBoundingClientRect();
      const buttonLabels=buttons.flatMap(b=>Array.from(b.querySelectorAll('span:not(.bottom-nav-add-icon)')));
      return {
        docWidth:document.documentElement.scrollWidth-document.documentElement.clientWidth,
        dockWidth:r.width,
        buttonsFit:buttons.every(b=>{const x=b.getBoundingClientRect();return x.width>=44&&x.height>=44&&x.left>=r.left-1&&x.right<=r.right+1}),
        labelsFit:buttonLabels.every(l=>l.scrollWidth<=l.clientWidth+1 && l.scrollHeight<=l.clientHeight+1),
        mainPadding:parseFloat(getComputedStyle(main).paddingBottom),
        dockHeight:r.height,
      };
    });
    expect(geometry.docWidth).toBeLessThanOrEqual(1);
    expect(geometry.buttonsFit).toBe(true);
    expect(geometry.labelsFit).toBe(true);
    expect(geometry.mainPadding).toBeGreaterThan(geometry.dockHeight+20);
    await page.locator('.bottom-nav-add').click();
    await expect(page.getByRole('dialog')).toBeVisible();
  });
}
