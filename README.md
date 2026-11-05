# dipo.dev — portfolio

Astro + Sanity + GitHub Pages portfolio for Olamidipupo “Dipo” Agboola.
Backend engineer, MBBS student in Ile-Ife, Nigeria. Built for two readers:
recruiters scanning for remote backend roles, and clients deciding whether to
hire him.

## Stack

| Layer | Choice |
| --- | --- |
| Site | Astro 5 (static output), TypeScript, Tailwind 3 |
| Content | Sanity hosted Studio (`studio/`) |
| Hosting | GitHub Pages (GitHub Actions) |
| Forms, comments, reactions | Cloudflare Worker + D1 (`worker/`) |
| Admin | Cloudflare Access + Preact SPA (`admin/`), served by the Worker |
| Spam | Cloudflare Turnstile |
| Email | Resend |
| Images | Sharp at build time, lazy modern `<img>` |
| OG cards | Generated PNGs at `/og/[slug].png` |

There is no client-side UI framework. The terminal, command palette, game,
intro, dock and forms are small vanilla islands layered on a site that works
without JavaScript. Every route is plain HTML and normal links first.

The static site is built once. Comments, reactions and the live activity strip
are fetched from the Worker after the page loads. If the Worker is down, the
page still renders; the API sections say they are offline.

## Run locally

```bash
npm install
cp .env.example .env      # optional; without Sanity the CV seed is used
npm run dev               # http://localhost:4321
npm run check             # Astro + TypeScript
npm run build             # dist/
npm run preview
```

The site builds with **no env vars at all**. Without a Sanity project it uses
`src/content/seed.ts`, which contains the verified CV facts. Projects and
experience fall back to that seed if Sanity returns an empty list; notes,
services, testimonials and gallery are Sanity-only and show honest empty states.

For a project-page base path, build and preview the real URL shape:

```bash
SITE_URL=https://yourname.github.io BASE_PATH=/your-repo npm run build
npm run preview
# open http://localhost:4321/your-repo/
```

For a custom domain or `yourname.github.io`, use `BASE_PATH=/`.

## Environment

Copy `.env.example` to `.env`. All `PUBLIC_*` values are inlined at build time.
Non-`PUBLIC_*` values are build-time only and never shipped to the browser.

| Variable | Where | Purpose |
| --- | --- | --- |
| `SITE_URL` | Build | Origin only, e.g. `https://yourname.github.io`; no repo path |
| `BASE_PATH` | Build | `/your-repo` for a project site, `/` otherwise |
| `PUBLIC_SANITY_PROJECT_ID` | Build | Enables the CMS |
| `PUBLIC_SANITY_DATASET` | Build | Defaults to `production` |
| `SANITY_API_TOKEN` | Build secret | Read token for a private dataset |
| `SANITY_PREVIEW_TOKEN` | Local `.env` only | Draft-enabled token for `astro dev` |
| `PUBLIC_API_URL` | Build | Worker origin: `https://dipo-portfolio-worker.agbooladipo624.workers.dev` |
| `PUBLIC_TURNSTILE_SITE_KEY` | Build | Shows the Turnstile widget |
| `PUBLIC_CF_ANALYTICS_TOKEN` | Build | Optional cookie-free Web Analytics |

Draft previews are local only: set a draft-enabled `SANITY_PREVIEW_TOKEN` in
`.env`, run `astro dev`, and the CMS is queried with `previewDrafts`. That token
is ignored by production builds and must never be added to GitHub Actions.
GitHub Pages has no server-side draft preview.

## Sanity Studio

Hosted Studio: https://dipo-portfolio.sanity.studio/

```bash
cd studio
npm install
cp .env.example .env
# set SANITY_STUDIO_PROJECT_ID and SANITY_STUDIO_DATASET
npm run dev               # local Studio at http://localhost:3333
npx sanity login
npx sanity deploy         # hosted at <name>.sanity.studio
```

Create the project and dataset first at [sanity.io/manage](https://www.sanity.io/manage)
(dataset `production`, public read is simplest). For a private dataset, create
a read-only API token and set `SANITY_API_TOKEN` in GitHub secrets.

Seed the project and experience from the CV fallback:

```bash
cd studio
npx sanity dataset import seed.ndjson production
```

`seed.ndjson` contains only the site settings, four projects and four roles.
It does **not** invent posts, services or testimonials. Import it once, then
edit every `[PLACEHOLDER]` field in Studio.

Keep images, mascot art and any audio in Sanity. They are served from Sanity's
asset CDN, which keeps this repository and the Pages artifact small. Do not
commit large media files.

## GitHub Pages setup (one time)

1. Push this repository to GitHub. The workflow assumes the default branch is
   `main`.
2. **Settings → Pages → Build and deployment → Source: GitHub Actions.**
3. **Settings → Secrets and variables → Actions → Variables:** add
   `SANITY_PROJECT_ID`, `SANITY_DATASET` (`production`), `PUBLIC_API_URL`,
   `PUBLIC_TURNSTILE_SITE_KEY`.
4. **Secrets:** add `SANITY_API_TOKEN` only if the dataset is private. Never
   put it in a variable or in the repo.
5. Optional variables: `SITE_URL` (custom domain origin), `BASE_PATH`
   (normally leave unset so the workflow derives `/repo` or `/`), and
   `PUBLIC_CF_ANALYTICS_TOKEN`.
6. Run **Actions → Deploy to GitHub Pages → Run workflow** once, or push to
   `main`.

For a custom domain, add `public/CNAME` containing the domain, set
`SITE_URL=https://your-domain` and `BASE_PATH=/`, and configure the DNS record
in **Settings → Pages**. The workflow writes `dist/CNAME` because Astro copies
`public/`.

The workflow runs on `push` to `main`, `workflow_dispatch`, a daily cron, and
`repository_dispatch` with type `sanity-publish`. It caches npm and the Astro
build cache under `.astro` and `node_modules/.vite`; it does not cache `dist`.

## Publish from Sanity without touching code

The static site cannot read drafts at request time, so a publish must trigger a
new build:

```
Sanity publish
  → Sanity webhook (signed)
  → Worker POST /rebuild
  → GitHub repository_dispatch: sanity-publish
  → GitHub Actions build
  → GitHub Pages deploy
```

### Worker setup

```bash
cd worker
npm install
npx wrangler d1 create dipo
# copy database_id into wrangler.toml; the binding is DB
npm run db:migrate:remote

npx wrangler secret put TURNSTILE_SECRET
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put REACTION_SALT
npx wrangler secret put SANITY_WEBHOOK_SECRET
npx wrangler secret put GITHUB_TOKEN

cd ../admin
npm ci
npm run build
cd ../worker
npx wrangler deploy
```

Edit `[vars]` in `worker/wrangler.toml` first:

- `ALLOWED_ORIGINS` — comma-separated **origins** only:
  `https://olamidipupo-favour.github.io,http://localhost:4321`. Do not include
  the repo path. Add a custom domain if you use one.
- `TURNSTILE_HOSTNAMES` — hostnames accepted from Siteverify:
  `olamidipupo-favour.github.io,studara.name.ng`. Never add `localhost` to the
  deployed Worker; use `worker/.dev.vars` for local overrides.
- `GITHUB_REPO` — `owner/repo`, e.g.
  `olamidipupo-favour/Olamidipupo-favour.github.io`.
- `CONTACT_TO` / `CONTACT_FROM` — verified Resend sender.
- `ADMIN_ORIGIN` — the admin hostname on a zone in your Cloudflare account,
  e.g. `https://dipo-admin.studara.name.ng`. The admin SPA and admin API are
  same-origin; do not point this at the GitHub Pages site or at `workers.dev`
  (Access cannot hold a session there).
- `ADMIN_EMAIL` — the single email allowed into the admin UI.
- `CF_ACCESS_TEAM_DOMAIN` — your Access team domain, e.g.
  `https://zeus32.cloudflareaccess.com`.
- `CF_ACCESS_AUD` — the Access application audience tag for the Worker
  `/admin` app. Copy it from Zero Trust → Access → Applications.

`GITHUB_TOKEN` is a fine-grained GitHub token with **Contents: read and write**
for this repository only. It is stored as a Worker secret, never in Sanity and
never in this repo. The Worker verifies `sanity-webhook-signature` using
`SANITY_WEBHOOK_SECRET`, rate-limits rebuilds per IP, then calls GitHub's
`/repos/{owner}/{repo}/dispatches` endpoint.

### Sanity webhook

In **Sanity Manage → API → Webhooks → Create webhook**:

- URL: `https://dipo-portfolio-worker.agbooladipo624.workers.dev/rebuild`
- Method: `POST`
- Dataset: `production`
- Trigger on: **Create, update, delete**
- Filter:
  `_type in ["project", "post", "service", "testimonial", "interest", "siteSettings", "experience", "galleryItem"]`
- Secret: the same value as `SANITY_WEBHOOK_SECRET`
- API version: current stable version
- HTTP headers: leave defaults; Sanity sends `sanity-webhook-signature`

The Worker accepts a valid signed request within five minutes, allows three
requests per IP per ten minutes, and returns `202` after GitHub accepts the
dispatch. Missing secrets return `503`; bad signatures return `401`.

### From your phone

Open the deployed Studio (`<name>.sanity.studio`), edit or publish a project,
note or gallery item, and press **Publish**. Sanity calls the Worker, the
Worker dispatches GitHub, and the Actions run rebuilds and deploys. No code
change and no local machine are needed.

If a webhook is missed, the daily cron is the fallback. You can also open
**Actions → Deploy to GitHub Pages → Run workflow**.

### End-to-end publish checklist

1. Publish a small test note in Studio.
2. Sanity → Webhooks → delivery log shows `202` from `/rebuild`.
3. GitHub Actions shows a run started by `repository_dispatch`
   (`sanity-publish`), not a push.
4. The build job succeeds and the `deploy` job finishes green.
5. Open the Pages URL and confirm the note appears in `/notes/` and its detail
   page. Hard-refresh to bypass the CDN cache.
6. Open a note detail page and confirm approved comments/reactions load from
   the Worker. If they do not, check `PUBLIC_API_URL` and `ALLOWED_ORIGINS`.
7. Delete or unpublish the test note, repeat, and confirm it disappears.

## Admin

The admin UI is a separate Preact + Vite SPA in `admin/`. It is never part of
the GitHub Pages build. The Worker serves its built files at `/admin/` and
serves the admin API under the same path, so the page and the API share one
Cloudflare Access session.

```
https://dipo-admin.studara.name.ng/admin/
```

The admin hostname must be on a zone in your Cloudflare account. Cloudflare
Access does not support `workers.dev` hostnames (it is not a zone), so protecting
`/admin` there redirects between the login page and the app forever. The Worker
still answers the public API on `workers.dev`; old `/admin` links there return a
`308` to the admin host.

### Cloudflare Access (one time)

Create **one** Access self-hosted application. Do not create a second app for a
separate admin hostname; cross-site Access cookies are unreliable and the SPA
is intentionally same-origin.

1. Zero Trust → Access → Applications → **Add an application** → Self-hosted.
2. Name: `Dipo Portfolio Admin`.
3. Domain: `dipo-admin.studara.name.ng`, no path, so the whole host is private.
4. Session duration: `24 hours`.
5. Add an **Allow** policy with **Emails** = `agbooladipo624@gmail.com`
   (change `ADMIN_EMAIL` if you use another address).
6. Enable the one-time PIN identity provider (or your preferred IdP).
7. If the dashboard offers **Bypass options for preflight requests**, enable it.
   The admin API is same-origin, but this keeps `OPTIONS` requests simple.
8. Copy the application **Audience (AUD)** tag into the Worker `CF_ACCESS_AUD`
   variable. Set `CF_ACCESS_TEAM_DOMAIN` to
   `https://zeus32.cloudflareaccess.com`.

The Worker also checks the JWT itself. It fetches the team JWKS, verifies the
RS256 signature, issuer, audience, `exp`/`nbf`/`iat`, and requires the email to
match `ADMIN_EMAIL`. Missing config fails closed with `503`; missing or invalid
tokens return `401`/`403`. Admin requests are rate-limited and audit-logged, and
the admin CSP is a strict same-origin policy.

### Build and deploy

```bash
cd admin
npm ci
npm run build          # emits dist/admin/* and dist/_headers
cd ../worker
npx wrangler deploy    # uploads admin/dist as Worker assets
```

`admin/package.json` moves the Vite output under `dist/admin/` so the SPA is
not accidentally served at the Worker root. `admin/dist` is generated and
git-ignored.

### Admin features

- Overview counts, pending comments, unread messages, latest activity.
- Comment moderation: approve, reject, spam, delete, bulk actions, blocklist.
- Contact messages: read/unread, archive, delete, CSV export.
- Reactions, live activity, site status, GitHub rebuild trigger.
- Settings: comment auto-approve (off by default).
- 20-row pagination, optimistic updates with rollback, mobile-first dark theme.
- Keyboard shortcuts on the comments page: `a` approve, `r` reject, `j`/`k`
  move, `d` delete.
- Access-session expiry wall with a same-origin sign-in link.

### Admin verification checklist

Run these from a machine without an Access session:

```bash
API=https://dipo-portfolio-worker.agbooladipo624.workers.dev

# 1. Unauthenticated admin requests are rejected (302 to Access login).
curl -sI "$API/admin" | head -n 5
curl -sI "$API/admin/session" | head -n 5

# 2. The SPA assets are protected too.
curl -sI "$API/admin/assets/" | head -n 5

# 3. The Worker root does not serve the admin SPA.
curl -sI "$API/" | head -n 5          # expect 404, not the admin HTML

# 4. Public API stays public.
curl -s "$API/api/health"             # {"ok":true}
```

Then sign in with the allowed email:

1. Open `.../admin/` and complete the Access login.
2. Confirm the overview loads and the session email is `ADMIN_EMAIL`.
3. Approve a pending comment, then open the public post and confirm it appears.
4. Reject another comment and confirm it does **not** appear publicly.
5. Sign in with a different email in a private window and confirm Access denies
   it before the Worker is reached.
6. Check the response headers on `/admin/` include `Content-Security-Policy`.

## Turnstile and CORS

The existing widget allows `localhost`, `127.0.0.1`,
`olamidipupo-favour.github.io`, and `studara.name.ng`. Put the **site key** in
`PUBLIC_TURNSTILE_SITE_KEY` and the **secret** in the Worker via
`wrangler secret put TURNSTILE_SECRET`.

The Worker refuses comment/contact writes without a valid Turnstile token, and
checks the token action (`comment` or `contact`) and hostname against
`TURNSTILE_HOSTNAMES`. It also rate-limits writes and hashes IP addresses; raw
IPs are never stored. CORS is restricted to the exact origins in
`ALLOWED_ORIGINS`; the GitHub Pages origin has no repo path.

For local Worker testing, copy `worker/.dev.vars.example` to
`worker/.dev.vars` so `localhost` and `127.0.0.1` are accepted locally only.

## What GitHub Pages cannot do

There are no custom response headers. The site adds a `referrer` meta tag and
keeps all runtime traffic on HTTPS, but HSTS, `X-Frame-Options`,
`frame-ancestors`, `Permissions-Policy` and per-asset `Cache-Control` are not
available on Pages. Do not add `public/_headers`; it will not be served.

There is no server-side redirect layer. This site has no redirects, and the
generated root `404.html` is the terminal “command not found” page. GitHub Pages
serves it automatically.

## Moderation

Comments are inserted as `pending` and never rendered until approved. The
public comment query only selects `approved` rows, so `pending`, `rejected`,
and `spam` comments cannot leak through the API.

Use the admin UI at `.../admin/` for moderation. Valid statuses are `pending`,
`approved`, `rejected`, and `spam`. The Worker also scans new comments against
the `blocklist`; blocked content is stored as `spam`.

Contact submissions are stored even if the Resend call fails, so a mail outage
does not lose a lead. They are available in the admin Messages page and via
CSV export. The daily GitHub Actions cron remains the fallback if a Sanity
webhook is missed.

## Content rules

- Only verified CV facts are in `src/content/seed.ts`. Do not add clients,
  quotes, metrics or awards that are not real.
- Anything missing is marked `[PLACEHOLDER …]` and is visible as such. Replace
  it in Studio; the site does not invent case-study prose.
- Services and testimonials start empty. The testimonial section shows an
  explicit non-testimonial callout instead of a fake quote.
- No phone number or home address anywhere. The contact form is the only
  inbound path, and the public CV must be a new PDF checked for both.
- The avatar is a pixel-art placeholder. Replace it with a real photo in
  Site settings when available. Mascot art is optional and must be supplied.
- Location is city/country only: `Ile-Ife, Nigeria`.

## Deferred on purpose

`/lab` and the Off-duty interests content model were explicitly postponed until
after launch. Nothing in the core site links to them. Add them only when there
is real content to publish.

## Project map

```
.github/workflows/  GitHub Pages build and deploy
src/
  components/       Header, footer, cards, terminal, game, forms, palette…
  content/seed.ts   CV fallback content
  layouts/          BaseLayout
  lib/              Sanity queries, Portable Text, client helpers
  pages/            All routes, RSS, robots, OG endpoint
  styles/           Theme tokens and component CSS
studio/             Hosted Sanity Studio + schemas + seed import
admin/              Preact + Vite admin SPA; built into worker assets
worker/             Cloudflare Worker, D1 migrations, wrangler config
public/             Favicon, manifest, touch icon; no _headers
```
