# ADR 0003 — Installed PWA for Windows and Android, cloud-first, online-only critical writes

Builds on ADR 0002. Decided by the product owner, 2026-10-09.

## Context

The MVP targets Windows and Android. The owner asked whether a factory Wi-Fi network could replace
the cloud. It can: Supabase can be self-hosted on a factory PC, so the system would keep working with
no internet. But browsers only allow PWA install, service workers and camera barcode scanning on
HTTPS, so a LAN server needs a local certificate installed on every device, plus backups, updates
and a UPS run by the factory. The owner reports the floor has reliable internet.

## Decision

- Plan A for the MVP: hosted Supabase and a static PWA host. The factory Wi-Fi only provides internet.
- Windows uses the installed PWA in Edge or Chrome; Android uses the installed PWA in Chrome. iOS is
  out of scope. Install is a convenience, never a security control; authorization is server-side.
- Critical writes (stock, QC, job close, dispatch) are online-only. Offline gives the app shell, cached
  read-only screens and labelled local drafts. No queued offline writes in the MVP.
- Plan B (self-hosted Supabase on a factory LAN with local HTTPS) is the revisit path if pilots show
  unreliable internet. Keep all migrations and Edge Functions free of cloud-only features so Plan B
  stays a hosting change. Switching requires a new ADR.

## Consequences

Least work and no server for the factory to maintain. A long internet outage stops stock, QC and
dispatch entry; the UI must say so plainly. Hosted data region and cost are open questions.
