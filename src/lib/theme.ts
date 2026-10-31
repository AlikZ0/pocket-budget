import type {ThemePreference} from './models';

export const isThemePreference=(value:unknown):value is ThemePreference=>
  value==='light'||value==='dark'||value==='system';

/** System mode responds to changes in prefers-color-scheme while the page stays open. */
export function resolveTheme(preference:ThemePreference,systemDark:boolean):'light'|'dark'{
  return preference==='system'?(systemDark?'dark':'light'):preference;
}

/** Keep the browser's own controls and PWA toolbar aligned with the chosen theme. */
export function applyTheme(preference:ThemePreference,systemDark:boolean){
  const resolved=resolveTheme(preference,systemDark);
  document.documentElement.dataset.theme=resolved;
  document.documentElement.style.colorScheme=resolved;
  const meta=document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if(meta)meta.content=resolved==='dark'?'#101b16':'#f5f6f2';
  return resolved;
}
