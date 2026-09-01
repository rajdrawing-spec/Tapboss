---
name: TBOS deployment warm-up
description: Handling the interval where the published static frontend is live before the API finishes startup.
---

Critical frontend reads must retry transient network and 5xx failures long enough
to cover the production API's startup-migration window.

**Why:** During a publish, the static frontend was served roughly 25 seconds
before the API completed startup migrations. A product request made during that
window received a platform-level 500 that never reached the API logs, leaving
the page stuck until a manual retry.

**How to apply:** For essential initial page data, distinguish transient
network/5xx failures from permanent 4xx errors. Retry transient failures through
the deployment warm-up interval, while still surfacing a clear manual retry
state if the service remains unavailable.