# Atomic Shelf — Targeted Author Unsubscribe Implementation Report

Date: 2026-10-23

> Historical status: this report describes the initial implementation. Its GET-side-effect statement is superseded by `UNSUBSCRIBE-REMEDIATION-REPORT-20261023.md`; the current behavior is GET-preview-only with explicit POST suppression. This report is retained for context and is not one of the two published reports for the correction.

## Completion
- Completion: 90%
- Remaining: 10% (deployment verification and owner approvals only)

## ETA/RTA
- Remaining work is not reliably estimable: it depends on owner-side verification of the Vercel project domains/environment, production database migration approval, and secret management. No production mutation was performed.

## Scope coverage
- Public unsubscribe endpoint: Implemented and tested (`/unsubscribe`, `/api/unsubscribe`).
- Immediate suppression: Implemented via existing `applyOutreachDecision` with `UNSUBSCRIBE` reason and `unsubscribe-link` source.
- Exports/eligibility: Verified and covered by tests; suppressed contacts remain excluded from default and GMass exports.
- Dashboard: Implemented at `/unsubscribed` with search, sorting, pagination, empty/error states, CSV export, and navigation entry.
- Tests: Unit (4 files, 36 tests) and DB integration (5 files, 42 tests after remediation) passing.
- Deployment readiness: Partially verified; production URL/database not confirmed (see blockers).

## Repository state
- Repository path: `C:\Users\Administrator\Documents\GitHub\Outreach`
- Branch: `main`
- Baseline SHA: `fb087fcc7896a600a8bff914bcb8f10bcfd579ec`
- Ending SHA: `fb087fcc7896a600a8bff914bcb8f10bcfd579ec` (uncommitted working tree)
- Final worktree status: modified/untracked implementation files (see below); no application commit, push, or deploy performed. Report-only documentation commits were made on the separate report branch.

## Files created or changed
Changed:
- `prisma/schema.prisma`
- `src/lib/outreach/actions.ts`
- `src/app/api/leads/bulk/route.ts`
- `src/components/app-shell.tsx`
- `src/middleware.ts`

Created:
- `prisma/migrations/20261023100000_add_unsubscribe_source/migration.sql`
- `src/lib/unsubscribe/index.ts`
- `src/lib/unsubscribe/token.ts`
- `src/lib/unsubscribed.ts`
- `src/app/unsubscribe/route.ts`
- `src/app/api/unsubscribe/route.ts`
- `src/app/api/unsubscribed/export/route.ts`
- `src/app/unsubscribed/page.tsx`
- `tests/unit/unsubscribe-token.test.ts`
- `tests/db/unsubscribe.test.ts`
- `UNSUBSCRIBE-IMPLEMENTATION-REPORT-20261023.md`

## Migration details
- Migration: `20261023100000_add_unsubscribe_source`
- SQL:
  - `ALTER TABLE "outreach_status" ADD COLUMN "source" TEXT;`
  - `ALTER TABLE "outreach_event" ADD COLUMN "source" TEXT;`
- Applied successfully to the dedicated test database during `npm run test:db`.
- No production migration applied.

## Commands run and results
- `npm test`: 4 test files, 36 tests passed.
- `npm run test:db`: 5 test files, 42 tests passed after remediation (migration applied successfully).
- `npx tsc --noEmit`: passed.
- `npm run lint`: 2 pre-existing errors in `src/components/exports/export-panel.tsx` and `src/components/import/preview-table.tsx`; no new errors from changed files.
- `npm run build`: compiled successfully.
- `npx prisma generate`: succeeded.

## Security limitations and unresolved edge cases
- Tokens are signed using `SESSION_SECRET`; no separate unsubscribe secret is introduced. Secret rotation invalidates outstanding unsubscribe links.
- No expiry is required by default; links remain valid indefinitely unless `expiresInDays` is used.
- Superseded: the original public unsubscribe performed a state change on GET, creating a link-scanner/prefetch risk. The corrected flow uses GET only to preview and requires an explicit POST to suppress.
- Public page does not disclose whether an email exists; invalid/missing tokens return a generic message.
- Dashboard authorization relies on existing middleware plus `requireSession`; no additional role model exists (single operator account).
- CSV export is access-controlled via middleware but has no additional rate limiting.

## Production unsubscribe URL
- A real production unsubscribe URL is not configured or verified. The Vercel project is linked (`projectId: prj_hruiTY75JRVrIqVVrp4cM9gsB4Hg`), but production domains and environment variables were not accessible from this environment. Links must use the deployed Outreach application URL, not `atomic-shelf.com`, unless DNS/routing changes are approved separately.

## Remaining owner actions
- Confirm the actual production hostname for the Outreach application and ensure it is publicly reachable.
- Configure and verify production `SESSION_SECRET` (and optionally a dedicated unsubscribe secret) in Vercel.
- Apply the migration to the production database during a planned deployment.
- Approve deployment of the changed route, dashboard, and migration.
- Decide whether a branded hostname/DNS change is needed; document as a separate approval gate.
- Authorize application commit/push/deploy (not performed in this task; report-only documentation commits are separate).
