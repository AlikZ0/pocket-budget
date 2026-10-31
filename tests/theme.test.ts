import {describe,expect,it} from 'vitest';
import {resolveTheme,isThemePreference} from '../src/lib/theme';
import {validateSnapshot} from '../src/lib/backup';
import type {Snapshot} from '../src/lib/models';

describe('appearance preferences',()=>{
  it('resolves system appearance and follows system changes',()=>{
    expect(resolveTheme('system',false)).toBe('light');
    expect(resolveTheme('system',true)).toBe('dark');
  });
  it('does not override explicit light/dark with device preference',()=>{
    expect(resolveTheme('dark',false)).toBe('dark');
    expect(resolveTheme('light',true)).toBe('light');
  });
  it('rejects unsupported preferences',()=>{
    expect(isThemePreference('dark')).toBe(true);
    expect(isThemePreference('system')).toBe(true);
    expect(isThemePreference('sepia')).toBe(false);
  });
  it('accepts existing backups without a theme but rejects corrupted values',()=>{
    const data:Snapshot={settings:[{id:'main',currency:'AMD',initialMinor:0,startDate:'2026-01-01',language:'ru',createdAt:'2026-01-01T00:00:00.000Z'}],categories:[],objects:[],transactions:[],rules:[],overrides:[],debts:[],debtPayments:[]};
    expect(()=>validateSnapshot(data)).not.toThrow();
    data.settings[0].theme='dark';
    expect(()=>validateSnapshot(data)).not.toThrow();
    data.settings[0].theme='system';
    expect(()=>validateSnapshot(data)).not.toThrow();
    Object.assign(data.settings[0],{theme:'sepia'});
    expect(()=>validateSnapshot(data)).toThrow('Invalid budget settings');
  });
});
