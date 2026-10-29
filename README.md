# Casanite

Gamified personal health, fitness & productivity tracker. Next.js 15 (App Router) · Tailwind v4 · shadcn/ui · Supabase · Recharts · Google Fit & Calendar APIs. Runs entirely on free tiers (Vercel Hobby + Supabase Free + Google Cloud).

## Features
- **Google-only login**, locked to `shahhtetnaing@gmail.com` (middleware + Postgres RLS on every table).
- **RPG HUD**: Level, EXP bar (10 EXP per completed task, 100 EXP per level), daily streak (resets after a missed day). EXP/level/streak are computed in Postgres (`complete_item` / `uncomplete_item` / `recompute_user_stats`).
- **Edit Mode**: add / edit / reorder / delete every group (gym day, habit list, goal set) and item (exercise, habit, diet rule, goal), including sets/reps, YouTube URL, schedule days, frequency (daily/weekly/monthly/yearly/once), times-per-period and target date.
- **Today view**: daily flexibility + today's gym day + habits/hygiene/academic, with YouTube **Tutorial** buttons.
- **Goals** (monthly / yearly), **Diet rules** widget, **Health** tab (weight, BMI, BP, heart rate — with charts and full CRUD).
- **Google Fit** widget (steps, active minutes, sleep + 7-day chart) and **Google Calendar** widget (doctor appointments, guitar class). On Saturdays before 10:00 (Asia/Singapore) the dashboard shows a guitar-class alert and fires a browser notification.

## 1. Install
```bash
git clone <this repo> casanite && cd casanite
npm install
cp .env.example .env.local   # fill in values (steps below)
```

<details><summary>How this project was scaffolded</summary>

```bash
npx create-next-app@15 casanite --ts --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm
cd casanite
npm i @supabase/supabase-js @supabase/ssr recharts googleapis lucide-react date-fns server-only
npx shadcn@latest init -d
npx shadcn@latest add card progress badge dialog input label textarea select switch tabs checkbox tooltip separator sonner alert
```
</details>

## 2. Supabase (free tier)
1. Create a project at https://supabase.com.
2. **SQL Editor** → paste [`supabase/schema.sql`](supabase/schema.sql) → Run. (Idempotent; safe to re-run.)
3. **Project Settings → API**: copy the URL and anon/publishable key into `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
4. **Authentication → URL Configuration**: Site URL = your app URL; add `http://localhost:3000/auth/callback` and `https://<your-domain>/auth/callback` to Redirect URLs.
5. **Authentication → Providers → Google**: enable and paste the Google client ID/secret from step 3.

Seed data (your full routine) is inserted automatically the first time you open the dashboard (`public.bootstrap_owner()`).

## 3. Google Cloud (free)
1. https://console.cloud.google.com → new project.
2. **APIs & Services → Library**: enable **Google Calendar API** and **Fitness API**.
3. **OAuth consent screen**: External, add yourself as a **Test user**, add scopes
   `.../auth/fitness.activity.read`, `.../auth/fitness.sleep.read`, `.../auth/calendar.readonly`.
4. **Credentials → Create OAuth client ID → Web application**. Authorized redirect URI:
   `https://<your-project-ref>.supabase.co/auth/v1/callback`.
5. Put the client ID/secret in Supabase (step 2.5) **and** in `.env.local` as `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` (server-only, used to refresh the token for Fit/Calendar).

Notes:
- While the consent screen is in **Testing**, Google refresh tokens expire after ~7 days → the widgets show **Reconnect Google**; click it (or sign out/in).
- Google has deprecated the Fitness REST API and stopped accepting new sign-ups for it; if your Cloud project can't enable it, the Fit widget will show the API error while everything else keeps working.
- Calendar matching: events whose title/location contain words like *doctor, dr, clinic, polyclinic, hospital, dental, appointment* are shown as appointments; events containing *guitar* are used for the Saturday alert. Tweak in `src/lib/config.ts`.

## 4. Run / deploy
```bash
npm run dev      # http://localhost:3000
npm run build && npm start
```
Deploy free on Vercel: import the repo, add the same env vars, then add the Vercel URL to Supabase redirect URLs.

## Data model (`supabase/schema.sql`)
| Table | Purpose |
|---|---|
| `user_stats` | level, exp, streak, longest_streak, last_active_date |
| `health_logs` | weight_kg, height_cm, **bmi** (generated), systolic, diastolic, heart_rate, notes |
| `routine_groups` | editable blocks: title, kind, frequency, days_of_week (0=Sun), color, order |
| `routines_and_goals` | editable items: title, details (sets/reps), **youtube_url**, notes, frequency/days override, target_count, target_date, is_trackable |
| `completions` | one row per completion (10 EXP), keyed by period (day/ISO week/month/year/once) |
| `google_tokens` | Google refresh token captured at sign-in |

All tables: RLS `user_id = auth.uid() AND is_owner()` (owner email check on the JWT); `anon` has no access.

## Project layout
```
supabase/schema.sql               tables, RLS, RPCs, seed routine
src/middleware.ts                 session refresh + owner-only gate
src/app/page.tsx                  dashboard (server: loads data → <Dashboard/>)
src/app/login/                    Google sign-in
src/app/auth/callback|signout     OAuth code exchange (stores Google refresh token)
src/app/api/google/fit|calendar   Google API routes
src/lib/google/                   Fit + Calendar clients
src/components/dashboard/         HUD, Edit Mode dialogs, widgets, health charts
```
