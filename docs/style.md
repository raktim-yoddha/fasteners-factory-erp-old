# Style

Explains visual decisions; rules live in `AGENTS.md`. **DESIGN PROPOSAL** until real operators validate it.

## Foundation

- Quiet industrial operations interface: slate panels, high-contrast text and safety orange focus rings.
- Status always includes an icon and text. Online is not a claim that an operation succeeded; offline states
  say `Offline — read-only shell`.
- Minimum interactive target is 44px. Keyboard focus is visible and every action uses a semantic button.
- The shell supports 320px-wide Android screens through desktop widths without horizontal scrolling.
- The initial app is English-only, light theme and uses system UI fonts. No user preference is stored yet.
- The signed-in workspace uses a compact desktop side navigation that turns into a horizontal touch-safe list on
  phone widths. It never labels unavailable records as sample operational data.

## Installed-PWA behavior

- Chrome receives an install action only when the browser exposes the install event; otherwise the UI gives
  Chrome menu guidance and does not pretend the app is installed.
- An update prompt reloads only after a new service worker is ready.
- Offline caches app-shell assets only. It does not cache business data or queue writes.

## Component boundary

`src/components/ui` is the shadcn/ui primitive location. Foundation layout and PWA state components live
outside it and receive typed inputs; they do not persist data or call Supabase.
