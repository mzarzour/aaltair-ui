# Altair UI

Security dashboard with Home briefings, application/repository hierarchy, aging, issue types, and owner-managed scope.

This is a source export of the existing Altair Sites application. Apiiro inventory and finding snapshots are intentionally empty. Credentials, local environment files, build output, and original Git history are excluded.

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
