// Sistem sürümü ve feature flag'ler (data/releases.json)
// Seçili sürüm ve düzeltilen hatalar tarayıcıda saklanır. Hata Avı her zaman doğru kuralları
// kullanır (company.js'teki useBase modu bayrakları yok sayar).
const KEY = 'erp-akademi:release';
let REL = null;
let promise = null;

export function loadReleases() {
  if (!promise) {
    promise = fetch('data/releases.json', { cache: 'no-cache' })
      .then((r) => {
        if (!r.ok) throw new Error(`releases.json: ${r.status}`);
        return r.json();
      })
      .then((d) => (REL = d))
      .catch((e) => {
        promise = null;
        throw e;
      });
  }
  return promise;
}

function read() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || {};
  } catch {
    return {};
  }
}
function write(s) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {}
}
const refresh = () => document.dispatchEvent(new CustomEvent('erp:refresh'));

export const releasesData = () => REL;
export const releaseById = (id) => REL?.releases.find((r) => r.id === id) || null;

export function currentReleaseId() {
  const s = read();
  return releaseById(s.selected) ? s.selected : REL?.default || 'v1.0';
}
export const currentRelease = () => releaseById(currentReleaseId());
export const isDefaultRelease = () => currentReleaseId() === (REL?.default || 'v1.0');

export function setRelease(id) {
  if (!releaseById(id)) return;
  const s = read();
  s.selected = id;
  write(s);
  refresh();
}

// Bayrak, sürümde var ve henüz düzeltilmemişse etkindir
export function flagActive(flag, releaseId = currentReleaseId()) {
  const r = releaseById(releaseId);
  return !!r && r.flags.includes(flag) && !read().fixed?.[releaseId]?.[flag];
}
export const flag = (name) => flagActive(name);

export function fixFlag(releaseId, flag) {
  const s = read();
  s.fixed = s.fixed || {};
  s.fixed[releaseId] = { ...(s.fixed[releaseId] || {}), [flag]: new Date().toISOString() };
  write(s);
  refresh();
}

export function fixedCount(releaseId = currentReleaseId()) {
  const r = releaseById(releaseId);
  if (!r) return { fixed: 0, total: 0 };
  const f = read().fixed?.[releaseId] || {};
  return { fixed: r.flags.filter((x) => f[x]).length, total: r.flags.length };
}

// Düzeltmeleri geri alır (sürüm seçimi korunur)
export function resetFixes() {
  const s = read();
  delete s.fixed;
  write(s);
  refresh();
}

export const bugForRequirement = (reqId) => REL?.bugs.find((b) => b.requirement === reqId) || null;
