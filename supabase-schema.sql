-- ============================================================================
-- Tidelli Product Hub — Supabase schema
-- Run this in the Supabase dashboard → SQL Editor → New query → Run.
-- Safe to re-run (uses IF NOT EXISTS / CREATE OR REPLACE).
-- ============================================================================

-- ─── 1. Profiles (extends auth.users with role + store) ─────────────────────
create table if not exists public.profiles (
  id        uuid primary key references auth.users(id) on delete cascade,
  name      text,
  email     text,
  role      text not null default 'store_user',  -- super_admin | admin | sales_rep | store_user
  store     text,
  avatar    text,
  created_at timestamptz not null default now()
);

-- Auto-create a profile row whenever a new auth user signs up.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, name, avatar, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    upper(left(coalesce(new.raw_user_meta_data->>'name', new.email), 1)),
    coalesce(new.raw_user_meta_data->>'role', 'store_user')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─── 2. Key/value store (finish overrides, custom finishes, deletions) ──────
create table if not exists public.kv_store (
  key        text primary key,
  value      jsonb,
  updated_at timestamptz not null default now()
);

-- ─── 3. Store inventory lists (one row per list) ────────────────────────────
create table if not exists public.inventory_lists (
  id         text primary key,
  data       jsonb,
  updated_at timestamptz not null default now()
);

-- ============================================================================
-- Row Level Security
-- Internal tool: any authenticated (logged-in) user can read & write shared
-- data. Profiles are readable by all authenticated users; each user can edit
-- only their own profile.
-- ============================================================================
alter table public.profiles        enable row level security;
alter table public.kv_store        enable row level security;
alter table public.inventory_lists enable row level security;

-- Profiles
drop policy if exists "profiles_read"   on public.profiles;
drop policy if exists "profiles_self_upd" on public.profiles;
create policy "profiles_read"     on public.profiles for select to authenticated using (true);
create policy "profiles_self_upd" on public.profiles for update to authenticated using (auth.uid() = id);

-- kv_store
drop policy if exists "kv_all" on public.kv_store;
create policy "kv_all" on public.kv_store for all to authenticated using (true) with check (true);

-- inventory_lists
drop policy if exists "lists_all" on public.inventory_lists;
create policy "lists_all" on public.inventory_lists for all to authenticated using (true) with check (true);

-- ─── 4. Realtime: broadcast inventory_lists changes ─────────────────────────
alter publication supabase_realtime add table public.inventory_lists;

-- ─── 5. Storage bucket for swatch / product images ──────────────────────────
insert into storage.buckets (id, name, public)
values ('assets', 'assets', true)
on conflict (id) do nothing;

-- Anyone can read images; authenticated users can upload/update/delete.
drop policy if exists "assets_read"   on storage.objects;
drop policy if exists "assets_write"  on storage.objects;
drop policy if exists "assets_update" on storage.objects;
drop policy if exists "assets_delete" on storage.objects;
create policy "assets_read"   on storage.objects for select using (bucket_id = 'assets');
create policy "assets_write"  on storage.objects for insert to authenticated with check (bucket_id = 'assets');
create policy "assets_update" on storage.objects for update to authenticated using (bucket_id = 'assets');
create policy "assets_delete" on storage.objects for delete to authenticated using (bucket_id = 'assets');
