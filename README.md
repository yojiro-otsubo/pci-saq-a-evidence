# PCI SAQ-A Evidence (MVP)

SAQ-A / eCommerce向けに、決済導線ページの継続チェック（script台帳・差分検知）と Evidence Pack（証跡ZIP）生成を行うMVPです。

## Stack

- Next.js (App Router) / React
- Supabase (Auth + Postgres + Storage + RLS)
- Trigger.dev (scheduled jobs)
- Playwright + Cheerio (page fetch & script extraction)
- Resend (email notification)
- Sentry (error monitoring)
- Zod (validation)

## MVP Policy

- Self-signup: **Not supported** (招待制 / 営業・運用がアカウント作成)
- Storage buckets: **private**
- Org boundary: DB RLS + Storage RLS

---

## Getting Started

### 1) Install

```bash
pnpm i
# or
npm i
```

### 2) Environment Variables

Create `.env.local`:

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Trigger.dev (if used)
TRIGGER_SECRET_KEY=
TRIGGER_API_URL=

# Resend (if used)
RESEND_API_KEY=

# Sentry (optional)
SENTRY_AUTH_TOKEN=
```

> Notes:
> - `SUPABASE_SERVICE_ROLE_KEY` は **サーバー側のみ**で使用してください（クライアントに露出させない）。
> - `NEXT_PUBLIC_*` はブラウザに露出します。

### 3) Run dev server

```bash
pnpm dev
# http://localhost:3000
```

---

## Supabase Setup (MVP)

### 1) Tables

MVP tables:

- `orgs`
- `users`
- `sites`
- `site_urls`
- `scan_runs`
- `scripts`
- `script_versions`
- `diff_events`
- `evidence_packs`
- `audit_logs`

### 2) RLS

- All tables: RLS enabled
- Org boundary: `current_org_id()` / `current_role()` を利用
- Role model: `owner | admin | viewer`

> 本番では `users` 周りのポリシー循環や更新権限を必ず精査してください。  
> MVPでは「招待制 + service_roleで初期作成」を前提にしています。

### 3) Storage Buckets (private)

Create buckets in Supabase Dashboard:

- `evidence-packs` (**private**)
- `screenshots` (**private**)

#### Path convention (important)

- Evidence ZIP:  
  `org/<orgId>/site/<siteId>/packs/<packId>.zip`
- Screenshots:  
  `org/<orgId>/site/<siteId>/runs/<runId>/<timestamp>.png`

Storage RLS policies rely on this path convention.

---

## Auth (Invite-only)

This MVP does not provide a signup page.

Operational flow:

1. Create `orgs` / `users` using `service_role` (or admin tooling).
2. User logs in via `/login` with email/password.
3. Logged-in users are redirected to `/app`.

---

## Jobs (Trigger.dev)

Typical jobs:

- Scheduled scan (cron)
- On-demand scan
- Evidence pack generation
- Optional notifications (Resend)

> Trigger.dev の導入がまだの場合は、まずUI + on-demand scan を先に通してから追加するのがおすすめです。

---

## Development Notes

### Playwright

Playwright is used to fetch pages (including JS-rendered content), then Cheerio parses HTML to extract scripts.

If Playwright browsers are missing, install them:

```bash
npx playwright install
```

### CSS type workaround

If TypeScript complains about `import "./globals.css"` in `layout.tsx`,  
a temporary workaround can be:

```ts
declare module "*.css";
```

(Prefer fixing file placement / tsconfig when possible.)

---

## Scripts

```bash
pnpm dev
pnpm build
pnpm start
pnpm lint
```

---

## License

Private / MVP.