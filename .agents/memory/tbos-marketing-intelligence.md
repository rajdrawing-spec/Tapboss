---
name: TBOS marketing intelligence phase
description: Ad-platform sync, daily metrics, and PDF report design decisions
---
- Daily ad metrics live in campaign_daily_metrics, deduped by (campaign_id, date, source); campaign lifetime totals are RECOMPUTED from daily rows after each sync — never hand-edit both.
- Timeseries ROAS must use aligned daily spend + daily platform-attributed revenue, never whole-company order revenue. **Why:** mixing sources overstates ROAS (architect flagged).
- Approved PDF reports are stored payload snapshots; the client download endpoint must re-apply CURRENT visibility via redactReportPayload, or later-hidden metrics leak through old reports.
- Meta connects via a pasted long-lived System User token (validated by listing /me/adaccounts) — no OAuth redirect needed; token stored AES-256-GCM via credential-store helpers as `iv:cipherhex`.
- Sync scheduler: node-cron `0 8,12,16,20 * * *` Asia/Kolkata; Meta code 190 → mark connection expired and abort; codes 4/17/32/613 → backoff retry.
- pdfkit bundling: api-server esbuild bundle needs `@swc/helpers` as a dependency (fontkit/brotli requires it at runtime) or the server crashes on start.
- Client portal UI must render financial columns/series conditionally on field presence — the server strips hidden metrics, so unconditional columns show NaN.
