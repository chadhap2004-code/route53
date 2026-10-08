# Deployment guide

Target setup (about 20 minutes):

```
Browser ──▶ Vercel (Next.js frontend) ──/api/* rewrite──▶ Railway (FastAPI + SQLite on a volume)
```

- **Why Railway for the backend:** SQLite is a file, so the host needs a **persistent disk**. Railway volumes work on the trial and free plans (0.5 GB, far more than this app needs). Vercel functions and Render's free tier have ephemeral filesystems, so the database would be wiped.
- **Why Vercel for the frontend:** it's the native host for Next.js, free for hobby projects, and builds straight from GitHub.

---

## 1. Push the code to GitHub

```bash
cd route53-clone
git init
git add .
git commit -m "Route 53 clone: Next.js + FastAPI + SQLite"
```

On github.com, click **New repository**, name it `route53-clone`, and **don't** add a README, .gitignore or licence (the repo must be empty). Then:

```bash
git remote add origin https://github.com/<your-username>/route53-clone.git
git branch -M main
git push -u origin main
```

Check that the repo shows `backend/`, `frontend/`, `README.md` and the green **CI** check under the Actions tab.

---

## 2. Deploy the backend on Railway

1. Go to <https://railway.com>, sign in with GitHub, then **New Project → Deploy from GitHub repo** and pick `route53-clone`.
2. Open the new service, then **Settings → Source → Root Directory** → `backend`. Railway finds `backend/Dockerfile` and builds it.
3. **Variables** tab. Add:
   | Name | Value |
   |---|---|
   | `DATABASE_PATH` | `/data/route53.db` |
   | `COOKIE_SECURE` | `true` |
   | `SEED_DEMO_DATA` | `true` |
4. **Add a volume:** right-click the service on the canvas (or press `Ctrl/Cmd + K` and type "volume"), choose **Add Volume**, and set the mount path to `/data`.
5. **Settings → Networking → Generate Domain.** You get something like `https://route53-clone-production.up.railway.app`. Railway injects `PORT`, and the Dockerfile already listens on it.
6. Check that it works:
   - `https://<railway-domain>/api/health` should return `{"status":"ok"}`
   - `https://<railway-domain>/docs` should show the Swagger UI

---

## 3. Deploy the frontend on Vercel

1. Go to <https://vercel.com>, sign in with GitHub, then **Add New… → Project** and import `route53-clone`.
2. **Root Directory** → `frontend` (Vercel detects Next.js).
3. **Environment Variables:** `BACKEND_URL` = your Railway domain, e.g. `https://route53-clone-production.up.railway.app` (no trailing slash).
4. **Deploy.** Open the Vercel URL. You should land on the sign-in page with `demo` / `route53-demo` pre-filled.
5. Put the Vercel URL at the top of `README.md` and push.

> `BACKEND_URL` is used by the `/api/*` rewrite, which Next.js builds into the app. If you change it later, **redeploy** the frontend (Deployments → ⋯ → Redeploy).

---

## 4. Post-deploy checklist

- [ ] Sign in, refresh the page, and confirm you're still signed in (session persistence)
- [ ] Create a hosted zone. It opens with 2 records (NS, SOA)
- [ ] Create a record, edit it, then delete it
- [ ] Try deleting a zone with records. You should get the "still contains records" warning
- [ ] Import the sample zone file → Preview → Import
- [ ] Export as BIND
- [ ] Sign out, then open `/route53/v2/hostedzones`. You should be redirected to sign in
- [ ] Redeploy the backend and confirm your data is still there (the volume works)

---

## Alternative: no credit card, data resets (Render free)

If Railway isn't an option, Render's free web service works:

1. <https://render.com> → **New → Web Service** → pick the repo.
2. Root Directory `backend`, Runtime **Docker**, Instance type **Free**.
3. Environment: `DATABASE_PATH=/tmp/route53.db`, `COOKIE_SECURE=true`.
4. Use the Render URL as `BACKEND_URL` on Vercel.

Caveats to mention in your README: free services sleep after 15 minutes without traffic (the first request then takes about a minute), and the filesystem is ephemeral, so data resets to the seeded demo data whenever the service restarts or sleeps.

---

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Sign-in page says "Not Found" or a 404 on `/api/...` | `BACKEND_URL` was missing when Vercel built the app. Add it and redeploy. |
| Sign-in succeeds, then you're bounced back to `/login` | The cookie isn't reaching the browser. Make sure you open the **Vercel** URL (not the Railway one), and that `BACKEND_URL` starts with `https://`. |
| Railway build error about `VOLUME` | Use the Dockerfile from this repo (it has no `VOLUME` line). Add the volume through the Railway UI instead. |
| Data disappears after a redeploy | The volume isn't mounted at `/data`, or `DATABASE_PATH` doesn't point inside it. |
| `database is locked` in logs | More than one backend replica or worker is running. Keep **1 replica**: SQLite has a single writer. |
| Reviewers changed the demo data | User menu → **Reset demo data**. |

## Running it with Docker

```bash
docker compose up --build      # frontend http://localhost:3000, backend http://localhost:8000
```
