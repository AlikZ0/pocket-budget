import {describe,expect,it,vi} from 'vitest';
import {newId} from '../src/lib/models';

describe('UUID generation in non-secure Safari contexts',()=>{
  it('works when randomUUID is absent but getRandomValues exists',()=>{
    const original=globalThis.crypto;
    vi.stubGlobal('crypto',{getRandomValues:(bytes:Uint8Array)=>{for(let i=0;i<bytes.length;i++)bytes[i]=i;return bytes;}});
    try{
      expect(newId()).toMatch(/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
    }finally{vi.stubGlobal('crypto',original);vi.unstubAllGlobals();}
  });
  it('creates different IDs on normal runtimes',()=>{
    expect(newId()).not.toBe(newId());
  });
});
