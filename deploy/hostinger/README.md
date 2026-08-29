# TAPBOSS on Hostinger

This package runs TAPBOSS as a normal Node.js application on a Hostinger VPS
or Node.js server. It does not require Replit workflows, Replit Object Storage,
Replit Connectors, or a Replit deployment.

## Before uploading

You need:

1. A Hostinger plan that permits a long-running Node.js process. A basic
   static/shared plan cannot run the API, Socket.IO, scheduled jobs, or the
   browser workspace reliably.
2. A PostgreSQL database reachable from the server. Supabase, Neon, or a
   Hostinger PostgreSQL database works. Keep the connection string private.
3. A production Clerk instance with Google sign-in enabled. Add the final
   domain as an allowed origin and configure the Clerk Frontend API proxy if
   using the included `/api/__clerk` route.
4. A Google Gemini API key for AI features and a verified Resend sending
   domain for email.
5. A LiveKit Cloud/self-hosted endpoint if meetings are enabled. Hostinger
   shared hosting is not a media server; LiveKit must run separately.
6. Chromium plus its OS libraries only if the browser-workspace feature is
   needed.

## 1. Upload and install

### Preserve existing Replit uploads before cutover

The runtime keeps the previous Replit Object Storage reader active whenever
`PRIVATE_OBJECT_DIR` exists and `OBJECT_STORAGE_DIR` is not set, so deploying
this code in Replit does not break existing files. Before moving the database
to Hostinger, stop writes, back up PostgreSQL, and run this command inside the
original Replit workspace while its object-storage sidecar is still available:

```bash
pnpm --filter @workspace/api-server run export:replit-objects -- \
  /tmp/tapboss-object-export --rewrite-db
tar -czf /tmp/tapboss-object-export.tar.gz -C /tmp tapboss-object-export
```

The exporter copies every private/public bucket object, preserves the
`/objects/...` relative layout, records SHA-256 hashes, and transactionally
rewrites any legacy `storage.googleapis.com` values in PostgreSQL text/jsonb
columns to `/objects/...`. Transfer this data archive privately; it is
deliberately not included in the source handoff archive.

After extracting the source and data archives on Hostinger:

```bash
rsync -a /path/to/tapboss-object-export/objects/ /home/your-user/tapboss-data/objects/
rsync -a /path/to/tapboss-object-export/public/ /home/your-user/tapboss-data/public/
pnpm --filter @workspace/api-server run verify:object-import -- /path/to/tapboss-object-export
```

Do not set `OBJECT_STORAGE_DIR` on the final Hostinger process until this
verification succeeds. Keep the old bucket unchanged until several restored
files have been opened from the live app.

Extract the archive into a directory such as `/home/your-user/tapboss`.
Node.js 20.6 or newer and pnpm 9 or newer are recommended. Node 20.6+
provides the built-in `--env-file=.env` support used by the included start
commands.

```bash
cd /home/your-user/tapboss
corepack enable
corepack prepare pnpm@9.15.0 --activate
pnpm install --frozen-lockfile
cp deploy/hostinger/.env.example .env
mkdir -p /home/your-user/tapboss-data/{objects,public,browser-profiles}
chmod 700 /home/your-user/tapboss-data
```

Edit `.env` with real values. `SESSION_SECRET`, database credentials, Clerk
keys, Gemini, and Resend keys must never be placed in frontend variables except
for the Clerk publishable key.

## 2. Build and initialize

```bash
pnpm run build:hostinger
```

The API runs startup migrations and seeds system roles/starter companies. Run
one application instance during first boot so migrations are not concurrent.
Back up the database before upgrades. The app keeps uploaded files under
`OBJECT_STORAGE_DIR`; back up that directory together with PostgreSQL.

## 3. Start the application

For a VPS with PM2:

```bash
npm install --global pm2
cp deploy/hostinger/ecosystem.config.cjs .
# Edit cwd and WEB_DIST_DIR in ecosystem.config.cjs.
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
```

For a Hostinger Node.js application panel, use:

- Application root: the extracted package directory
- Startup file: `artifacts/api-server/dist/index.mjs`
- Node environment: `production`
- Port: the port assigned by Hostinger (set `PORT` to that value)
- Build command: `pnpm run build:hostinger`
- Start command: `pnpm run start:hostinger` (or add Node argument
  `--env-file=.env` if the panel separates the Node arguments)

The server must have `WEB_DIST_DIR` pointing to
`artifacts/tapashub/dist/public` and must load the `.env` variables.

## 4. Domain and HTTPS

Point the domain's DNS A/AAAA record at the server. Put Nginx or Hostinger's
reverse proxy in front of Node and issue a TLS certificate with Hostinger or
Let's Encrypt. The included `nginx-tapboss.conf` proxies the complete app to
Node and preserves WebSocket upgrades, long-lived SSE streams, and uploads.

Verify:

```bash
curl -fsS https://YOUR_DOMAIN/api/healthz
```

Expected response:

```json
{"status":"ok"}
```

Do not expose port 8080 directly when Nginx/HTTPS is available. The app's
`/api/socket.io` Socket.IO path and `/api/browser/ws` browser-workspace path
must pass through the proxy with Upgrade support.

## Environment checklist

| Variable | Required | Purpose |
| --- | --- | --- |
| `NODE_ENV`, `PORT` | Yes | Production mode and Node listener port |
| `APP_URL`, `CORS_ORIGINS` | Yes | Canonical HTTPS URL and credentialed CORS |
| `SESSION_SECRET` | Yes | Signed sessions and encryption of integration credentials |
| `DATABASE_URL` or `SUPABASE_DB_URL` | Yes | PostgreSQL connection |
| `CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `VITE_CLERK_PUBLISHABLE_KEY` | Yes | Production authentication |
| `GEMINI_API_KEY` | AI features | Direct Gemini API access |
| `OBJECT_STORAGE_DIR` | Yes | Durable private uploads and generated files |
| `PUBLIC_OBJECT_DIR` | Recommended | Durable public assets |
| `RESEND_API_KEY`, `EMAIL_FROM` | Email features | Invitations and reports |
| `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` | Meetings | Live meeting rooms and tokens |
| `BROWSER_CHROMIUM_PATH`, `BROWSER_PROFILES_DIR` | Browser workspace | Optional Chromium and persistent profiles |
| `AI_PRODUCTS_ENABLED`, `AI_TASKS_ENABLED`, `LOG_LEVEL` | Optional | Feature and logging controls |

`VITE_CLERK_PUBLISHABLE_KEY` is read while building the frontend, so set it
before `pnpm run build:hostinger`. Never put any secret key in a `VITE_`
variable. The PM2 and start scripts load `.env` with Node's built-in
`--env-file` flag; Hostinger's panel can instead inject the same variables.

## Updates and backups

```bash
pm2 stop tapboss
git/rsync/upload the new release without replacing tapboss-data
pnpm install --frozen-lockfile
pnpm run build:hostinger
pm2 restart tapboss --update-env
```

Back up both the PostgreSQL database and the complete persistent data directory.
Do not delete `tapboss-data` when replacing application releases.

After each frontend upgrade, verify that `/` and a direct route such as
`/inventory` return `Cache-Control: no-cache`, while a hashed `/assets/...`
file returns `immutable`. This prevents browsers from pinning stale HTML that
references assets from a previous release.

## Troubleshooting

- `DATABASE_URL...must be set`: load `.env` through Hostinger's environment
  settings or PM2 (`dotenv` is not implicitly loaded by Node).
- Blank page: confirm `WEB_DIST_DIR` exists and that the reverse proxy does not
  rewrite `/api/*` to `index.html`.
- Login loops: use production Clerk keys, register the exact HTTPS domain, and
  verify `/api/__clerk` is reachable.
- Uploads fail: confirm `OBJECT_STORAGE_DIR` exists and is writable by the Node
  process; the directory must be outside the release folder.
- Chat/call notifications fail: preserve WebSocket Upgrade headers and route
  `/api/socket.io` to the same Node process.
- Browser workspace fails: install Chromium and required libraries or set
  `BROWSER_CHROMIUM_PATH`; this feature is optional and resource intensive.
- AI is unavailable: set a direct `GEMINI_API_KEY`, not a Replit integration
  variable, and check the Gemini account quota/model access.