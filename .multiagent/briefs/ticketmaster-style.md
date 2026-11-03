# Design brief: Ticketmaster-style rebuild (EventTicketing)

Goal: rebuild the EXISTING features of this repo (SPEC.md) with the layout and interaction patterns that
ticketmaster.com users know. This is a style reference only.

## Hard rules
- Keep our own brand: name "EventTicketing", our logo/wordmark, our copy in Vietnamese. Never use the
  Ticketmaster name, logo, trademarks, images, fonts that require a licence, or copied text.
- Only features already in the repo (SPEC.md section 3). No new product features (no payment, no resale,
  no reviews, no favourites) unless SPEC.md section 6 asks for it.
- Database contract is frozen: supabase/, *.sql, docs/ are protected. src/services and src/types may change
  but must keep table/column/RPC names and signatures.
- Every change passes `npm run check`. Keep accessibility (labels, focus, keyboard, contrast >= 4.5:1,
  targets >= 44px on mobile) and mobile 360px+.

## Visual language (describe-only reference)
- Colour: a strong primary blue for the global header and primary buttons (e.g. #026CDF-like, pick our own
  token), white content surfaces, near-black text (#1f262d-like), light grey page background and dividers,
  one accent for prices/"from" labels. Category colours from src/domain/categoryThemes.js stay as small
  accents (chips, badges), not full-page themes.
- Type: one clean sans-serif (system or an open font such as Inter / Averta-like alternatives available on
  Google Fonts), bold large headings, compact 14-16px body.
- Shape: 4-8px radius, flat cards with subtle border or shadow, generous white space, dense info rows.

## Page patterns
1. Global header (all public pages): blue bar with wordmark left, nav links (Concerts / Sports / Arts & Theatre
   style -> our categories), "Sign in / account" right. Below it a large search block: one wide search input
   (event name or venue), optional location/date chips, prominent "Search" button.
2. Home / catalog: hero carousel or large featured card for the featured event; horizontal category tabs or
   chips with counts; result rows/cards: image, date block (DAY / MON / DD), title, venue + city, time,
   "Find tickets" button. Clear empty and loading states.
3. Event detail (EDP): compact event header (image thumbnail, title, date/time, venue, show switcher as
   date tabs). Main area split: LEFT ticket list (filters: price sort, ticket type; quantity selector;
   each row = section/tier, price, availability, select), RIGHT interactive seat map with zoom controls and
   legend. Selected seats summary + timer bar sticky at the bottom/side; hold countdown visible.
   Secondary sections (overview, lineup, venue, policies, contact) below as tabs or stacked panels.
   Mobile: map on top collapsible, ticket list below, sticky bottom bar with price + primary CTA.
4. Sign in / register: centred card on light background, tabs Sign in / Create account, large inputs,
   show/hide password, primary blue button, small legal text.
5. Organizer studio: keep a back-office look (left sidebar, top bar, stat cards, event table/cards, wizard
   with a stepper); reuse the same tokens so it feels like the same product.
