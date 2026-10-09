# ADR 0008 — RFQ command boundary

Builds on ADR 0004. Decided by the product owner, 2026-10-09.

## Context

RFQ creation writes a header, one or more lines and an audit event. Allowing browser-side inserts would risk a
partial commercial record and would bypass the required idempotency and authorization controls.

## Decision

Expose `create_rfq` as a protected PostgreSQL command. It requires the tenant sales permission, validates the
customer, line quantity/UOM/item scope and caller idempotency key, then writes all RFQ records and the audit row
in one transaction. Browser roles retain read-only table access.

## Consequences

The frontend must call the command, not insert RFQ tables directly. The command accepts a JSON line list because
an RFQ has a variable number of lines; a typed browser adapter is added with the RFQ form. Quote and sales-order
commands remain separate state-machine boundaries.
