# ADR 0002 — React + Vite + TypeScript with Supabase, no Next.js

Builds on ADR 0001. Decided by the product owner, 2026-10-09.

## Context

The product is an internal, logged-in, installed app. It needs no server rendering or SEO. The owner
prefers Supabase and wants an MVP fast. The brief proposed this stack (its ADR-001, ADR-002).

## Decision

React + Vite + TypeScript (strict), Tailwind + shadcn/ui, React Router, TanStack Query, vite-plugin-pwa,
Zod. Backend is Supabase: PostgreSQL with RLS, Auth, private Storage, Realtime where justified, SQL
migrations, Edge Functions. Critical business transitions are Postgres RPC or Edge Function commands.
pnpm manages dependencies. No separate Node backend and no Next.js unless a new ADR shows a concrete need.

## Consequences

Fast MVP, one backend to run, static front-end hosting. Business logic lives in SQL and Edge
Functions, so it needs real database tests. Vendor coupling to Supabase is reduced because Supabase is
open source and self-hosting stays possible (ADR 0003). Final choice of static hosting is an open question.
