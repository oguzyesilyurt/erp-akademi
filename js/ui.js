// Görünümler arasında paylaşılan küçük yardımcılar
import { icon } from './icons.js';

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const moneyFmt = new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const moneyShortFmt = new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', minimumFractionDigits: 0, maximumFractionDigits: 2 });
const numFmt = new Intl.NumberFormat('tr-TR');
const dateFmt = new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' });

// Kuruşlu tutarlar iki hane, tam tutarlar kısa gösterilir
export const money = (n) => (Number.isInteger(n ?? 0) ? moneyShortFmt : moneyFmt).format(n ?? 0);
export const money2 = (n) => moneyFmt.format(n ?? 0);
export const num = (n) => numFmt.format(n ?? 0);
// "YYYY-MM-DD" yerel tarih olarak okunur (UTC kayması olmasın)
export const date = (iso) => {
  if (!iso) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return dateFmt.format(m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(iso));
};
const dtFmt = new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
export const datetime = (iso) => (iso ? dtFmt.format(new Date(iso)) : '—');
export const pct = (n) => `%${numFmt.format(Math.round(n))}`;
export const pct1 = (n) => `%${new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 1 }).format(n)}`;
export const round2 = (n) => Math.round(n * 100) / 100;

// Türkçe büyük/küçük harf duyarsız arama
export const norm = (s) => String(s ?? '').toLocaleLowerCase('tr-TR').normalize('NFC');

export function emptyState(ic, title, text, action = '') {
  return `
    <div class="empty">
      <div class="empty-icon">${icon(ic)}</div>
      <h3>${esc(title)}</h3>
      <p>${esc(text)}</p>
      ${action}
    </div>`;
}

export function progressBar(value, accent) {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  return `
    <div class="progress" style="--accent:${esc(accent)}" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${v}">
      <div class="progress-fill" style="width:${v}%"></div>
    </div>`;
}

// tone: success | warning | danger | danger-solid | info | neutral
export function badge(label, tone = 'neutral') {
  return `<span class="badge badge-${tone}">${esc(label)}</span>`;
}

export const kv = (rows) =>
  `<dl class="kv">${rows
    .filter(Boolean)
    .map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${v}</dd></div>`)
    .join('')}</dl>`;

export const dsec = (title, body) => `<section class="dsec"><h3>${esc(title)}</h3>${body}</section>`;

// tone: danger | warning | info | success ; text HTML kabul eder (çağıran kaçışlar)
export const alertBox = (tone, title, text) =>
  `<div class="alert alert-${tone}">${icon(tone === 'success' ? 'check' : tone === 'info' ? 'help' : 'alert')}<div><strong>${esc(title)}</strong>${text ? `<p>${text}</p>` : ''}</div></div>`;

// ---------- bildirim ----------
let toastTimer;
export function toast(msg) {
  const $t = document.getElementById('toast');
  if (!$t) return;
  $t.textContent = msg;
  $t.hidden = false;
  requestAnimationFrame(() => $t.classList.add('show'));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    $t.classList.remove('show');
    setTimeout(() => ($t.hidden = true), 250);
  }, 2600);
}

// ---------- detay paneli (sağdan / mobilde alttan) ----------
let drawer, drawerInner, lastFocus, drawerAction;

function ensureDrawer() {
  if (drawer) return;
  drawer = document.createElement('div');
  drawer.className = 'drawer-root';
  drawer.hidden = true;
  drawer.innerHTML = `
    <div class="drawer-backdrop" data-close></div>
    <aside class="drawer" role="dialog" aria-modal="true" aria-labelledby="drawer-title" tabindex="-1">
      <div class="drawer-grip" aria-hidden="true"></div>
      <div class="drawer-inner"></div>
    </aside>`;
  document.body.appendChild(drawer);
  drawerInner = drawer.querySelector('.drawer-inner');

  drawer.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) return closeDrawer();
    const o = e.target.closest('[data-open],[data-act]');
    if (o && drawerAction) drawerAction(o, e);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !drawer.hidden) closeDrawer();
  });
  window.addEventListener('hashchange', () => closeDrawer(true));
}

// onAction(el, event): panel içindeki [data-open] / [data-act] tıklamaları
export function openDrawer(html, onAction = null) {
  ensureDrawer();
  if (drawer.hidden) lastFocus = document.activeElement;
  drawerAction = onAction;
  drawerInner.innerHTML = html;
  drawerInner.scrollTop = 0;
  drawer.hidden = false;
  document.documentElement.classList.add('no-scroll');
  requestAnimationFrame(() => drawer.classList.add('open'));
  drawer.querySelector('.drawer').focus({ preventScroll: true });
}

export const drawerOpen = () => !!drawer && !drawer.hidden;

export function closeDrawer(instant = false) {
  if (!drawer || drawer.hidden) return;
  drawer.classList.remove('open');
  document.documentElement.classList.remove('no-scroll');
  const done = () => (drawer.hidden = true);
  if (instant) done();
  else {
    setTimeout(done, 220);
    lastFocus?.focus?.({ preventScroll: true });
  }
}

export function drawerHead(eyebrow, title, badges = '') {
  return `<header class="drawer-head">
    <div>
      <p class="eyebrow">${esc(eyebrow)}</p>
      <h2 id="drawer-title">${esc(title)}</h2>
      ${badges ? `<div class="badges">${badges}</div>` : ''}
    </div>
    <button class="icon-btn" type="button" data-close aria-label="Kapat">${icon('close')}</button>
  </header>`;
}

// ---------- "?" açıklama baloncuğu ----------
// Kullanım: <button class="help" type="button" data-help="Açıklama metni" aria-label="...">?</button>
let pop, popFor;

export function helpBtn(text, label = 'Açıklama') {
  if (!text) return '';
  return `<button class="help" type="button" data-help="${esc(text)}" aria-label="${esc(label)}: açıklama" aria-expanded="false">?</button>`;
}

function hidePop() {
  if (!pop || pop.hidden) return;
  pop.hidden = true;
  popFor?.setAttribute('aria-expanded', 'false');
  popFor = null;
}

function showPop(btn) {
  if (!pop) {
    pop = document.createElement('div');
    pop.className = 'help-pop';
    pop.setAttribute('role', 'tooltip');
    pop.id = 'help-pop';
    pop.hidden = true;
    document.body.appendChild(pop);
  }
  if (popFor === btn) return hidePop();
  hidePop();
  pop.textContent = btn.dataset.help;
  pop.hidden = false;
  popFor = btn;
  btn.setAttribute('aria-expanded', 'true');
  btn.setAttribute('aria-describedby', 'help-pop');

  const r = btn.getBoundingClientRect();
  const w = Math.min(300, window.innerWidth - 24);
  pop.style.width = `${w}px`;
  let left = r.left + r.width / 2 - w / 2;
  left = Math.max(12, Math.min(left, window.innerWidth - w - 12));
  const below = r.bottom + 8;
  const h = pop.offsetHeight;
  const top = below + h > window.innerHeight - 12 ? r.top - h - 8 : below;
  pop.style.left = `${left}px`;
  pop.style.top = `${Math.max(12, top)}px`;
}

document.addEventListener('click', (e) => {
  const b = e.target.closest('.help[data-help]');
  if (b) {
    e.preventDefault();
    e.stopPropagation();
    showPop(b);
  } else if (!e.target.closest('.help-pop')) hidePop();
}, true);
document.addEventListener('keydown', (e) => e.key === 'Escape' && hidePop());
window.addEventListener('scroll', hidePop, { passive: true, capture: true });
window.addEventListener('resize', hidePop);
window.addEventListener('hashchange', hidePop);
