# ADR 0011 — Prepared packing shipment command

Builds on ADR 0004 and ADR 0010. Decided by the product owner, 2026-10-09.

## Context

Dispatch requires packing and shipment rows tied to active reservation quantity. Exposing these mutable tables to
the browser would let callers pack unrelated sales orders or over-prepare the same reservation before dispatch.

## Decision

`prepare_packing_shipment` locks the sales order and selected reservations, validates their ownership and remaining
quantity, then creates the packed order, draft shipment, lines and audit event atomically. Dispatch remains a
separate command that posts the signed stock movement.

## Consequences

The command supports one or more reservation lines per shipment and prevents unconsumed reservation quantity from
being packed more than once. Packing confirmation is represented by the command itself for this MVP; labels and
carrier documents remain later work.

## Amendment (2026-10-10): Dispatch workspace

The dispatch workspace allows an operator to choose an open sales order, an active reservation on one of its lines,
and a matching preparation quantity. It displays only draft shipments for gate-out; commands remain the only writer.
