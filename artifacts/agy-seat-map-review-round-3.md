# GPT review findings — React Seat Map round 3

Continue the same conversation. Fix only these remaining integration/correctness issues, add targeted tests, run `npm run check`, and do not commit.

1. **Wrong backend zone code (critical):** `handleProceedHold` currently sends `zoneCode: s.TenKhuVuc || String(s.KhuVucID)`. `CreateHoldRequest` and the existing legacy implementation expect the stable zone code (`ZoneRecord.MaKhuVuc`), not the display name. Resolve each selected seat's `KhuVucID` through the loaded catalog zones and send `MaKhuVuc`. Fail safely with an actionable message if a selected seat has no resolvable zone code; do not call `createSeatHold` with a name or numeric fallback. Add a pure helper/test or an architectural assertion proving the request uses `MaKhuVuc`.
2. **Pre-response own-hold realtime race (high):** `activeHoldRef` is populated only after `createSeatHold` resolves. A `DANG_GIU` realtime event can arrive after the DB transaction but before the RPC promise/render completes, causing the selection to be removed. Track the exact pending hold seat codes synchronously before awaiting the RPC and preserve matching `DANG_GIU` during that pending window. Clear the pending set in `finally`. If the hold fails/conflicts, reconcile from fresh catalog so a foreign hold cannot remain falsely selected.
3. **Fresh catalog reconciliation (medium):** `reconcileSelectionWithCatalog` currently pushes the old selected seat object for valid entries. Return the fresh catalog seat object so status/price/zone data is current. Add a test where price changes while the seat remains `TRONG`.
4. **Hold lifecycle cleanup (medium):** clear `heldSeatsSnapshot` when the hold expires. Also prevent duplicate release requests (disable/reject while release is pending) and keep the dialog/countdown truthful on release failure.

Re-run the full check suite and update documentation counts/evidence. Return exact files changed and any remaining risks.
