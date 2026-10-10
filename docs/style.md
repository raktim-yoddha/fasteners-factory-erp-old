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
- Command failures are warning alerts beginning `Blocked because …`; they give a reason in plain English and never
  expose database error text. Success remains a separate status message.
- When offline, the operations panels are a read-only surface: all command controls are disabled and the page
  explains why. Stock and dispatch repeat that explanation beside their critical commands.

## Reusable operations patterns

- `OperationsWorkspace` provides the page header, responsive primary navigation, live-status summary, active-company
  selector and global-search placement. `RecordWorkspacePanel` provides the record header and contextual tabs.
- Use a status label with its icon and a plain-language reason; use a warning callout for blocked work, not colour
  alone. Loading, empty, unavailable and error states state what the operator can do next.
- Use the shared button and input classes for the primary action, secondary action and field controls. Tables and
  mobile summary cards are not introduced until a workflow needs the same data in both layouts.
- The current component inventory is: page header, record header, status label, blocked callout, empty/loading/error
  states, confirmation feedback, audit timeline, global-search field and result list, responsive navigation, and
  primary/secondary action controls. Confirmation sheets, filter bars, data tables and mobile summary cards remain
  later workflow-specific work.
- `Ctrl/Cmd+K`, `/` outside editable fields, and `Esc` are documented navigation shortcuts. They focus or clear
  search only; they never invoke a factory command.

## Installed-PWA behavior

- Chrome receives an install action only when the browser exposes the install event; otherwise the UI gives
  Chrome menu guidance and does not pretend the app is installed.
- An update prompt reloads only after a new service worker is ready.
- Offline caches app-shell assets only. It does not cache business data or queue writes.

## Component boundary

`src/components/ui` is the shadcn/ui primitive location. Foundation layout and PWA state components live
outside it and receive typed inputs; they do not persist data or call Supabase.
