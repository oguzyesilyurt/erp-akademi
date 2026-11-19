// Oturum, kullanıcı/rol yönetimi (IAM) ve yetki kontrolü
// Varsayılanlar: data/roles.json (roller, yetkiler, SoD kuralları) + company.json (kullanıcılar).
// Kullanıcı Yönetimi sayfasındaki değişiklikler tarayıcıda (localStorage) saklanır.
import { icon } from './icons.js';
import { esc, toast, openDrawer, closeDrawer, drawerHead, badge } from './ui.js';
import { loadCompany, company } from './company.js';

const SESSION_KEY = 'erp-akademi:session';
const IAM_KEY = 'erp-akademi:iam';
let R = null; // roles.json (değişmez varsayılan)
let S = null; // IAM durumu
let rolesPromise = null;

const clone = (o) => JSON.parse(JSON.stringify(o));
const nowIso = () => new Date().toISOString();

export function loadRoles() {
  if (!rolesPromise) {
    rolesPromise = Promise.all([
      fetch('data/roles.json', { cache: 'no-cache' }).then((r) => {
        if (!r.ok) throw new Error(`roles.json: ${r.status}`);
        return r.json();
      }),
      loadCompany(),
    ])
      .then(([roles]) => {
        R = roles;
        const stored = readIam();
        S = stored || defaults();
        // Kaydedilmiş durumu yeni sürümün rol/yetkileriyle güncelle (ör. yeni test yetkileri)
        if (stored && migrate(S)) writeIam();
        return R;
      })
      .catch((e) => {
        rolesPromise = null;
        throw e;
      });
  }
  return rolesPromise;
}

// ---------- IAM durumu ----------
function splitName(name) {
  // Tek kelimelik adlarda soyad boş kalır (varsayılan kullanıcılar)
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  return { firstName: parts.length > 1 ? parts.slice(0, -1).join(' ') : parts[0] || '', lastName: parts.length > 1 ? parts.at(-1) : '' };
}

function defaults() {
  const cu = company()?.organization.users || [];
  const users = cu.map((u) => ({
    ...clone(u),
    ...splitName(u.name),
    title: u.role,
    roles: R.roles.filter((r) => r.users.includes(u.id)).map((r) => r.id),
    active: true,
  }));
  const depts = [...new Set([...(R.departments || []), ...users.map((u) => u.department).filter(Boolean)])];
  return {
    v: 1,
    users,
    roles: R.roles.map((r) => ({ id: r.id, name: r.name, summary: r.summary, permissions: [...r.permissions], builtIn: true })),
    departments: depts,
    knownPerms: R.permissions.map((p) => p.id),
    log: [],
  };
}

// Önceki sürümlerin varsayılan kullanıcı kayıtları: [kullanıcı adı, ad, e-posta]
const LEGACY_USERS = {
  U01: ['DKAYA', 'Denel Kaya', 'denel.kaya@egedagitim.example'],
  U02: ['ADEMIR', 'Ayçelen Demir', 'aycelen.demir@egedagitim.example'],
  U03: ['GYILMAZ', 'Gökhan Yılmaz', 'gokhan.yilmaz@egedagitim.example'],
  U04: ['OOZTURK', 'Oğuz Öztürk', 'oguz.ozturk@egedagitim.example'],
  U05: ['MCINAR', 'Mehmet Çınar', 'mehmet.cinar@egedagitim.example'],
};

// Yeni eklenen yetkileri varsayılan rollere, yeni varsayılan rolleri duruma ekler.
// Kullanıcının bilinçli olarak kaldırdığı eski yetkilere dokunmaz.
function migrate(st) {
  let changed = false;
  const all = R.permissions.map((p) => p.id);
  const known = new Set(st.knownPerms || st.roles.flatMap((r) => r.permissions));
  const fresh = all.filter((p) => !known.has(p));
  for (const rr of R.roles) {
    const sr = st.roles.find((x) => x.id === rr.id);
    if (!sr) {
      st.roles.push({ id: rr.id, name: rr.name, summary: rr.summary, permissions: [...rr.permissions], builtIn: true });
      changed = true;
      continue;
    }
    const add = rr.permissions.filter((p) => fresh.includes(p) && !sr.permissions.includes(p));
    if (add.length) {
      sr.permissions.push(...add);
      changed = true;
    }
  }
  for (const d of R.departments || []) {
    if (!st.departments.includes(d)) {
      st.departments.push(d);
      changed = true;
    }
  }
  // Varsayılan kullanıcıların eski "Ad Soyad" kayıtlarını yeni adlara taşı.
  // Yalnızca hiç düzenlenmemiş (eski ad + eski kullanıcı adı aynen duran) kayıtlar değişir.
  const cu = company()?.organization.users || [];
  for (const u of st.users) {
    const old = LEGACY_USERS[u.id];
    const def = cu.find((x) => x.id === u.id);
    if (!old || !def || u.username !== old[0] || u.name !== old[1]) continue;
    Object.assign(u, { name: def.name, username: def.username, ...splitName(def.name) });
    if (u.email === old[2]) u.email = def.email;
    changed = true;
  }
  if (fresh.length || !st.knownPerms) {
    st.knownPerms = all;
    changed = true;
  }
  return changed;
}

function readIam() {
  try {
    const s = JSON.parse(localStorage.getItem(IAM_KEY));
    return s && s.v === 1 && Array.isArray(s.users) && Array.isArray(s.roles) ? s : null;
  } catch {
    return null;
  }
}

function writeIam() {
  try {
    localStorage.setItem(IAM_KEY, JSON.stringify(S));
  } catch {}
}

export const iam = () => S;
export const isIamCustomized = () => !!readIam();

// Yeni durumu doğrulanmış olarak kaydeder ve günlüğe yazar
export function commitIam(next, entry) {
  S = next;
  if (entry) S.log = [{ at: nowIso(), by: currentUser()?.id, ...entry }, ...(S.log || [])].slice(0, 200);
  writeIam();
  document.dispatchEvent(new CustomEvent('erp:refresh'));
}

export function resetIam() {
  const by = currentUser()?.id;
  try {
    localStorage.removeItem(IAM_KEY);
  } catch {}
  S = defaults();
  S.log = [{ at: nowIso(), by, action: 'reset', target: 'Sistem', detail: 'Kullanıcı, rol ve departmanlar varsayılana döndürüldü' }];
  writeIam();
  // Oturumdaki kullanıcı artık yoksa varsayılana dön
  if (!usersOf().some((u) => u.id === storedId())) {
    try {
      localStorage.setItem(SESSION_KEY, R.defaultUser);
    } catch {}
  }
  document.dispatchEvent(new CustomEvent('erp:refresh'));
}

// ---------- sorgular ----------
export const permissions = () => R?.permissions || [];
export const permOf = (id) => R?.permissions.find((p) => p.id === id);
export const sodRules = () => R?.sodRules || [];
export const templates = () => R?.templates || [];
export const roleById = (id, st = S) => st?.roles.find((r) => r.id === id) || null;
export const allUsers = (st = S) => st?.users || [];
export const usersOf = (st = S) => allUsers(st).filter((u) => u.active);
export const userById = (id, st = S) => allUsers(st).find((u) => u.id === id) || null;
export const rolesOfUser = (userId, st = S) => (userById(userId, st)?.roles || []).map((r) => roleById(r, st)).filter(Boolean);
export const roleOfUser = (userId, st = S) => rolesOfUser(userId, st)[0] || null;
export const membersOf = (roleId, st = S) => usersOf(st).filter((u) => u.roles.includes(roleId));

export function permsOfRoles(roleIds, st = S) {
  const set = new Set();
  roleIds.forEach((id) => roleById(id, st)?.permissions.forEach((p) => set.add(p)));
  return set;
}
export const permsOfUser = (userId, st = S) => permsOfRoles(userById(userId, st)?.roles || [], st);

// roles.json biçiminde görünüm (Yetki Matrisi için): rol + üyeleri
export function rolesData() {
  if (!R || !S) return null;
  return { ...R, roles: S.roles.map((r) => ({ ...r, users: membersOf(r.id).map((u) => u.id) })) };
}

// İhlal edilen SoD kuralları
export function sodConflicts(permSet) {
  return sodRules().filter((r) => permSet.has(r.a) && permSet.has(r.b));
}

// Yetkiye sahip aktif kullanıcılar
export function holders(perm, st = S) {
  return usersOf(st).filter((u) => permsOfUser(u.id, st).has(perm));
}

// Değişiklikten sonra hiçbir aktif kullanıcıda kalmayacak yetkiler
export function lostPerms(next) {
  const before = new Set();
  usersOf(S).forEach((u) => permsOfUser(u.id, S).forEach((p) => before.add(p)));
  const after = new Set();
  usersOf(next).forEach((u) => permsOfUser(u.id, next).forEach((p) => after.add(p)));
  return [...before].filter((p) => !after.has(p));
}

// Onay adımı için yetkili kişi metni
export function approverFor(perm) {
  const u = holders(perm)[0];
  return u ? userLabel(u.id) : `Yetkili kullanıcı yok (${perm})`;
}

// Bir rolün şu anki aktif kullanıcıları (senaryo metinleri için)
export function roleUsersText(roleId) {
  const m = membersOf(roleId);
  return m.length ? m.map((u) => u.name).join(', ') : 'bu rolde aktif kullanıcı yok';
}

// ---------- oturum ----------
function storedId() {
  try {
    return localStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
}

export function currentUser() {
  const id = storedId();
  const u = userById(id);
  if (u?.active) return u;
  const d = userById(R?.defaultUser);
  return d?.active ? d : usersOf()[0] || null;
}

export function currentRole() {
  const u = currentUser();
  return u ? roleOfUser(u.id) : null;
}

export const currentRoleNames = () => (currentUser() ? rolesOfUser(currentUser().id).map((r) => r.name) : []);

export function can(perm) {
  const u = currentUser();
  return !!u && permsOfUser(u.id).has(perm);
}

export function canUser(userId, perm) {
  return permsOfUser(userId).has(perm);
}

export function setUser(id) {
  try {
    localStorage.setItem(SESSION_KEY, id);
  } catch {}
  const u = userById(id);
  toast(`Oturum: ${u?.name} · ${rolesOfUser(id).map((r) => r.name).join(', ') || 'rol yok'}`);
  document.dispatchEvent(new CustomEvent('erp:refresh'));
}

export const userLabel = (id) => {
  if (id === 'SYSTEM') return 'Sistem';
  const u = userById(id);
  if (!u) return id || '—';
  const rs = rolesOfUser(id);
  return `${u.name}${rs.length ? ` (${rs.map((r) => r.name).join(', ')})` : ''}${u.active ? '' : ' · pasif'}`;
};

export const initials = (name) => String(name || '?').split(' ').map((w) => w[0]).slice(0, 2).join('');

// ---------- kilitli düğme ----------
// Yetki yoksa düğme pasif görünür, kilit ikonu ve "Gerekli yetki: X" açıklaması taşır.
// Kilitli düğmeye tıklamak aynı açıklamayı bildirim olarak gösterir (dokunmatik ekranlar için).
export function lockReason(perm) {
  const p = permOf(perm);
  const roleNames = (S?.roles || []).filter((r) => r.permissions.includes(perm)).map((r) => r.name);
  return `Gerekli yetki: ${perm}${p ? ` (${p.label})` : ''}${roleNames.length ? ` · Sahip roller: ${roleNames.join(', ')}` : ''}`;
}

// opts: { perm, label, iconName, cls, attrs, reason } ; reason verilirse yetki olsa da kilitlenir (ör. SoD)
export function actionBtn({ perm, label, iconName = 'check', cls = 'btn-primary', attrs = '', reason = null }) {
  const allowed = (!perm || can(perm)) && !reason;
  if (allowed) return `<button class="btn ${cls}" type="button" ${attrs}>${icon(iconName)}<span>${label}</span></button>`;
  const why = reason || lockReason(perm);
  return `<button class="btn ${cls} is-locked" type="button" aria-disabled="true" data-locked="${esc(why)}" title="${esc(why)}">${icon('lock')}<span>${label}</span></button>`;
}

document.addEventListener('click', (e) => {
  const l = e.target.closest('[data-locked]');
  if (l) {
    e.preventDefault();
    e.stopPropagation();
    toast(l.dataset.locked);
  }
}, true);

// ---------- sahte giriş ekranı ----------
// opts.role: yalnızca bu roldeki kullanıcıları öne çıkar (senaryo adımlarından açılınca)
export async function openLogin(opts = {}) {
  await loadRoles();
  const me = currentUser();
  const list = usersOf();
  const sorted = opts.role ? [...list.filter((u) => u.roles.includes(opts.role)), ...list.filter((u) => !u.roles.includes(opts.role))] : list;
  const want = opts.role ? roleById(opts.role) : null;
  const cards = sorted
    .map((u) => {
      const rs = rolesOfUser(u.id);
      const active = me?.id === u.id;
      const match = want && u.roles.includes(want.id);
      return `<button class="login-user${active ? ' is-active' : ''}${want && !match ? ' is-dim' : ''}" type="button" data-act="login" data-user="${esc(u.id)}">
        <span class="avatar lg">${esc(initials(u.name))}</span>
        <span class="login-text">
          <span class="cell-main">${esc(u.name)}</span>
          <span class="cell-sub">${esc(rs.map((r) => r.name).join(', ') || 'Rol atanmamış')} · ${esc(u.username)}</span>
          <span class="login-sum">${esc(u.title || '')}${u.department ? ` · ${esc(u.department)}` : ''}</span>
        </span>
        ${active ? badge('Açık oturum', 'success') : match ? badge(want.name, 'info') : icon('back', 'chev')}
      </button>`;
    })
    .join('');

  openDrawer(
    drawerHead('Oturum', want ? `${want.name} rolüne geç` : 'Kullanıcı seç', badge('Eğitim ortamı · şifre gerekmez', 'info')) +
      `<div class="drawer-body">
        <p class="cell-sub login-note">${want ? `${esc(want.name)} rolündeki kullanıcılar üstte listelenir.` : `Ege Dağıtım'ın ${list.length} aktif kullanıcısından biriyle oturum aç.`} Her rolün yetkileri farklıdır; aynı ekran rolüne göre farklı düğmeler gösterir.</p>
        <div class="login-list">${cards}</div>
        <a class="link small" href="#/roles" data-close>Yetki matrisini gör →</a>
      </div>`,
    (el) => {
      if (el.dataset.act === 'login') {
        closeDrawer();
        if (el.dataset.user !== me?.id) setUser(el.dataset.user);
      }
    }
  );
}
