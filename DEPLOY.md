# One Shot — Deployment Plan

## 1. Supabase (database)

1. Go to [supabase.com](https://supabase.com) and create a new project
2. Once provisioned, open the **SQL Editor** and run:

```sql
create table scores (
  id         uuid default gen_random_uuid() primary key,
  date       date not null,
  name       text not null,
  score      int  not null,
  max_score  int  not null,
  created_at timestamptz default now()
);

create index on scores (date, score desc);

alter table scores enable row level security;

create policy "read"   on scores for select using (true);
create policy "insert" on scores for insert with check (true);
```

3. Go to **Settings → API** and copy:
   - **Project URL** (looks like `https://xxxxxxxxxxxx.supabase.co`)
   - **anon / public** key (the long `eyJ...` string)

---

## 2. Wire up credentials

Open `index.html` and replace the two placeholder values near the top:

```js
window.SUPABASE_URL      = 'https://xxxxxxxxxxxx.supabase.co';
window.SUPABASE_ANON_KEY = 'eyJ...';
```

Commit and push:

```bash
git add index.html
git commit -m "Add Supabase credentials"
git push
```

---

## 3. Cloudflare Pages (hosting)

1. Go to [pages.cloudflare.com](https://pages.cloudflare.com)
2. Click **Create** → **Connect to Git**
3. Authorise Cloudflare and select the `one-shot-game` repository
4. Set build settings:
   - **Build command**: *(leave empty)*
   - **Output directory**: `/`
5. Click **Save and Deploy**

Cloudflare will assign a `*.pages.dev` URL immediately. Every push to `master` redeploys automatically.

---

## 4. Custom domain (optional)

1. In your Cloudflare Pages project go to **Custom domains → Set up a custom domain**
2. Enter your domain (e.g. `oneshot.gg`)
3. Follow the DNS instructions — if your domain is already on Cloudflare this is one click

---

## 5. Verify it works end-to-end

- [ ] Load the live URL — game canvas renders with targets
- [ ] Play a full 3-shot round
- [ ] Submit a name — score appears in the leaderboard
- [ ] Reload — "already played today" banner appears, leaderboard loads
- [ ] Open in a second browser / incognito — your score shows on the leaderboard
- [ ] Check Supabase **Table Editor → scores** to confirm rows are being inserted

---

## Repo

[github.com/bblarney/one-shot-game](https://github.com/bblarney/one-shot-game)
