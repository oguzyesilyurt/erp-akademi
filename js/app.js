import { start, href, stripQuery } from './router.js';
import { progress, prefs } from './store.js';
import { icon } from './icons.js';
import { esc, emptyState, progressBar, toast, badge } from './ui.js';
import { viewCompany } from './company.js';
import { renderSection } from './track-content.js';
import { loadRoles, currentUser, currentRole, currentRoleNames, initials, openLogin, can } from './auth.js';
import { viewInbox, inboxCount } from './inbox.js';
import { viewRoles } from './roles-page.js';
import { viewInterface } from './interface-page.js';
import { viewDocs } from './docs.js';
import { viewUsers } from './users-page.js';
import { loadReleases, currentRelease, isDefaultRelease } from './release.js';
import { errorCount, processPending, openDocRef } from './erp.js';

// Yol sayfası sekmeleri (tüm yollar için sabit şablon)
const SECTIONS = [
  { id: 'intro',      label: 'Giriş',       icon: 'book',    empty: 'Bu yolun giriş içeriği henüz eklenmedi.' },
  { id: 'concepts',   label: 'Kavramlar',   icon: 'layers',  empty: 'Temel kavramlar ve terimler burada yer alacak.' },
  { id: 'simulation', label: 'Simülasyon',  icon: 'monitor', empty: 'Ekran simülasyonları burada yer alacak.' },
  { id: 'scenarios',  label: 'Senaryolar',  icon: 'route',   empty: 'Uçtan uca iş senaryoları burada yer alacak.' },
  { id: 'tests',      label: 'Testler',     icon: 'flask',   empty: 'Test vakaları ve kontrol listeleri burada yer alacak.' },
  { id: 'quiz',       label: 'Quiz',        icon: 'help',    empty: 'Bilgini ölçen sorular burada yer alacak.' },
];
const SECTION_IDS = SECTIONS.map((s) => s.id);

// İçerik varken kendi kuralıyla tamamlanan bölümler (elle işaretlenmez)
const AUTO_COMPLETE = {
  simulation: 'İlk teklifini kaydettiğinde bu bölüm tamamlanır.',
  tests: 'Tüm görevleri raporlayıp toplamda %70 ve üstü puan aldığında bu bölüm tamamlanır.',
  quiz: 'Quizde %70 ve üstü skor aldığında bu bölüm tamamlanır.',
};

const $view = document.getElementById('view');
const $main = document.getElementById('main');
const $navSide = document.getElementById('nav-side');
const $navBottom = document.getElementById('nav-bottom');

let tracks = [];
const trackCache = new Map();

// ---------- yardımcılar ----------
async function getJSON(url) {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return res.json();
}

async function loadTracks() {
  const data = await getJSON('data/tracks.json');
  tracks = Array.isArray(data.tracks) ? data.tracks : [];
}

async function loadTrack(id) {
  if (trackCache.has(id)) return trackCache.get(id);
  const data = await getJSON(`data/tracks/${encodeURIComponent(id)}.json`);
  trackCache.set(id, data);
  return data;
}

function hasContent(v) {
  if (v == null) return false;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === 'object') return Object.keys(v).length > 0;
  return String(v).trim() !== '';
}

function setView(html, title) {
  $view.classList.remove('enter');
  $view.innerHTML = html;
  void $view.offsetWidth; // animasyonu yeniden tetikle
  $view.classList.add('enter');
  document.title = title ? `${title} · ERP Akademi` : 'ERP Akademi';
}

// ---------- tema ----------
function currentTheme() {
  const t = document.documentElement.getAttribute('data-theme');
  if (t) return t;
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', bg));
  updateThemeButtons();
}

function toggleTheme() {
  const next = currentTheme() === 'dark' ? 'light' : 'dark';
  prefs.setTheme(next);
  applyTheme(next);
}

function updateThemeButtons() {
  const dark = currentTheme() === 'dark';
  document.querySelectorAll('[data-theme-icon]').forEach((el) => (el.innerHTML = icon(dark ? 'sun' : 'moon')));
  document.querySelectorAll('[data-theme-label]').forEach((el) => (el.textContent = dark ? 'Açık tema' : 'Koyu tema'));
}

// ---------- navigasyon ----------
function renderNav(route) {
  const last = prefs.getLast();
  const isHome = route.name === 'home';
  const isCompany = route.name === 'company';
  const activeTrack = route.name === 'track' ? route.id : null;

  const resume = last
    ? `<a class="nav-item" href="${esc(last)}">
         <span class="nav-icon">${icon('play')}</span><span class="nav-label">Devam et</span></a>`
    : `<span class="nav-item is-disabled" aria-disabled="true">
         <span class="nav-icon">${icon('play')}</span><span class="nav-label">Devam et</span></span>`;

  const isInbox = route.name === 'inbox';
  const isRoles = route.name === 'roles';
  const isIface = route.name === 'interface';
  const isDocs = route.name === 'docs';
  const isUsers = route.name === 'users';
  const inboxN = inboxCount();
  const nBadge = inboxN ? `<span class="nav-badge" aria-label="${inboxN} bekleyen onay">${inboxN}</span>` : '';
  const errN = errorCount();
  const eBadge = errN ? `<span class="nav-badge" aria-label="${errN} hatalı aktarım">${errN}</span>` : '';

  $navSide.innerHTML = `
    <a class="nav-item ${isHome ? 'is-active' : ''}" href="#/">
      <span class="nav-icon">${icon('grid')}</span><span class="nav-label">Öğrenme Yolları</span></a>
    <a class="nav-item ${isCompany ? 'is-active' : ''}" href="#/company">
      <span class="nav-icon">${icon('building')}</span><span class="nav-label">Şirket</span></a>
    <a class="nav-item ${isInbox ? 'is-active' : ''}" href="#/inbox">
      <span class="nav-icon">${icon('stamp')}</span><span class="nav-label">Onay Kutusu</span>${nBadge}</a>
    <a class="nav-item ${isIface ? 'is-active' : ''}" href="#/interface">
      <span class="nav-icon">${icon('link')}</span><span class="nav-label">Aktarım Monitörü</span>${eBadge}</a>
    <a class="nav-item ${isRoles ? 'is-active' : ''}" href="#/roles">
      <span class="nav-icon">${icon('shield')}</span><span class="nav-label">Yetki Matrisi</span></a>
    <a class="nav-item ${isUsers ? 'is-active' : ''}" href="#/users">
      <span class="nav-icon">${icon('users')}</span><span class="nav-label">Kullanıcı Yönetimi</span>${can('USER_ADMIN') ? '' : `<span class="nav-lock" title="Gerekli yetki: USER_ADMIN">${icon('lock')}</span>`}</a>
    <a class="nav-item ${isDocs ? 'is-active' : ''}" href="#/docs">
      <span class="nav-icon">${icon('book')}</span><span class="nav-label">Dokümantasyon</span></a>
    ${resume}
    <div class="nav-group">Yollar</div>
    ${tracks
      .map(
        (t) => `
      <a class="nav-item nav-sub ${activeTrack === t.id ? 'is-active' : ''}" href="${href('track', { id: t.id })}" style="--accent:${esc(t.accent)}">
        <span class="nav-dot"></span><span class="nav-label">${esc(t.title)}</span>
        <span class="nav-pct">${progress.percent(t.id, SECTION_IDS)}%</span>
      </a>`
      )
      .join('')}
  `;

  $navBottom.innerHTML = `
    <a class="bn-item ${isHome ? 'is-active' : ''}" href="#/">${icon('grid')}<span>Yollar</span></a>
    <a class="bn-item ${isCompany ? 'is-active' : ''}" href="#/company">${icon('building')}<span>Şirket</span></a>
    <a class="bn-item ${isInbox ? 'is-active' : ''}" href="#/inbox"><span class="bn-ico">${icon('stamp')}${nBadge}</span><span>Onaylar</span></a>
    <a class="bn-item ${isIface ? 'is-active' : ''}" href="#/interface"><span class="bn-ico">${icon('link')}${eBadge}</span><span>Aktarım</span></a>
    <a class="bn-item ${isDocs ? 'is-active' : ''}" href="#/docs">${icon('book')}<span>Dokümanlar</span></a>
    ${
      last
        ? `<a class="bn-item ${activeTrack ? 'is-active' : ''}" href="${esc(last)}">${icon('play')}<span>Devam et</span></a>`
        : `<span class="bn-item is-disabled" aria-disabled="true">${icon('play')}<span>Devam et</span></span>`
    }
  `;
  renderTopbar();
  updateThemeButtons();
}

function renderTopbar() {
  // Varsayılan dışı sürüm seçiliyse üst barda uyarı etiketi
  const rc = document.getElementById('release-chip');
  if (rc) {
    const rel = currentRelease();
    rc.hidden = !rel || isDefaultRelease();
    if (rel) {
      rc.innerHTML = `${icon('flask')}<span>Sürüm ${esc(rel.name)}</span>`;
      rc.title = `Simülasyonlar ${rel.name} (${rel.label}) kurallarıyla çalışıyor · değiştirmek için Test Laboratuvarı`;
    }
  }
  const u = currentUser();
  const r = currentRole();
  const chip = document.getElementById('session-chip');
  if (!chip || !u) return;
  chip.innerHTML = `<span class="avatar">${esc(initials(u.name))}</span>
    <span class="session-text"><span class="session-label">Oturum</span><span class="session-name">${esc(u.name)}</span></span>
    <span class="session-role">${esc(currentRoleNames().join(' + ') || 'Rol yok')}</span>
    ${icon('back', 'chev down')}`;
  chip.title = `Oturum: ${u.name} (${currentRoleNames().join(', ') || 'rol yok'}) · değiştirmek için tıkla`;
}

// ---------- görünümler ----------
function viewHome() {
  const total = tracks.length
    ? Math.round(tracks.reduce((a, t) => a + progress.percent(t.id, SECTION_IDS), 0) / tracks.length)
    : 0;

  const cards = tracks
    .map((t, i) => {
      const pct = progress.percent(t.id, SECTION_IDS);
      return `
      <a class="card track-card" href="${href('track', { id: t.id })}" style="--accent:${esc(t.accent)};--i:${i}">
        <div class="track-card-head">
          <span class="icon-tile">${icon(t.icon)}</span>
          <span class="pct">${pct}%</span>
        </div>
        <h3 class="track-title">${esc(t.title)}</h3>
        <p class="track-summary">${esc(t.summary)}</p>
        ${progressBar(pct, t.accent)}
      </a>`;
    })
    .join('');

  setView(
    `
    <header class="page-head">
      <div>
        <p class="eyebrow">Panel</p>
        <h1>Öğrenme Yolları</h1>
        <p class="lead">SAP ve CRM süreçlerini adım adım, uygulamalı olarak öğren.</p>
      </div>
      <div class="stat card">
        <span class="stat-label">Genel ilerleme</span>
        <span class="stat-value">${total}%</span>
        ${progressBar(total, 'var(--primary)')}
      </div>
    </header>
    <section class="grid" aria-label="Yollar">${cards || emptyState('inbox', 'Henüz yol yok', 'data/tracks.json dosyasına yol eklendiğinde burada görünecek.')}</section>
  `,
    'Öğrenme Yolları'
  );
}

async function viewTrack(route) {
  const meta = tracks.find((t) => t.id === route.id);
  if (!meta) return viewNotFound();

  if (!route.section || !SECTION_IDS.includes(route.section)) {
    location.replace(href('track', { id: route.id, section: 'intro' }));
    return;
  }

  prefs.setLast(location.hash.split('?')[0]);

  let data = null;
  try {
    data = await loadTrack(meta.id);
  } catch (e) {
    console.warn(e);
  }

  const section = SECTIONS.find((s) => s.id === route.section);
  const pct = progress.percent(meta.id, SECTION_IDS);
  const done = progress.isDone(meta.id, section.id);
  const content = data && data.sections ? data.sections[section.id] : null;

  const tabs = SECTIONS.map((s) => {
    const isDone = progress.isDone(meta.id, s.id);
    return `
      <a class="tab ${s.id === section.id ? 'is-active' : ''}" role="tab" aria-selected="${s.id === section.id}"
         href="${href('track', { id: meta.id, section: s.id })}">
        ${icon(s.icon)}<span>${s.label}</span>${isDone ? '<span class="tab-done" title="Tamamlandı"></span>' : ''}
      </a>`;
  }).join('');

  const toggle = `
    <button class="btn ${done ? 'btn-ghost' : 'btn-primary'}" type="button" data-action="toggle-done"
            data-track="${esc(meta.id)}" data-section="${section.id}">
      ${icon('check')}<span>${done ? 'Tamamlandı · geri al' : 'Tamamlandı olarak işaretle'}</span>
    </button>`;

  let body;
  let rendered = null;
  if (hasContent(content)) {
    try {
      rendered = await renderSection({ track: meta, section: section.id, content, data, route });
      const auto = (section.id === 'simulation' && content?.completeHint) || AUTO_COMPLETE[section.id];
      body = `${rendered.html}<footer class="section-foot">${
        auto
          ? `<span class="cell-sub">${done ? 'Bu bölümü tamamladın.' : esc(auto)}</span>${done ? badge('Tamamlandı', 'success') : ''}`
          : `<span class="cell-sub">${done ? 'Bu bölümü tamamladın.' : 'Bitirdiğinde işaretle; ilerlemen kaydedilir.'}</span>${toggle}`
      }</footer>`;
    } catch (e) {
      console.error(e);
      body = emptyState('alert', 'Bölüm yüklenemedi', 'İçerik okunurken bir hata oluştu. Sayfayı yenilemeyi dene.');
    }
  } else {
    body = emptyState(section.icon, `${section.label} yakında`, section.empty, toggle);
  }
  // Yönlendirme sırasında başka bir rotaya geçildiyse eski görünümü çizme
  if (currentRoute !== route) return;

  setView(
    `
    <a class="back" href="#/">${icon('back')}<span>Öğrenme Yolları</span></a>
    <header class="track-hero card" style="--accent:${esc(meta.accent)}">
      <span class="icon-tile lg">${icon(meta.icon)}</span>
      <div class="track-hero-text">
        <h1>${esc(meta.title)}</h1>
        <p class="lead">${esc(meta.summary)}</p>
      </div>
      <div class="track-hero-progress">
        <span class="stat-label">İlerleme</span>
        <span class="stat-value">${pct}%</span>
        ${progressBar(pct, meta.accent)}
      </div>
    </header>
    <nav class="tabs" role="tablist" aria-label="Bölümler">${tabs}</nav>
    <section class="panel card${rendered ? ' has-content' : ''}" role="tabpanel" style="--accent:${esc(meta.accent)}">${body}</section>
  `,
    `${meta.title} · ${section.label}`
  );
  rendered?.bind?.($view.querySelector('.panel'));

  // aktif sekmeyi görünür alana kaydır (mobil)
  $view.querySelector('.tab.is-active')?.scrollIntoView({ block: 'nearest', inline: 'center' });
}

function viewNotFound() {
  setView(
    `<section class="panel card">${emptyState('help', 'Sayfa bulunamadı', 'Aradığın sayfa mevcut değil.', '<a class="btn btn-primary" href="#/">Ana panele dön</a>')}</section>`,
    'Bulunamadı'
  );
}

// ---------- olaylar ----------
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const action = el.dataset.action;

  if (action === 'theme') toggleTheme();
  if (action === 'session') openLogin();

  if (action === 'toggle-done') {
    const { track, section } = el.dataset;
    const next = !progress.isDone(track, section);
    progress.setDone(track, section, next);
    toast(next ? 'Bölüm tamamlandı olarak işaretlendi' : 'İşaret kaldırıldı');
    route(currentRoute);
  }
});

// Modüller ilerlemeyi değiştirdiğinde (ör. simülasyonda kayıt) görünümü tazele
// Oturum, onay durumu veya ana veri değiştiğinde de aynı şekilde (erp:refresh)
let refreshQueued = false;
function queueRefresh() {
  if (refreshQueued) return;
  refreshQueued = true;
  queueMicrotask(() => {
    refreshQueued = false;
    route(currentRoute);
  });
}
document.addEventListener('erp:progress', queueRefresh);
document.addEventListener('erp:refresh', queueRefresh);

matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if (!prefs.getTheme()) updateThemeButtons();
});

// ---------- başlat ----------
let currentRoute = { name: 'home' };
let firstRender = true;

async function route(r) {
  const prev = currentRoute;
  const refresh = r === prev; // aynı rotanın yeniden çizimi
  const sameTrack =
    (r.name === 'track' && prev.name === 'track' && r.id === prev.id) ||
    (r.name === 'company' && prev.name === 'company');
  currentRoute = r;
  if (r.name === 'home') viewHome();
  else if (r.name === 'track') await viewTrack(r);
  else if (r.name === 'company') await viewCompany(r, setView);
  else if (r.name === 'inbox') await viewInbox(setView);
  else if (r.name === 'roles') await viewRoles(setView);
  else if (r.name === 'interface') await viewInterface(setView);
  else if (r.name === 'docs') await viewDocs(r, setView);
  else if (r.name === 'users') await viewUsers(setView, r);
  else viewNotFound();
  if (currentRoute !== r) return; // bu sırada başka bir rotaya geçildi
  renderNav(r);
  // Derin bağlantı: #/<sayfa>?open=<tür>:<no> belge panelini açar (ör. ?open=order:10000001)
  if (r.query?.open && !refresh) {
    const ref = r.query.open;
    stripQuery();
    openDocRef(ref);
  }
  if (!firstRender && !refresh) {
    if (!sameTrack) {
      window.scrollTo({ top: 0 });
      $main.focus({ preventScroll: true });
    } else {
      // Aynı yol içinde bölüm değişti: sekmeler ekranın üstünde kaldıysa geri getir
      const tabs = $view.querySelector('.tabs');
      if (tabs && tabs.getBoundingClientRect().top < 0) tabs.scrollIntoView({ block: 'start' });
    }
  }
  firstRender = false;
}

(async function init() {
  const saved = prefs.getTheme();
  if (saved) applyTheme(saved);
  updateThemeButtons();

  try {
    await Promise.all([loadTracks(), loadRoles(), loadReleases()]);
    processPending(); // önceki oturumda yarım kalan aktarımlar
  } catch (e) {
    console.error(e);
    setView(
      `<section class="panel card">${emptyState('inbox', 'Veriler yüklenemedi', 'Bağlantını kontrol edip sayfayı yenile.', '<button class="btn btn-primary" onclick="location.reload()">Yenile</button>')}</section>`
    );
    return;
  }
  start(route);
})();

// ---------- service worker ----------
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((e) => console.warn('SW kaydı başarısız', e));
  });
}
