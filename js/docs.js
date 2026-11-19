// Dokümantasyon merkezi (#/docs, #/docs/<slug>, #/docs/glossary)
// İçerik: data/docs/index.json + data/docs/<slug>.md + data/docs/glossary.json
import { icon } from './icons.js';
import { esc, norm, badge, emptyState, progressBar, toast, openDrawer, closeDrawer, drawerHead } from './ui.js';
import { renderMarkdown, plainText } from './markdown.js';

const READ_KEY = 'erp-akademi:docs-read';
const TR_ALPHABET = 'A B C Ç D E F G Ğ H I İ J K L M N O Ö P R S Ş T U Ü V Y Z'.split(' ');

let IDX = null;
let GL = null;
const mdCache = new Map();
let corpus = null;
let observers = [];
let glState = { q: '', cat: '', letter: '' };

// ---------- veri ----------
async function getJSON(url) {
  const r = await fetch(url, { cache: 'no-cache' });
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return r.json();
}
async function loadIndex() {
  if (!IDX) IDX = await getJSON('data/docs/index.json');
  return IDX;
}
async function loadGlossary() {
  if (!GL) GL = await getJSON('data/docs/glossary.json');
  return GL;
}
async function loadMd(slug) {
  if (!mdCache.has(slug)) {
    const r = await fetch(`data/docs/${encodeURIComponent(slug)}.md`, { cache: 'no-cache' });
    if (!r.ok) throw new Error(`${slug}.md: ${r.status}`);
    mdCache.set(slug, await r.text());
  }
  return mdCache.get(slug);
}
async function loadCorpus() {
  if (corpus) return corpus;
  await Promise.all([loadIndex(), loadGlossary()]);
  const bodies = await Promise.all(IDX.articles.map((a) => loadMd(a.slug).catch(() => '')));
  corpus = [
    ...IDX.articles.map((a, i) => {
      const body = plainText(bodies[i]);
      return { kind: 'article', a, title: a.title, nTitle: norm(a.title), nTags: norm(a.tags.join(' ')), nSum: norm(a.summary), body, nBody: norm(body) };
    }),
    ...GL.terms.map((t) => ({ kind: 'term', t, title: t.term, nTitle: norm(`${t.term} ${t.en || ''}`), nTags: '', nSum: '', body: t.def, nBody: norm(t.def) })),
  ];
  return corpus;
}

const catOf = (id) => IDX.categories.find((c) => c.id === id);
const articleOf = (slug) => IDX.articles.find((a) => a.slug === slug);

// ---------- okundu ----------
function readMap() {
  try {
    return JSON.parse(localStorage.getItem(READ_KEY)) || {};
  } catch {
    return {};
  }
}
function setRead(slug, value) {
  const m = readMap();
  if (value) m[slug] = new Date().toISOString();
  else delete m[slug];
  try {
    localStorage.setItem(READ_KEY, JSON.stringify(m));
  } catch {}
}
const isRead = (slug) => !!readMap()[slug];

// ---------- arama ----------
function tokens(q) {
  return norm(q).split(/\s+/).filter((t) => t.length >= 2);
}

function highlight(text, toks) {
  const lower = norm(text);
  const marks = [];
  for (const t of toks) {
    let from = 0;
    let k;
    while ((k = lower.indexOf(t, from)) !== -1) {
      marks.push([k, k + t.length]);
      from = k + t.length;
    }
  }
  marks.sort((a, b) => a[0] - b[0]);
  let out = '';
  let pos = 0;
  for (const [s, e] of marks) {
    if (s < pos) continue;
    out += esc(text.slice(pos, s)) + `<mark>${esc(text.slice(s, e))}</mark>`;
    pos = e;
  }
  return out + esc(text.slice(pos));
}

function snippet(body, nBody, toks) {
  const k = Math.min(...toks.map((t) => nBody.indexOf(t)).filter((x) => x >= 0));
  if (!Number.isFinite(k)) return esc(body.slice(0, 120)) + '…';
  const s = Math.max(0, k - 50);
  const piece = body.slice(s, k + 90);
  return (s > 0 ? '…' : '') + highlight(piece, toks) + (k + 90 < body.length ? '…' : '');
}

export function search(q, limit = 8) {
  const toks = tokens(q);
  if (!toks.length || !corpus) return [];
  const res = [];
  for (const d of corpus) {
    let score = 0;
    let all = true;
    for (const t of toks) {
      const s = (d.nTitle.includes(t) ? 10 : 0) + (d.nTags.includes(t) ? 6 : 0) + (d.nSum.includes(t) ? 4 : 0) + Math.min(5, d.nBody.split(t).length - 1);
      if (!s) { all = false; break; }
      score += s;
    }
    if (all) res.push({ d, score: score + (d.kind === 'article' ? 1 : 0) });
  }
  return res
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ d }) => ({
      kind: d.kind,
      href: d.kind === 'article' ? `#/docs/${d.a.slug}` : `#/docs/glossary?term=${d.t.id}`,
      title: highlight(d.title, toks),
      meta: d.kind === 'article' ? esc(catOf(d.a.category)?.name || '') : `Sözlük · ${esc(d.t.cat)}`,
      snippet: snippet(d.body, d.nBody, toks),
    }));
}

function searchBox() {
  return `<div class="docs-search" data-search>
    <label class="search">${icon('search')}<input type="search" data-docs-q placeholder="Dokümanlarda ara: ör. kredi blokajı, MIGO, IDoc" autocomplete="off" spellcheck="false" aria-label="Dokümanlarda ara" aria-controls="docs-results" aria-expanded="false"></label>
    <div class="docs-results card" id="docs-results" role="listbox" hidden></div>
  </div>`;
}

function bindSearch(root, initialQuery = '') {
  const box = root.querySelector('[data-search]');
  if (!box) return;
  const input = box.querySelector('[data-docs-q]');
  const panel = box.querySelector('.docs-results');
  let active = -1;
  let timer;

  const close = () => {
    panel.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    active = -1;
  };
  const draw = async () => {
    const q = input.value.trim();
    if (q.length < 2) return close();
    await loadCorpus();
    const res = search(q);
    panel.innerHTML = res.length
      ? res.map((r, i) => `<a class="dr-item" role="option" href="${esc(r.href)}" data-i="${i}">
          <span class="dr-ico">${icon(r.kind === 'article' ? 'book' : 'tag')}</span>
          <span class="dr-body"><span class="dr-title">${r.title}</span><span class="dr-meta">${r.meta}</span><span class="dr-snip">${r.snippet}</span></span>
        </a>`).join('')
      : `<div class="dr-empty">${icon('search')}<span>"${esc(q)}" için sonuç yok. Farklı bir terim dene.</span></div>`;
    panel.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    active = -1;
  };

  input.addEventListener('focus', () => loadCorpus());
  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(draw, 120);
  });
  input.addEventListener('keydown', (e) => {
    const items = [...panel.querySelectorAll('.dr-item')];
    if (e.key === 'Escape') return close();
    if (!items.length) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      active = (active + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      items.forEach((el, i) => el.classList.toggle('is-active', i === active));
      items[active].scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      location.hash = (items[active] || items[0]).getAttribute('href');
    }
  });
  closeSearch = () => box.isConnected && close();
  currentBox = box;
  panel.addEventListener('click', () => close());
  if (initialQuery) {
    input.value = initialQuery;
    draw();
  }
}

// Arama dışına tıklanınca sonuçları kapat (tek, kalıcı dinleyici)
let currentBox = null;
let closeSearch = () => {};
document.addEventListener('click', (e) => {
  if (currentBox && !currentBox.contains(e.target)) closeSearch();
});

// ---------- kenar çubuğu ----------
function treeHtml(currentSlug, toc = []) {
  const read = readMap();
  const cats = IDX.categories
    .map((c) => {
      const arts = IDX.articles.filter((a) => a.category === c.id);
      const open = arts.some((a) => a.slug === currentSlug);
      const nRead = arts.filter((a) => read[a.slug]).length;
      return `<details class="tree-cat"${open ? ' open' : ''}>
        <summary><span class="tree-ico">${icon(c.icon)}</span><span class="tree-name">${esc(c.name)}</span><span class="tree-count">${nRead}/${arts.length}</span></summary>
        <ul>${arts
          .map((a) => `<li><a class="tree-art${a.slug === currentSlug ? ' is-active' : ''}" href="#/docs/${esc(a.slug)}" data-slug="${esc(a.slug)}">
            <span class="tree-read${read[a.slug] ? ' is-read' : ''}" aria-label="${read[a.slug] ? 'Okundu' : 'Okunmadı'}">${icon('check')}</span>
            <span>${esc(a.title)}</span></a></li>`)
          .join('')}</ul>
      </details>`;
    })
    .join('');

  return `<nav class="tree" aria-label="Doküman kategorileri">
    <a class="tree-top${!currentSlug ? ' is-active' : ''}" href="#/docs">${icon('grid')}<span>Genel bakış</span></a>
    <a class="tree-top${currentSlug === 'glossary' ? ' is-active' : ''}" href="#/docs/glossary">${icon('tag')}<span>Sözlük</span></a>
    <div class="tree-label">Kategoriler</div>
    ${cats}
  </nav>
  ${toc.length ? `<nav class="toc" aria-label="Bu sayfada"><div class="tree-label">Bu sayfada</div>
    ${toc.map((t) => `<button type="button" class="toc-item lvl-${t.level}" data-act="toc" data-id="${esc(t.id)}">${esc(t.text)}</button>`).join('')}
  </nav>` : ''}`;
}

function shell(main, { slug = null, toc = [], crumbs = '' } = {}) {
  return `<div class="docs" data-docs>
    <div class="docs-top">
      <button class="btn btn-ghost docs-menu-btn" type="button" data-act="tree">${icon('layers')}<span>Kategoriler</span></button>
      ${searchBox()}
    </div>
    <div class="docs-layout">
      <aside class="docs-side">${treeHtml(slug, toc)}</aside>
      <div class="docs-main">${crumbs}${main}</div>
    </div>
  </div>`;
}

function scrollToId(id) {
  const el = document.getElementById(id);
  if (!el) return;
  const top = el.getBoundingClientRect().top + window.scrollY - 16;
  window.scrollTo({ top, behavior: 'smooth' });
}

function bindCommon(root, { slug, toc, q = '' }) {
  bindSearch(root, q);
  root.addEventListener('click', (e) => {
    const t = e.target.closest('[data-act]');
    if (!t) return;
    if (t.dataset.act === 'toc') scrollToId(t.dataset.id);
    if (t.dataset.act === 'tree') {
      openDrawer(drawerHead('Dokümantasyon', 'Kategoriler') + `<div class="drawer-body docs-drawer">${treeHtml(slug, toc)}</div>`, (el) => {
        if (el.dataset.act === 'toc') {
          closeDrawer(true);
          scrollToId(el.dataset.id);
        }
      });
    }
  });
}

function cleanup() {
  observers.forEach((o) => o.disconnect());
  observers = [];
}

// ---------- görünümler ----------
export async function viewDocs(route, setView) {
  cleanup();
  try {
    await loadIndex();
  } catch (e) {
    console.error(e);
    setView(`<section class="panel card">${emptyState('book', 'Dokümanlar yüklenemedi', 'Bağlantını kontrol edip sayfayı yenile.')}</section>`, 'Dokümantasyon');
    return;
  }
  const slug = route.slug;
  if (!slug) return viewHome(setView, route.query?.q || '');
  if (slug === 'glossary') return viewGlossary(route, setView);
  return viewArticle(slug, setView);
}

function viewHome(setView, q = '') {
  const read = readMap();
  const total = IDX.articles.length;
  const nRead = IDX.articles.filter((a) => read[a.slug]).length;
  const cards = IDX.categories
    .map((c, i) => {
      const arts = IDX.articles.filter((a) => a.category === c.id);
      return `<section class="cat-card card" style="--i:${i}">
        <header><span class="icon-tile sm" style="--accent:var(--primary)">${icon(c.icon)}</span><div><h3>${esc(c.name)}</h3><span class="cell-sub">${esc(c.description)}</span></div></header>
        <ul>${arts.map((a) => `<li><a href="#/docs/${esc(a.slug)}"><span class="tree-read${read[a.slug] ? ' is-read' : ''}">${icon('check')}</span><span>${esc(a.title)}</span><span class="cell-sub">${a.readingMinutes} dk</span></a></li>`).join('')}</ul>
      </section>`;
    })
    .join('');

  const main = `
    <header class="docs-hero">
      <p class="eyebrow">Bilgi bankası</p>
      <h1>Dokümantasyon</h1>
      <p class="lead">SAP, CRM ve ERP süreçleri için başvuru makaleleri. Her makalede gerçek işlem kodları, Ege Dağıtım'dan örnekler ve uygulamada deneme bağlantıları var.</p>
      <div class="docs-progress">
        <div><span class="stat-label">Okuma ilerlemesi</span><strong>${nRead} / ${total}</strong></div>
        ${progressBar(total ? (nRead / total) * 100 : 0, 'var(--primary)')}
      </div>
    </header>
    <a class="gloss-card card" href="#/docs/glossary">
      <span class="icon-tile" style="--accent:var(--tone-violet)">${icon('tag')}</span>
      <span><strong>Sözlük</strong><span class="cell-sub">CRM, ERP ve SAP terimleri A–Z · arama ve harf filtresi</span></span>
      ${icon('back', 'chev')}
    </a>
    <div class="cat-grid">${cards}</div>`;

  setView(shell(main), 'Dokümantasyon');
  bindCommon(document.querySelector('[data-docs]'), { slug: null, toc: [], q });
}

async function viewArticle(slug, setView) {
  const a = articleOf(slug);
  if (!a) {
    setView(shell(`<div class="card">${emptyState('book', 'Makale bulunamadı', 'Bu makale kaldırılmış veya adı değişmiş olabilir.', '<a class="btn btn-primary" href="#/docs">Dokümantasyona dön</a>')}</div>`), 'Dokümantasyon');
    bindCommon(document.querySelector('[data-docs]'), { slug: null, toc: [] });
    return;
  }
  let src;
  try {
    src = await loadMd(slug);
  } catch (e) {
    console.error(e);
    src = '> [!UYARI]\n> Makale içeriği yüklenemedi. Bağlantını kontrol edip sayfayı yenile.';
  }
  const { html, toc } = renderMarkdown(src);
  const cat = catOf(a.category);
  const order = IDX.categories.flatMap((c) => IDX.articles.filter((x) => x.category === c.id));
  const pos = order.findIndex((x) => x.slug === slug);
  const prev = order[pos - 1];
  const next = order[pos + 1];

  // ilgili makaleler: açık tanım + aynı kategori + ortak etiket
  const relSet = new Set(a.related || []);
  IDX.articles.filter((x) => x.slug !== slug && x.category === a.category).forEach((x) => relSet.add(x.slug));
  IDX.articles
    .filter((x) => x.slug !== slug && x.tags.some((t) => a.tags.includes(t)))
    .forEach((x) => relSet.add(x.slug));
  relSet.delete(slug);
  const related = [...relSet].slice(0, 4).map(articleOf).filter(Boolean);
  const read = isRead(slug);

  const crumbs = `<nav class="crumbs" aria-label="Konum"><a href="#/docs">Dokümantasyon</a><span>›</span><span>${esc(cat?.name || '')}</span></nav>`;
  const main = `
    <article class="doc">
      <header class="doc-head">
        <h1>${esc(a.title)}</h1>
        <p class="lead">${esc(a.summary)}</p>
        <div class="doc-meta">
          <span class="meta-line">${icon('clock')}<span>${a.readingMinutes} dk okuma</span></span>
          <span data-read-badge>${read ? badge('Okundu', 'success') : badge('Okunmadı', 'neutral')}</span>
          <span class="chips">${a.tags.map((t) => `<span class="chip static">${esc(t)}</span>`).join('')}</span>
        </div>
      </header>
      <div class="md">${html}</div>
      <div class="doc-end" data-doc-end>${endBox(slug, read)}</div>
      <nav class="doc-nav">
        ${prev ? `<a class="doc-nav-btn" href="#/docs/${esc(prev.slug)}"><span class="cell-sub">← Önceki</span><strong>${esc(prev.title)}</strong></a>` : '<span></span>'}
        ${next ? `<a class="doc-nav-btn next" href="#/docs/${esc(next.slug)}"><span class="cell-sub">Sonraki →</span><strong>${esc(next.title)}</strong></a>` : ''}
      </nav>
      ${related.length ? `<section class="related"><h2 class="list-title">İlgili makaleler</h2><div class="related-grid">${related
        .map((r) => `<a class="related-card card" href="#/docs/${esc(r.slug)}"><span class="cell-sub">${esc(catOf(r.category)?.name || '')} · ${r.readingMinutes} dk</span><strong>${esc(r.title)}</strong><span class="cell-sub">${esc(r.summary)}</span>${isRead(r.slug) ? badge('Okundu', 'success') : ''}</a>`)
        .join('')}</div></section>` : ''}
    </article>`;

  setView(shell(main, { slug, toc, crumbs }), a.title);
  const root = document.querySelector('[data-docs]');
  bindCommon(root, { slug, toc });
  bindArticle(root, slug, toc);
}

function endBox(slug, read) {
  return read
    ? `<span class="end-ok">${icon('check')}<span>Bu makaleyi okudun.</span></span><button class="link small" type="button" data-unread="${esc(slug)}">Okunmadı olarak işaretle</button>`
    : `<span class="cell-sub">${icon('book')} Sona kadar okuduğunda makale otomatik olarak "Okundu" işaretlenir.</span>`;
}

function refreshReadUi(root, slug) {
  const read = isRead(slug);
  root.querySelector('[data-doc-end]').innerHTML = endBox(slug, read);
  root.querySelector('[data-read-badge]').innerHTML = read ? badge('Okundu', 'success') : badge('Okunmadı', 'neutral');
  // Kenar çubuğundaki okundu işaretleri ve kategori sayaçları
  const side = root.querySelector('.docs-side');
  side.innerHTML = treeHtml(slug, JSON.parse(side.dataset.toc || '[]'));
}

function bindArticle(root, slug, toc) {
  root.querySelector('.docs-side').dataset.toc = JSON.stringify(toc);

  root.addEventListener('click', (e) => {
    const u = e.target.closest('[data-unread]');
    if (u) {
      setRead(slug, false);
      refreshReadUi(root, slug);
      toast('Makale okunmadı olarak işaretlendi');
    }
  });

  // Sona kaydırınca otomatik okundu
  const end = root.querySelector('[data-doc-end]');
  if ('IntersectionObserver' in window && end) {
    const io = new IntersectionObserver((entries) => {
      if (!entries.some((en) => en.isIntersecting) || isRead(slug)) return;
      const scrolled = window.scrollY > 120 || document.documentElement.scrollHeight <= window.innerHeight + 80;
      if (!scrolled) return;
      setRead(slug, true);
      refreshReadUi(root, slug);
      toast('Makale okundu olarak işaretlendi');
    }, { threshold: 0.6 });
    io.observe(end);
    observers.push(io);
  }

  // İçindekiler: aktif bölümü vurgula
  if ('IntersectionObserver' in window && toc.length) {
    const spy = new IntersectionObserver((entries) => {
      const vis = entries.filter((en) => en.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (!vis) return;
      root.querySelectorAll('.toc-item').forEach((b) => b.classList.toggle('is-active', b.dataset.id === vis.target.id));
    }, { rootMargin: '0px 0px -70% 0px' });
    toc.forEach((t) => {
      const h = document.getElementById(t.id);
      if (h) spy.observe(h);
    });
    observers.push(spy);
  }
}

// ---------- sözlük ----------
async function viewGlossary(route, setView) {
  try {
    await loadGlossary();
  } catch (e) {
    console.error(e);
    setView(shell(`<div class="card">${emptyState('tag', 'Sözlük yüklenemedi', 'Bağlantını kontrol edip sayfayı yenile.')}</div>`, { slug: 'glossary' }), 'Sözlük');
    return;
  }
  const focus = route.query?.term || null;
  if (focus) glState = { q: '', cat: '', letter: '' };

  const crumbs = `<nav class="crumbs" aria-label="Konum"><a href="#/docs">Dokümantasyon</a><span>›</span><span>Sözlük</span></nav>`;
  const main = `
    <header class="docs-hero compact">
      <h1>Sözlük</h1>
      <p class="lead">${GL.terms.length} terim · CRM, ERP ve SAP kavramlarının kısa tanımları, ilgili makaleler ve çapraz bağlantılar.</p>
    </header>
    <div class="toolbar gl-toolbar">
      <label class="search">${icon('search')}<input type="search" data-gl-q placeholder="Terim veya tanımda ara" value="${esc(glState.q)}" autocomplete="off" aria-label="Sözlükte ara"></label>
      <div class="seg-ctrl" role="tablist" aria-label="Kategori">${['', 'CRM', 'ERP', 'SAP']
        .map((c) => `<button type="button" role="tab" data-gl-cat="${c}" aria-selected="${glState.cat === c}" class="${glState.cat === c ? 'is-active' : ''}">${c || 'Tümü'}</button>`)
        .join('')}</div>
    </div>
    <div class="letters" role="toolbar" aria-label="Harf filtresi" data-letters></div>
    <div class="gl-list" data-gl-list></div>`;

  setView(shell(main, { slug: 'glossary', crumbs }), 'Sözlük');
  const root = document.querySelector('[data-docs]');
  bindCommon(root, { slug: 'glossary', toc: [] });

  const draw = () => drawGlossary(root);
  root.querySelector('[data-gl-q]').addEventListener('input', (e) => {
    glState.q = e.target.value;
    draw();
  });
  root.addEventListener('click', (e) => {
    const c = e.target.closest('[data-gl-cat]');
    if (c) {
      glState.cat = c.dataset.glCat;
      root.querySelectorAll('[data-gl-cat]').forEach((b) => {
        b.classList.toggle('is-active', b === c);
        b.setAttribute('aria-selected', String(b === c));
      });
      return draw();
    }
    const l = e.target.closest('[data-letter]');
    if (l && !l.disabled) {
      glState.letter = glState.letter === l.dataset.letter ? '' : l.dataset.letter;
      return draw();
    }
    const s = e.target.closest('[data-see]');
    if (s) {
      glState = { ...glState, q: '', letter: '' };
      root.querySelector('[data-gl-q]').value = '';
      draw();
      flashTerm(s.dataset.see);
    }
  });
  draw();
  // Rota değişiminde uygulama sayfayı başa kaydırır; derin bağlantı kaydırması ondan sonra çalışmalı
  if (focus) setTimeout(() => flashTerm(focus, 'auto'), 60);
}

const firstLetter = (t) => t.term.trim()[0].toLocaleUpperCase('tr-TR');

function drawGlossary(root) {
  const toks = tokens(glState.q);
  const byCat = GL.terms.filter((t) => !glState.cat || t.cat === glState.cat);
  const matches = byCat.filter((t) => !toks.length || toks.every((k) => norm(`${t.term} ${t.en || ''} ${t.def}`).includes(k)));
  const present = new Set(matches.map(firstLetter));
  const list = matches.filter((t) => !glState.letter || firstLetter(t) === glState.letter).sort((a, b) => a.term.localeCompare(b.term, 'tr'));

  root.querySelector('[data-letters]').innerHTML = TR_ALPHABET.map(
    (L) => `<button type="button" class="letter${glState.letter === L ? ' is-active' : ''}" data-letter="${L}" ${present.has(L) ? '' : 'disabled'} aria-pressed="${glState.letter === L}">${L}</button>`
  ).join('');

  const groups = new Map();
  list.forEach((t) => {
    const L = firstLetter(t);
    if (!groups.has(L)) groups.set(L, []);
    groups.get(L).push(t);
  });
  const termName = (id) => GL.terms.find((x) => x.id === id)?.term || id;

  root.querySelector('[data-gl-list]').innerHTML = list.length
    ? [...groups]
        .map(
          ([L, ts]) => `<section class="gl-group"><h2 class="gl-letter">${L}</h2>${ts
            .map((t) => {
              const art = t.article && articleOf(t.article);
              return `<article class="gterm card" id="term-${esc(t.id)}">
                <header><h3>${toks.length ? highlight(t.term, toks) : esc(t.term)}</h3>${t.en ? `<span class="concept-en">${esc(t.en)}</span>` : ''}${badge(t.cat, t.cat === 'CRM' ? 'info' : t.cat === 'ERP' ? 'success' : 'neutral')}</header>
                <p>${toks.length ? highlight(t.def, toks) : esc(t.def)}</p>
                ${art || t.see?.length ? `<footer>
                  ${art ? `<a class="link small" href="#/docs/${esc(art.slug)}">${icon('book')} ${esc(art.title)}</a>` : ''}
                  ${t.see?.length ? `<span class="gl-see"><span class="cell-sub">Bkz:</span>${t.see.map((s) => `<button type="button" class="chip" data-see="${esc(s)}">${esc(termName(s))}</button>`).join('')}</span>` : ''}
                </footer>` : ''}
              </article>`;
            })
            .join('')}</section>`
        )
        .join('')
    : `<div class="card">${emptyState('search', 'Eşleşen terim yok', 'Aramayı veya filtreleri değiştirmeyi dene.')}</div>`;
}

function flashTerm(id, behavior = 'smooth') {
  const el = document.getElementById(`term-${id}`);
  if (!el) return;
  const top = el.getBoundingClientRect().top + window.scrollY - 90;
  window.scrollTo({ top, behavior });
  el.classList.remove('flash');
  void el.offsetWidth;
  el.classList.add('flash');
}

export async function docsReadCount() {
  await loadIndex();
  const r = readMap();
  return IDX.articles.filter((a) => r[a.slug]).length;
}
