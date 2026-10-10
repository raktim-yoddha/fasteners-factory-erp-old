# ADR 0006 — Fasteners Factory ERP foundation

Builds on ADR 0001, ADR 0002 and ADR 0003. Decided by the product owner, 2026-10-09.

## Context

The initial brief used the placeholder product name Fastener Factory OS and left several foundation
choices open. The owner selected the product identity, target browser/device baseline, language and static
host, and confirmed that Supabase is the complete backend. L1 needs a deliberately narrow installed-PWA
surface before business data or factory hardware workflows are introduced.

## Decision

- The product is named Fasteners Factory ERP. The historic master brief retains its original title as a
  historical design reference; active product documentation and PWA metadata use the approved name.
- The L1 interface is English-only and targets installed Chrome on Windows 11 and Android phones.
- Cloudflare Pages hosts the static Vite build. Supabase provides the backend; no custom Node backend is added.
- L1 excludes cameras, scanners, Bluetooth/USB devices and all hardware integration. Those require a future,
  separately scoped task before warehouse or shop-floor workflows use them.
- The L1 PWA caches only the app shell and shows explicit online/offline/install/update state. It performs no
  business mutation or offline write.

## Consequences

The foundation can be tested on one defined desktop/mobile browser pair without claiming support for every
device or production workflow. Cloudflare Pages preview URLs supply HTTPS for install testing, while a custom
domain and hosted Supabase project details remain open. Future device support, localization or hardware work
must be justified by discovery and recorded before implementation.

## Amendment (2026-10-10): Complete operator master-data setup

The existing Master data workspace also creates suppliers, drawing headers and work centres alongside customers,
items, warehouses and stock locations. Each action is a single RLS-protected insert validated in the browser; it
does not expose drawing-revision approval or any multi-record business transition.
