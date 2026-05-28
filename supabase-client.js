// Tidelli Product Hub — Supabase integration layer
// Plain JS, loaded AFTER the supabase-js SDK and BEFORE the data layer / app.
//
// Exposes:
//   window.SB_ENABLED  — true when the client initialized successfully
//   window.sb          — the raw Supabase client
//   window.SB          — high-level helpers (auth / kv / lists / storage)
//
// Design:
//   • Finish edits (material inventory) are mirrored to a `kv_store` table as
//     JSON blobs via a write-through patch on localStorage.setItem — no
//     component code needs to change.
//   • Store inventory lists live one-row-per-list in `inventory_lists` with a
//     realtime subscription, so multiple users editing different lists don't
//     clobber each other.
//   • Swatch / product images upload to the `assets` storage bucket.

(function () {
  const SUPABASE_URL = 'https://gbldyghiymrndeixptrl.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_2YMzN7phnUC-jtch8u_wgQ_kyJAFI-H';

  if (!window.supabase || !window.supabase.createClient) {
    console.warn('[SB] supabase-js SDK not loaded — running in local-only mode.');
    window.SB_ENABLED = false;
    return;
  }

  const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
  window.sb = sb;
  window.SB_ENABLED = true;

  // localStorage keys that should be mirrored to the cloud kv_store table.
  // (Product overrides are intentionally excluded — they're wiped each load
  //  because the catalog is sourced from the Excel import.)
  const SYNC_KEYS = new Set(['finishOverrides', 'customFinishes', 'deletedFinishIds']);

  // ── Write-through: mirror selected localStorage writes to kv_store ──
  const _origSet = localStorage.setItem.bind(localStorage);
  localStorage.setItem = function (key, value) {
    _origSet(key, value);
    try {
      if (window.SB_ENABLED && !SB._restoring && SYNC_KEYS.has(key)) {
        SB.kvSet(key, value);
      }
    } catch (e) { /* never let sync break a local write */ }
  };

  const nowIso = () => new Date().toISOString();

  const SB = {
    _restoring: false,

    // ───────────────────────── Auth ─────────────────────────
    async signIn(email, password) {
      return sb.auth.signInWithPassword({ email: (email || '').trim(), password });
    },
    async signOut() {
      try { return await sb.auth.signOut(); } catch (e) { return null; }
    },
    async getSession() {
      try { const { data } = await sb.auth.getSession(); return data.session; }
      catch (e) { return null; }
    },
    onAuthChange(cb) {
      return sb.auth.onAuthStateChange((_event, session) => cb(session, _event));
    },
    async loadProfile(userId) {
      if (!userId) return null;
      try {
        const { data, error } = await sb.from('profiles').select('*').eq('id', userId).maybeSingle();
        if (error) return null;
        return data || null;
      } catch (e) { return null; }
    },

    // ───────────────────────── KV blobs ─────────────────────────
    async kvSet(key, valueStrOrObj) {
      const value = typeof valueStrOrObj === 'string'
        ? safeParse(valueStrOrObj)
        : valueStrOrObj;
      try {
        return await sb.from('kv_store').upsert({ key, value, updated_at: nowIso() });
      } catch (e) { return null; }
    },
    async kvGetAll() {
      const out = {};
      try {
        const { data } = await sb.from('kv_store').select('key,value');
        (data || []).forEach((r) => { out[r.key] = r.value; });
      } catch (e) { /* ignore */ }
      return out;
    },

    // ─────────────────── Inventory lists (per-row) ───────────────────
    async listsGetAll() {
      try {
        const { data, error } = await sb
          .from('inventory_lists')
          .select('id,data,updated_at')
          .order('updated_at', { ascending: false });
        if (error) return null;
        return (data || []).map((r) => ({ id: r.id, ...(r.data || {}) }));
      } catch (e) { return null; }
    },
    async listUpsert(list) {
      const { id, ...data } = list;
      try {
        return await sb.from('inventory_lists').upsert({ id, data, updated_at: nowIso() });
      } catch (e) { return null; }
    },
    async listDelete(id) {
      try { return await sb.from('inventory_lists').delete().eq('id', id); }
      catch (e) { return null; }
    },
    subscribeLists(onChange) {
      let ch;
      try {
        ch = sb.channel('inv-lists-rt')
          .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory_lists' }, () => onChange())
          .subscribe();
      } catch (e) { return () => {}; }
      return () => { try { sb.removeChannel(ch); } catch (e) {} };
    },

    // ───────────────────────── Storage ─────────────────────────
    async uploadImage(file, folder) {
      const ext = (file.name && file.name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '') || 'png';
      const path = (folder || 'swatches') + '/' + Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '.' + ext;
      const { error } = await sb.storage.from('assets').upload(path, file, {
        upsert: true, contentType: file.type || 'image/png',
      });
      if (error) throw error;
      const { data } = sb.storage.from('assets').getPublicUrl(path);
      return data.publicUrl;
    },
  };

  function safeParse(s) { try { return JSON.parse(s); } catch (e) { return s; } }

  window.SB = SB;
  console.log('[SB] Supabase client ready →', SUPABASE_URL);
})();
