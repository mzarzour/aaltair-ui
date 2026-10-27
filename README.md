# Aaltair UI

Security dashboard with Home briefings, application/repository hierarchy, aging, issue types, and owner-managed scope.

This is a source export of the existing Aaltair Sites application. Apiiro inventory and finding snapshots are intentionally empty. Credentials, local environment files, build output, and original Git history are excluded.

## Development

Requires Node.js 22.13+ and Python 3. Run `npm ci`, then `npm run dev`. Uses Vinext, Cloudflare Workers, and an R2 binding named `BUCKET`. Owner editing requires server-side `ALTAIR_OWNER_EMAIL` and trusted Sites authentication headers. Standalone hosting must not trust client-supplied identity headers.

The hosting manifest retains the existing Site ID for authorized maintenance. GitHub is not connected to automatic deployment; pushing here does not publish the Site.

## Refresh

`python3 scripts/refresh-inventory.py` reads the existing deployed Site's saved selections and queries Apiiro using the separately authenticated CLI. It replaces the empty snapshots with real inventory. Review generated data before committing. See REFRESH.md.

## Source

- `data/dashboard.html`: UI, styling, embedded snapshot
- `public/briefing.js`: Home activity report
- `lib/project-dashboard.ts`: saved scope filtering
- `app/api/setup/route.ts`: owner-only settings
- `scripts/refresh-inventory.py`: inventory and lifecycle retrieval

## Cloud data refresh

The `Refresh Aaltair data` GitHub Actions workflow runs every five minutes and can also be dispatched manually. It claims owner-requested refreshes from Aaltair, or performs the first daily refresh at or after 07:00 America/Chicago. GitHub schedules can be delayed; this is not an exact-time guarantee. Polling consumes GitHub Actions runner minutes.

Required repository secrets: `APIIRO_API_TOKEN`, `REFRESH_RUNNER_TOKEN`, and `SITES_SERVICE_TOKEN`. The Apiiro token is sent only to app.apiiro.com. The other two credentials authenticate uploads to Aaltair. Rotate the shared runner secret in both GitHub and the Site together; update the service credential if Sites rotates it.

The runner checks saved scope, fetches open and resolved findings, and uploads a validated snapshot to the Site's R2 storage. It does not commit report data or deploy website code. Failures retain the last good snapshot. The workflow's concurrency group prevents overlapping runs. Refresh Now queues work and displays queued/running/error status; closing the browser does not cancel the job. The previous local morning automation is paused.
