// İlerleme ve tercih deposu (localStorage)
const KEY = 'erp-akademi:progress';
const THEME_KEY = 'erp-akademi:theme';
const LAST_KEY = 'erp-akademi:last';

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* depolama kapalı olabilir (gizli mod vb.) */
  }
}

function load() {
  const data = read(KEY, null);
  if (!data || data.v !== 1 || typeof data.tracks !== 'object') return { v: 1, tracks: {} };
  return data;
}

export const progress = {
  get(trackId) {
    return load().tracks[trackId] || { done: {}, updatedAt: null };
  },

  isDone(trackId, sectionId) {
    return !!this.get(trackId).done[sectionId];
  },

  setDone(trackId, sectionId, value = true) {
    const data = load();
    const t = data.tracks[trackId] || { done: {}, updatedAt: null };
    if (value) t.done[sectionId] = true;
    else delete t.done[sectionId];
    t.updatedAt = new Date().toISOString();
    data.tracks[trackId] = t;
    write(KEY, data);
  },

  percent(trackId, sectionIds) {
    if (!sectionIds.length) return 0;
    const done = this.get(trackId).done;
    const n = sectionIds.filter((s) => done[s]).length;
    return Math.round((n / sectionIds.length) * 100);
  },

  reset() {
    write(KEY, { v: 1, tracks: {} });
  },
};

// Simülasyonda kaydedilen teklifler
const QUOTES_KEY = 'erp-akademi:quotes';
const QUOTE_SEQ_KEY = 'erp-akademi:quote-seq';

export const quotes = {
  list() {
    const l = read(QUOTES_KEY, []);
    return Array.isArray(l) ? l : [];
  },
  get(no) {
    return this.list().find((q) => q.no === no) || null;
  },
  // Numara silmeden etkilenmez; her kayıtta bir artar
  peekNo(start) {
    const last = Number(read(QUOTE_SEQ_KEY, 0)) || 0;
    return String(Math.max(last + 1, start));
  },
  add(q, start) {
    const no = this.peekNo(start);
    const rec = { ...q, no };
    write(QUOTES_KEY, [rec, ...this.list()]);
    write(QUOTE_SEQ_KEY, Number(no));
    return rec;
  },
  update(q) {
    write(QUOTES_KEY, this.list().map((x) => (x.no === q.no ? q : x)));
  },
  remove(no) {
    write(QUOTES_KEY, this.list().filter((q) => q.no !== no));
  },
};

// Bölüm sonuçları (hata avı, quiz): ad alanı + yol bazında serbest nesne
const RESULTS_KEY = 'erp-akademi:results';

export const results = {
  get(ns, trackId) {
    const all = read(RESULTS_KEY, {});
    return all?.[ns]?.[trackId] || {};
  },
  set(ns, trackId, value) {
    const all = read(RESULTS_KEY, {}) || {};
    all[ns] = all[ns] || {};
    all[ns][trackId] = value;
    write(RESULTS_KEY, all);
  },
};

export const prefs = {
  getTheme() {
    try {
      return localStorage.getItem(THEME_KEY);
    } catch {
      return null;
    }
  },
  setTheme(theme) {
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {}
  },
  getLast() {
    return read(LAST_KEY, null);
  },
  setLast(hash) {
    write(LAST_KEY, hash);
  },
};
