import {describe,expect,it} from 'vitest';
import {compactTranslate,translate,type MessageKey} from '../src/lib/i18n';

const compactNavigation:MessageKey[]=['overview','operations','plan','settings'];
const compactStatuses:MessageKey[]=['planned','done','cancelled','all'];

describe('Armenian short labels',()=>{
  it('gives every mobile navigation item an intentional short form',()=>{
    for(const key of compactNavigation){
      const short=compactTranslate('hy',key);
      expect(short.length).toBeLessThanOrEqual(8);
      expect(short.length).toBeGreaterThan(0);
      expect(translate('hy',key).length).toBeGreaterThan(0);
    }
  });
  it('keeps concise, legible statuses',()=>{
    for(const key of compactStatuses)expect(compactTranslate('hy',key).length).toBeLessThanOrEqual(10);
  });
  it('leaves Russian and English wording untouched',()=>{
    for(const key of [...compactNavigation,...compactStatuses])for(const lang of ['ru','en'] as const)
      expect(compactTranslate(lang,key)).toBe(translate(lang,key));
  });
  it('does not remove full labels used by assistive technology',()=>{
    expect(translate('hy','settings')).toBe('Կարգավորումներ');
    expect(compactTranslate('hy','settings')).toBe('Կարգ․');
    expect(translate('hy','operations')).toBe('Գործարքներ');
  });
});
