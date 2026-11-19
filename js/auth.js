// Sahte oturum ve yetki kontrolü (data/roles.json + company.json kullanıcıları)
import { icon } from './icons.js';
import { esc, toast, openDrawer, closeDrawer, drawerHead, badge } from './ui.js';
import { loadCompany, company } from './company.js';

const SESSION_KEY = 'erp-akademi:session';
let R = null;
let rolesPromise = null;

export function loadRoles() {
  if (!rolesPromise) {
    rolesPromise = Promise.all([
      fetch('data/roles.json', { cache: 'no-cache' }).then((r) => {
        if (!r.ok) throw new Error(`roles.json: ${r.status}`);
        return r.json();
      }),
      loadCompany(),
    ])
      .then(([roles]) => (R = roles))
      .catch((e) => {
        rolesPromise = null;
        throw e;
      });
  }
  return rolesPromise;
}

export const rolesData = () => R;
export const permOf = (id) => R?.permissions.find((p) => p.id === id);
export const roleOfUser = (userId) => R?.roles.find((r) => r.users.includes(userId)) || null;
export const usersOf = () => company()?.organization.users || [];
export const userById = (id) => usersOf().find((u) => u.id === id) || null;

function storedId() {
  try {
    return localStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
}

export function currentUser() {
  const id = storedId();
  return userById(id) || userById(R?.defaultUser) || usersOf()[0] || null;
}

export function currentRole() {
  const u = currentUser();
  return u ? roleOfUser(u.id) : null;
}

export function can(perm) {
  return !!currentRole()?.permissions.includes(perm);
}

export function canUser(userId, perm) {
  return !!roleOfUser(userId)?.permissions.includes(perm);
}

export function setUser(id) {
  try {
    localStorage.setItem(SESSION_KEY, id);
  } catch {}
  const u = userById(id);
  const r = roleOfUser(id);
  toast(`Oturum: ${u?.name} · ${r?.name}`);
  document.dispatchEvent(new CustomEvent('erp:refresh'));
}

export const userLabel = (id) => {
  const u = userById(id);
  if (!u) return id || '—';
  const r = roleOfUser(id);
  return `${u.name}${r ? ` (${r.name})` : ''}`;
};

export const initials = (name) => String(name || '?').split(' ').map((w) => w[0]).slice(0, 2).join('');

// ---------- kilitli düğme ----------
// Yetki yoksa düğme pasif görünür, kilit ikonu ve "Gerekli yetki: X" açıklaması taşır.
// Kilitli düğmeye tıklamak aynı açıklamayı bildirim olarak gösterir (dokunmatik ekranlar için).
export function lockReason(perm) {
  const p = permOf(perm);
  const holders = (R?.roles || []).filter((r) => r.permissions.includes(perm)).map((r) => r.name);
  return `Gerekli yetki: ${perm}${p ? ` (${p.label})` : ''}${holders.length ? ` · Sahip roller: ${holders.join(', ')}` : ''}`;
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
export async function openLogin() {
  await loadRoles();
  const me = currentUser();
  const cards = usersOf()
    .map((u) => {
      const r = roleOfUser(u.id);
      const active = me?.id === u.id;
      return `<button class="login-user${active ? ' is-active' : ''}" type="button" data-act="login" data-user="${esc(u.id)}">
        <span class="avatar lg">${esc(initials(u.name))}</span>
        <span class="login-text">
          <span class="cell-main">${esc(u.name)}</span>
          <span class="cell-sub">${esc(r?.name || u.role)} · ${esc(u.username)}</span>
          <span class="login-sum">${esc(r?.summary || '')}</span>
        </span>
        ${active ? badge('Açık oturum', 'success') : icon('back', 'chev')}
      </button>`;
    })
    .join('');

  openDrawer(
    drawerHead('Oturum', 'Kullanıcı seç', badge('Eğitim ortamı · şifre gerekmez', 'info')) +
      `<div class="drawer-body">
        <p class="cell-sub login-note">Ege Dağıtım'ın dört kullanıcısından biriyle oturum aç. Her rolün yetkileri farklıdır; aynı ekran rolüne göre farklı düğmeler gösterir.</p>
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
