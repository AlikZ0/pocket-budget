# Pocket Budget 1.4.0 — appearance verification

- Three settings: light, dark and system. Persisted in IndexedDB, included in ZIP; absence of preference in pre-1.4 backup defaults to system.
- CSS `light-dark()` surfaces, borders, inputs and text, including modals, bottom navigation, on-boarding and debt ledgers. The forecast SVG uses theme-aware CSS variables.
- Tested in available Chromium with static representative markup in both modes at 320 / 390 / 768 / 1280 pixels: computed backgrounds, native color-scheme, overflow and theme-button geometry; 8 / 8 passed. **This is a CSS visualization test, not a full React browser run.**
- Added application Playwright tests in `tests/browser/theme.spec.ts` for live mode switching, system preference, persistence and overflow. They require npm dependencies and `npm run test:e2e` on the user's machine.
- 11 standalone core algorithm checks passed (`npm run test:core`). All 28 TS/TSX files passed TypeScript syntax parser. Full typecheck, Vite production build and Vitest/Playwright runs were not available in this environment.
- Existing IndexedDB database name and version remain unchanged. ZIP format version stays 2. Prior backups without `theme` remain valid.
