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
npx wrangler d1 create dipo-portfolio
# copy database_id into wrangler.toml
npx wrangler d1 execute dipo-portfolio --remote --file=./schema.sql

npx wrangler secret put TURNSTILE_SECRET
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put ADMIN_TOKEN
npx wrangler secret put REACTION_SALT
npx wrangler secret put SANITY_WEBHOOK_SECRET
npx wrangler secret put GITHUB_TOKEN
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

Comments are inserted as `pending` and never rendered until approved. There is
no admin UI; use the Worker API with `ADMIN_TOKEN`:

```bash
API=https://dipo-portfolio-worker.agbooladipo624.workers.dev
TOKEN=your-admin-token

# List pending comments
curl -s "$API/api/admin/comments?status=pending" \
  -H "Authorization: Bearer $TOKEN"

# Approve or reject one
curl -s -X PATCH "$API/api/admin/comments/12" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status":"approved"}'

# Read contact submissions (also emailed via Resend)
curl -s "$API/api/admin/submissions" \
  -H "Authorization: Bearer $TOKEN"
```

Valid comment statuses: `pending`, `approved`, `rejected`. Contact submissions
are stored even if the Resend call fails, so a mail outage does not lose a lead.

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
worker/             Cloudflare Worker, D1 schema, wrangler config
public/             Favicon, manifest, touch icon; no _headers
```
