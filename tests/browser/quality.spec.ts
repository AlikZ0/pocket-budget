import {test,expect} from '@playwright/test';
import JSZip from 'jszip';

const stamp='2026-01-01T00:00:00.000Z';

test('restore a backup on an uninitialized phone without a temporary ledger',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto('/');
  const zip=new JSZip();
  zip.file('manifest.json',JSON.stringify({formatVersion:2,appVersion:'1.3.0',exportedAt:stamp}));
  zip.file('data.json',JSON.stringify({
    settings:[{id:'main',currency:'AMD',initialMinor:9600000,startDate:'2026-01-01',language:'ru',createdAt:stamp}],
    categories:[],objects:[],transactions:[],rules:[],overrides:[],debts:[],debtPayments:[]
  }));
  const buffer=await zip.generateAsync({type:'nodebuffer'});
  await page.locator('.onboarding-restore input[type=file]').setInputFiles({name:'budget.zip',mimeType:'application/zip',buffer});
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByText('Проверенный архив')).toBeVisible();
  page.once('dialog',d=>d.accept());
  await page.getByRole('dialog').getByRole('button',{name:'Восстановить из ZIP'}).click();
  await expect(page.getByText('Фактический баланс')).toBeVisible();
  await expect(page.locator('.hero-number')).toContainText('96');
});

test('correcting opening balance preserves transactions',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto('/');
  await page.getByRole('button',{name:'Создать бюджет'}).click();
  await page.getByRole('button',{name:'Настройки'}).last().click();
  await page.locator('.opening-balance-row').getByRole('button',{name:'Изменить'}).click();
  await page.getByRole('dialog').getByRole('textbox',{name:/Начальный остаток/}).fill('150000');
  page.once('dialog',d=>d.accept());
  await page.getByRole('dialog').getByRole('button',{name:'Сохранить'}).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button',{name:'Обзор'}).last().click();
  await expect(page.locator('.hero-number')).toContainText('150');
});

test('forecast chart can be inspected with keyboard',async({page})=>{
  await page.setViewportSize({width:320,height:720});
  await page.goto('/');
  await page.getByRole('button',{name:'Создать бюджет'}).click();
  const slider=page.getByRole('slider',{name:'День прогноза'});
  await slider.focus();
  await expect(slider).toBeFocused();
  await slider.press('Home');
  await expect(slider).toHaveValue('0');
  await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
});
