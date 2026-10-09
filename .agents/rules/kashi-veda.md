---
trigger: always_on
---

# Kashi Veda Project Rules

## Engineering Standard

Act as a senior production software engineer responsible for a real-world
application that may serve thousands of concurrent users.

Do not optimize only for "working code".
Optimize for:

- correctness
- security
- reliability
- maintainability
- concurrency safety
- scalability
- observability
- predictable failure handling
- efficient database usage
- safe retries and idempotency

Before implementing a change, think through:
1. What happens under concurrent requests?
2. What happens when the network fails?
3. What happens when the external provider is unavailable?
4. What happens when the same request is retried?
5. What happens when the operation partially succeeds?
6. Can this create duplicate financial, booking, notification, or payout effects?
7. Can this produce race conditions?
8. Can this cause unnecessary database load?
9. Can this expose sensitive data?
10. Can this fail safely without corrupting authoritative state?

Prefer simple, production-grade solutions over clever abstractions.

Do not over-engineer for hypothetical millions of users, but do not design
fragile single-user solutions either.

When choosing between two valid implementations:
- prefer the simpler one when reliability is equivalent
- prefer the more robust one when concurrency, security, data integrity,
  or failure handling materially improves
- never remove required security or correctness merely to reduce code size

Treat PostgreSQL, Supabase RLS, RPCs, queues, and external provider
boundaries as production infrastructure, not as toy/demo components.

Any change affecting payments, bookings, refunds, payouts, authentication,
authorization, personal data, or external webhooks requires an explicit
security and failure-mode review before implementation is considered complete.

## Platform Responsibilities

- React Native mobile app serves TWO user roles:
  - Customer
  - Pandit

- Next.js web application serves TWO administrative roles:
  - Admin
  - Super Admin

- Do NOT create a separate Pandit web dashboard.
- Do NOT duplicate Pandit workflows between mobile and web.
- Pandit operational workflows must be implemented in the mobile app.
- Admin and Super Admin operational workflows must be implemented in the web application.
- Shared backend logic must remain in Supabase PostgreSQL/RPCs and Edge Functions.

## Architecture

- Supabase PostgreSQL is the authoritative system of record.
- Existing database RPCs are authoritative for business-state transitions.
- Do not duplicate business logic in React Native, Next.js, or Edge Functions.
- Do not create helper/service abstractions when the existing RPC or platform
  capability already handles the operation.
- Edge Functions are for privileged operations, external providers, webhooks,
  secrets, and asynchronous integrations.
- Keep business-critical state transitions atomic.
- Prefer database-enforced integrity over client-side assumptions.
- Design externally triggered operations to be idempotent where retries are possible.
- Treat concurrent requests as normal operating conditions.
- Avoid N+1 database/API patterns and unnecessary high-frequency polling.
- Do not introduce caching unless the consistency requirements are understood.
- Do not introduce distributed infrastructure merely for theoretical scale.

## Database

- Migrations 001–018 are completed and audited.
- Do not create a new migration unless the task explicitly requires a genuine schema change.
- Do not modify migrations 001–018.
- Do not invent tables, columns, enums, indexes, policies, or business values.
- Inspect the actual current schema and RPC signatures before coding against them.

## Security

- Never expose Supabase service-role keys to clients.
- Never expose Razorpay secrets, WhatsApp credentials, LiveKit secrets, Firebase service-account credentials, or banking encryption keys.
- Never trust client-supplied prices, payment amounts, ownership, roles, or financial state.
- Preserve authorization, validation, idempotency, signature verification, and transaction safety even when reducing code.

## Payments

- Database/RPC remains authoritative for booking/payment state.
- Never recalculate authoritative booking prices inside an Edge Function if the database already calculated them.
- Razorpay webhooks must use raw-body signature verification.
- Duplicate webhooks must be harmless.
- Never create duplicate financial transactions or payouts.

## Minimalism

Use the minimum amount of code necessary for a production-grade solution.

"Minimum code" does NOT mean:
- removing validation
- removing error handling
- removing authorization
- removing idempotency
- removing observability
- ignoring concurrency
- ignoring failure recovery
- replacing robust logic with fragile shortcuts

## Workflow

Before modifying code:
1. Inspect the existing implementation.
2. Identify what already solves the problem.
3. Confirm the authoritative source of truth.
4. Make the smallest correct change.
5. Test the changed behavior.
6. Review the final diff for unnecessary code.

Never deploy or push database migrations unless explicitly instructed by the user.