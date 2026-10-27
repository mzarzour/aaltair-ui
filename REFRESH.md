# Aaltair refresh

The owner saves shared scope in Setup. Read the current live /api/refresh-config before each refresh; never use an old hard-coded app list.

Run `python3 scripts/refresh-inventory.py` from this checkout. It reads saved scope, retrieves application inventory, fetches findings with Apiiro ApplicationID filters, verifies pagination and application assignments, applies saved repository selections and any remaining legacy repository restriction, deduplicates findings, recomputes Home and Aging data plus popup details, and updates `data/dashboard.html` and the owner-only catalog. It fails before changing the snapshot for missing/ambiguous application names or a scope change during retrieval.

The source is now `data/dashboard.html`; do not edit generated dist files. Build with the Sites build helper and package/publish with the existing Site ID. Preserve the Worker, BUCKET binding, protected settings API, and hosted owner email secret. Settings survive redeploys in R2. Do not run old work/refresh_dashboard.py or work/build_aging.py.

Runtime aging columns are 0–30, 31–60, 61–90, 91–120, 121+, Unknown. SLA applies only to Critical >30 and High >60. Source matrices retain the compatible 91+ aggregate and the browser derives split columns from individual ages.

If Apiiro access fails, retain the last publication. New scope applies only after a successful publication.

Setup now saves repositorySelections: null means the full application including newly discovered repositories; an array means only those repository URLs and their monitored branches. For explicit selections, application counts and aging use the union of selected repo/branch findings. Legacy repositoryFilters remain effective until the owner saves a new tree selection. Missing selected repositories fail the refresh instead of silently broadening scope. The owner-only catalog includes all repositories.

Saved Setup selections are applied server-side to the retained snapshot on each page request. Saving reloads the page so Home, Aging, totals, and drilldowns immediately reflect the selection. New data outside the snapshot awaits refresh. Keep repositoryUrl on finding records for exact repo/branch filtering.
