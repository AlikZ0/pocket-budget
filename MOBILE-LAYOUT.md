# Mobile navigation and Armenian layout — v1.4.2

## Defects found on physical iPhone screenshots

- Bottom-right floating **+** obstructed form filters, debt cards and values.
- Full Armenian name for **Settings** wrapped across two lines in the four-column dock.
- Total-debt title and add-debt button competed for the width of the same heading row.
- The screenshot still used older labels (`Ամփոփում`, `Կարգավորումներ`), indicating a previous asset version/cached website; this cannot be confirmed without inspecting the running phone.

## Changes

- Removed the overlay FAB on mobile; the desktop FAB remains.
- Added a fifth, central **Add** button to the bottom dock; the same add-choice modal opens.
- Preserved full accessible names and abbreviated only visual mobile labels.
- Shortened `Մնացած պարտքը` and `Նոր պարտք` in the debt summary, but retained full accessible button name.
- Increased bottom content space so the dock does not obscure the last records.
- Added browser regression test `tests/browser/mobile-dock.spec.ts` at 320/375/390/430 CSS px.
- All styles work with light/dark/system preferences and preserve safe-area insets.

## Check on an iPhone

1. Export a ZIP backup from the existing application.
2. Deploy the updated `dist/` at the **same URL origin**, keeping the existing IndexedDB.
3. Hard-reload or close/reopen the Safari tab. If the old layout remains, clear the old PWA service-worker cache **without** deleting site data. Do not clear all website storage, because IndexedDB would be erased.
4. Confirm that the bottom dock has **five** actions, with **+** in the centre and no other floating add button.
5. Check the debts overview and the plan filters while scrolling, in all three languages and both colour schemes.

The iOS browser's own black address/toolbar area is Safari UI, not controlled by the webpage. Installing the PWA as a standalone application requires HTTPS (HTTP on a LAN address is insufficient).
