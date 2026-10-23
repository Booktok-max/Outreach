# Atomic Shelf — Unsubscribe Remediation Report

Date: 2026-10-23

## Summary

The public unsubscribe GET route no longer mutates suppression state. GET validates the signed token and renders a confirmation form; POST performs the unsubscribe. The API GET is non-mutating, and POST supports browser confirmation and RFC 8058-style provider one-click unsubscribe using the token in the URL. GET-side-effect risk is resolved. Regression tests cover both GET non-mutation and POST suppression.

## Behavioral outcome

- Browser GET `/unsubscribe?token=...`: validates token, renders confirmation form, does not suppress.
- Browser POST `/unsubscribe`: suppresses intended contact and renders result page.
- API GET `/api/unsubscribe?token=...`: validates token, returns `{ ok: true, valid: true }`, does not suppress.
- API POST `/api/unsubscribe?token=...`: suppresses intended contact; accepts empty or `List-Unsubscribe=One-Click` body for provider one-click.
- Invalid, expired, malformed, and tampered tokens are rejected.
- Repeated POST requests are idempotent at state level and preserve audit history.

## Email integration boundary

This application does not generate or send email and has no SMTP/mail provider integration. Unsubscribe headers must be added by the external email platform that sends outreach, using the application's signed unsubscribe URL. The endpoint is compatible with RFC 8058 one-click POST.

## Resolved open defect (2026-10-23)

The dashboard CSV export has been corrected. The previous mechanism was:

- `/api/unsubscribed/export` requested `pageSize: 5000`.
- The shared `listUnsubscribedContacts` path clamped `pageSize` through `MAX_PAGE_SIZE = 200`.
- Exports with more than 200 matching suppressed contacts silently omitted records.

The correction implements a dedicated export query (`fetchUnsubscribedContactsForExport`) that:

- Batches matching suppressed contacts in stable, idempotent pages of 500 rows.
- Continues looping until the result set is exhausted; no silent 200-row cap.
- Respects the active search filter and optionally accepts a sort parameter; if a non-default sort is supplied by the dashboard it is forwarded into the export.
- Uses a stable `orderBy` that includes the unique `id` as a tie-break, keeping cursor-based batches deterministic.
- Retains the dashboard pagination at 200 rows for the UI; the export path does not apply that cap.
- Returns a safe 500 response if the database fails, without a partial CSV.
- Enforces server-side session validation before any data is read.

Regression test evidence confirms:

- Exports with 620 matching contacts are complete (no truncation).
- Search filter applied to the whole export set.
- Empty results produce a valid header-only CSV.
- CSV escaping and formula-injection protection work correctly.
- Unauthorized and invalid-session requests are rejected before data is read.
- Database failure returns 500 without partial data.
- Suppressed contacts are excluded from default and GMass export scopes.

The two release reports (remediation and release readiness) were reconciled and published on `report/unsubscribe-release-readiness-20261023`; this section replaces the earlier "Related open defect" note with the verified correction and test results.

## Tests executed

Re-run on 2026-10-23 after the correction:

- `npm test`: passed, 4 files, 36 tests.
- `npm run test:db`: passed, 5 files, 42 tests, including 12 unsubscribe-flow tests. The run found two migrations and no pending migrations.
- `npx tsc --noEmit`: passed (exit 0, no diagnostics).
- `npm run build`: passed.
- `npm run lint`: 2 pre-existing unrelated errors; no new errors from implementation.
- Focused database export tests: 7 tests, all passed, including completeness, filtering, empty results, escaping, authorization, DB failure, and suppression exclusion.
- The earlier targeted unsubscribe run (12 tests) and the earlier full DB run (38 tests, before the three remediation tests were added) are historical; the current full-suite count is 42.

## Git and publication

- Application implementation remains uncommitted.
- Report-only publication branch: `report/unsubscribe-release-readiness-20261023`.
- Historical report publication commit: `1566bdb87fbeeca1f2d887186e5d8f0cf782d6a8`.
- Current corrected-report publication commit: `d53128aead594285abf21a23b9f3224bb092db2c`.
- The two reports were fetched from the branch after publication and verified with HTTP 200; the published text contains the corrected GET/POST behavior and marks production as unverified.
- No production mutation, deployment, migration, or DNS change occurred.