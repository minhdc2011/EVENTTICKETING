# EventTicketing — React Seat Map implementation brief

You are the substantive implementer in a GPT + Gemini team. Work directly in the current EventTicketing working tree. Do not commit. Preserve unrelated dirty changes.

## Goal

Replace the remaining legacy seating fragment/runtime ownership with a reusable React reserved-seat experience that works for Super Concert and future organizer-created events. The result must demonstrate Systems Analysis & Design: explicit data/state contracts, UI states, service boundaries, realtime behavior, and testable business rules.

## Design references

Read these Local Codex/Open Design outputs completely before editing:

- `C:\Users\congm\AppData\Roaming\Open Design\namespaces\release-stable-win\data\projects\eventticketing-react-seat-map-local\seat-selection.html`
- `C:\Users\congm\AppData\Roaming\Open Design\namespaces\release-stable-win\data\projects\eventticketing-react-seat-map-local\component-spec.md`
- `C:\Users\congm\AppData\Roaming\Open Design\namespaces\release-stable-win\data\projects\eventticketing-react-seat-map-local\brand-spec.md`

Use the prototype as interaction/design guidance, not as HTML to paste. Match the existing EventTicketing codebase tokens and typography where they differ. Wix principles used by the design are interaction references only: grouped toolbar, one-of-many segmented filter, status badge, related-content panels, disclosure usable by hover/focus/touch. Do not import Wix packages.

## Current code to inspect

- `src/components/ConcertSections.tsx` (`SeatingSection` is still raw legacy HTML)
- `src/components/GenericEventPage.tsx` and `src/components/event-template/*`
- `src/legacy/fragments/seating.html`
- seating-specific logic in `src/legacy/concertRuntime.js`
- `src/services/ticketDataService.ts`, `bookingService.ts`, `seatRealtimeService.ts`
- `src/types/ticketing.ts`, `src/domain/runtimeOverlays.js`
- existing tests and package scripts

## Required implementation

1. Create a proper React seat-map module under `src/components/event-template/` (split into sensible files if helpful). It must load `TicketingCatalog`, render loading/error/retry/empty/ready states, and display data from zones/seats rather than hardcoded Super Concert labels.
2. Make seating available to any event with reserved-seat catalog data, not only `templateKey === SUPER_CONCERT_2026`. Pass `event` into the component and integrate it through the generic `EventTemplate` slot architecture without duplicating a separate page.
3. Provide overview -> zone drill-down -> back to overview. Use a generic accessible geometry/layout derived from available zone data. Do not pretend organizer-authored arbitrary SVG paths exist if the database does not supply them. If `event.seatingMapUrl` is available, treat it as optional context, not the sole interaction surface.
4. Toolbar: one-of-many zone filter, seat-code search, zoom out/in/reset, realtime connection badge. Keyboard/focus/touch behavior must work; controls at least 44px.
5. Seat states: database `TRONG`, `DA_BAN`, `DANG_GIU`, `KHONG_MO_BAN` plus local selected state. Use color + symbol/text semantics, visible legend, useful aria labels. Unavailable seats remain readable but not selectable.
6. Selection: maximum 4, remove one, clear all, total from catalog prices, Vietnamese copy. Selection is local only; do not claim a hold until `createSeatHold` resolves.
7. Hold flow: call existing `createSeatHold`; derive countdown from returned `expiresAt`; support pending/success/conflict/error/expiry and `releaseSeatHold`; cleanup timers/subscriptions. Existing React booking modal may be reused only if truthful and compatible. Closed-sale/read-only state must prevent select/hold while still allowing exploration.
8. Subscribe with existing `subscribeToSeatUpdates`. Apply show-scoped updates to catalog, remove newly unavailable selected seats, announce the exact affected seat, and report CONNECTING/CONNECTED/DISCONNECTED/ERROR honestly. Disable hold while connection is not trusted if using live Supabase/API mode; preserve deterministic mock behavior.
9. Remove or safely disable only the seating-specific legacy runtime ownership so it cannot mutate the new React DOM. Preserve unrelated hero/pricing/navigation behavior. Delete the raw seating import/fragment use when no longer needed; do not broadly rewrite `concertRuntime.js`.
10. Responsive desktop/mobile layout and reduced-motion support. Avoid decorative gradients/glass that conflict with the Open Design Operate-mode direction; reuse existing project foundation where practical.
11. Extract pure domain helpers for grouping/filtering/selectability/selection cap/realtime reconciliation/hold countdown if that makes tests stable. Add focused tests covering key business rules and any integration contract you introduce.
12. Update relevant Sprint 1 markdown in `docs/` with the new React seat-map architecture and verification evidence. Do not copy to the parent Sprint 1 directory; GPT lead will do final synchronization after review.

## Constraints

- No fake database fields or invented server API.
- Do not weaken RLS/auth/service boundaries.
- Do not install dependencies.
- Do not commit.
- Do not erase or reformat unrelated user work.
- Keep TypeScript strict and existing public behavior intact.
- Run `npm run check` if possible and report exact results; if sandbox/process restrictions block it, report that clearly.

## Delivery

Implement the changes, inspect the diff for accidental scope, and return a concise summary of files changed, design/architecture decisions, tests run, and remaining risks.
