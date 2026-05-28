# Supabase Setup — Tidelli Product Hub

Your app is now wired to Supabase for **authentication** and **shared cloud storage**
(material-inventory finishes, store inventory lists, and swatch images). Until you
run the steps below, the app still works — it just falls back to local-only storage.

Credentials are already baked into `supabase-client.js`:
- **URL:** `https://gbldyghiymrndeixptrl.supabase.co`
- **Publishable key:** `sb_publishable_…`

---

## Step 1 — Create the database tables (2 min)

1. Open your project at **supabase.com** → **SQL Editor** (left sidebar)
2. Click **New query**
3. Open `supabase-schema.sql` (in this project), copy everything, paste it in
4. Click **Run** (or Cmd/Ctrl + Enter)

You should see "Success. No rows returned." This creates:
- `profiles` — each user's name, role, and store (auto-created on signup)
- `kv_store` — finish edits / custom finishes
- `inventory_lists` — store inventory lists (with realtime sync)
- `assets` storage bucket — swatch & product images
- Row-level security so only logged-in users can read/write

---

## Step 2 — Configure auth (1 min)

1. Go to **Authentication → Providers → Email**
2. Make sure **Email** is enabled
3. **Turn OFF "Confirm email"** (Authentication → Providers → Email → uncheck
   "Confirm email") — otherwise every new teammate must click a confirmation
   link before they can log in. *(Recommended for an internal tool. Leave it on
   if you want email verification.)*

---

## Step 3 — Add your teammates (1 min each)

Since this is internal (no public signup), **you** create the accounts:

1. **Authentication → Users → Add user → Create new user**
2. Enter their **email** and a **temporary password**
3. Check **Auto Confirm User** so they can log in immediately
4. Click **Create user**

### Set their role
The trigger gives every new user the `store_user` role by default. To promote
someone (admin, super_admin, sales_rep):

1. **Table Editor → profiles**
2. Find their row, edit the **role** column to one of:
   `super_admin`, `admin`, `sales_rep`, `store_user`
3. Optionally fill in **name**, **store**, **avatar** (initials)

> Tip: To set a role at creation time instead, use **Add user** and you can
> later edit the profile row — or set role in the user's *Raw user meta data*
> as `{"role":"admin","name":"Carlos"}` and the trigger will pick it up.

---

## Step 4 — Deploy & test

1. Re-deploy to Vercel (`npx vercel --prod`)
2. **IMPORTANT — authorize your domain:** Supabase auth works from any origin by
   default, but if you enabled email confirmations, set
   **Authentication → URL Configuration → Site URL** to your Vercel URL so
   confirmation links point to the right place.
3. Open the site, log in with a real account you created. Edits to material
   inventory and store inventory lists now sync to the cloud and appear for
   every teammate.

---

## How it behaves

| Data | Storage | Shared across users? |
|---|---|---|
| Login / roles | Supabase Auth + `profiles` | ✅ |
| Material inventory (finishes, stock, swatch images) | `kv_store` + `assets` bucket | ✅ |
| Store inventory lists | `inventory_lists` (realtime) | ✅ live |
| Product catalog | Excel import (local) | ❌ sourced from file each load |

- **Demo quick-access buttons** on the login screen still work — they log you in
  locally without Supabase (handy for a quick look, but those sessions don't sync).
- If Supabase is ever unreachable, the app silently falls back to localStorage so
  it never hard-crashes.

---

## Product catalog (note)

The product catalog is still loaded from the Excel data file and its edits are
intentionally cleared on each load. If you want product edits to persist and
sync too, say the word and I'll move products into Supabase as well.
