# Known Limitations And Deferred Items

Release target: Aethina SMS Phase One - Client Acceptance and Pilot Release.

## Accepted Phase One Limitations

- Advanced push notification infrastructure is deferred.
- Advanced SMS/email retry monitoring is deferred.
- Complex DataTable resizing and customization is deferred.
- Advanced analytics is deferred.
- New modules outside the accepted school workflow are deferred.
- Complete offline support across every module is deferred.
- Perfect PDF generation for every report is deferred.
- Nonessential exports are deferred.
- Browser print is the Phase One output path for receipts, invoices/statements, report cards, and financial summaries.
- Hosted data must not be seeded or reset without explicit approval and a backup.

## Pilot Risks To Watch

- Multi-school production tenancy is functional for scoped pilot flows, but real multi-client onboarding still needs a dedicated hardening pass.
- Offline receipt numbers are provisional until sync assigns the authoritative server receipt number.
- Restore rehearsals must remain local/disposable until a production backup policy is approved.
- The demo dataset is fictional and must not be mixed with real Satelite onboarding data.

## Deferred Backlog

| Priority | Item | Reason |
| --- | --- | --- |
| P1 | Dedicated PDF templates for every official output | Browser print is sufficient for acceptance; PDF polish can follow pilot feedback. |
| P1 | Production backup automation | Manual procedure is documented for pilot; automation needs hosting decisions. |
| P2 | Advanced analytics dashboards | Not required for client acceptance. |
| P2 | Notification retry monitoring | Core notification visibility exists; retry operations are post-pilot. |
| P2 | Full offline coverage for every module | Phase One protects critical sync paths; broad offline coverage is larger than this release. |
| P2 | Table resizing/custom saved views | UI tables are standardized enough for pilot workflows. |
