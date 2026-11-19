// Test Laboratuvarı (Test Uzmanlığı > Simülasyon, simulation.type = "test-lab")
// Gereksinim → test case → koşum → defect → düzeltme → yeniden test → kapanış
import { icon } from './icons.js';
import { esc, badge, emptyState, toast, openDrawer, closeDrawer, drawerHead, datetime, alertBox, kv, dsec, progressBar } from './ui.js';
import { loadRoles, can, actionBtn, currentUser, userLabel, holders, roleById } from './auth.js';
import {
  loadReleases, releasesData, currentReleaseId, currentRelease, setRelease, releaseById, flagActive, fixFlag, fixedCount,
  resetFixes, bugForRequirement,
} from './release.js';
import { progress } from './store.js';
import { loadCompany, company, partnerOf, productOf } from './company.js';
import { renderQuoteSim, applyPreset, hasDraft } from './sim-quote.js';
import { loadMM, renderMM, embedContext as mmEmbed } from './mm.js';

const KEY = 'erp-akademi:testlab';
const LEVELS = ['Kritik', 'Yüksek', 'Orta', 'Düşük'];
const LEVEL_TONE = { Kritik: 'danger-solid', Yüksek: 'danger', Orta: 'warning', Düşük: 'neutral' };
const RESULT = {
  pass: { label: 'Geçti', tone: 'success' },
  fail: { label: 'Kaldı', tone: 'danger' },
  blocked: { label: 'Bloke', tone: 'warning' },
  none: { label: 'Koşulmadı', tone: 'neutral' },
};
const DSTATUS = {
  new: { label: 'Yeni', tone: 'neutral' },
  assigned: { label: 'Atandı', tone: 'info' },
  fixing: { label: 'Düzeltiliyor', tone: 'warning' },
  retest: { label: 'Yeniden teste hazır', tone: 'info' },
  notrepro: { label: 'Tekrarlanamadı', tone: 'neutral' },
  reopened: { label: 'Yeniden açıldı', tone: 'danger' },
  closed: { label: 'Kapandı', tone: 'success' },
};
const DACTION = {
  created: 'Defect açtı', assigned: 'Atadı', started: 'Düzeltmeye başladı', fixed: 'Düzeltti', notrepro: 'Tekrarlayamadı',
  closed: 'Kapattı', reopened: 'Yeniden açtı', 'req-changed': 'Gereksinimi değiştirdi',
};

let view = 'panel';
let defFilter = 'open';
let ctx = null;
let B2B = null;

const clone = (o) => JSON.parse(JSON.stringify(o));
const nowIso = () => new Date().toISOString();
const rb = (k, map = RESULT) => badge(map[k]?.label || k, map[k]?.tone || 'neutral');

// ---------- depolama ----------
function read() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    return { cases: null, runs: [], defects: [], seq: {}, activeRun: null, ...(s || {}) };
  } catch {
    return { cases: null, runs: [], defects: [], seq: {}, activeRun: null };
  }
}
function write(s) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {}
}
function nextNo(s, kind, prefix) {
  s.seq[kind] = (s.seq[kind] || 0) + 1;
  return `${prefix}-${String(s.seq[kind]).padStart(3, '0')}`;
}

const cfg = () => ctx.content;
const reqs = () => cfg().requirements || [];
const reqById = (id) => reqs().find((r) => r.id === id);
function cases(s = read()) {
  return s.cases || clone(cfg().sampleCases || []).map((c) => ({ ...c, sample: true }));
}
const caseById = (id, s = read()) => cases(s).find((c) => c.id === id) || null;

// ---------- sonuçlar ----------
const finishedRuns = (caseId, rel = currentReleaseId(), s = read()) =>
  s.runs.filter((r) => r.caseId === caseId && r.release === rel && r.status === 'done').sort((a, b) => b.finishedAt.localeCompare(a.finishedAt));
const latestResult = (caseId, rel, s) => finishedRuns(caseId, rel, s)[0]?.result || 'none';
const casesForReq = (reqId, s) => cases(s).filter((c) => c.requirements.includes(reqId));
const openDefects = (s = read()) => s.defects.filter((d) => d.status !== 'closed');

function reqResult(reqId, s) {
  const rs = casesForReq(reqId, s).map((c) => latestResult(c.id, currentReleaseId(), s));
  if (!rs.length) return 'uncovered';
  if (rs.includes('fail')) return 'fail';
  if (rs.includes('blocked')) return 'blocked';
  if (rs.every((r) => r === 'pass')) return 'pass';
  return 'none';
}

// ---------- giriş noktası ----------
let firstMount = true;
export async function renderTestLab(c) {
  ctx = c;
  // Sayfa ilk açıldığında devam eden koşum varsa doğrudan oraya git
  if (firstMount) {
    firstMount = false;
    if (read().activeRun) view = 'run';
  }
  await Promise.all([loadCompany(), loadRoles(), loadReleases(), loadB2B()]);
  return {
    html: `<div class="tl" data-tl>${headHtml()}<div data-tl-body></div></div>`,
    bind(container) {
      const root = container.querySelector('[data-tl]');
      bindRoot(root);
      drawBody(root);
    },
  };
}

// Gömülü teklif simülasyonu B2B CRM yolunun simülasyon ayarlarıyla çalışır
const simContext = () => (B2B ? { track: { id: 'b2b-crm' }, content: B2B.sections.simulation, data: B2B, route: { query: {} } } : null);

async function loadB2B() {
  if (!B2B) {
    const r = await fetch('data/tracks/b2b-crm.json', { cache: 'no-cache' });
    B2B = await r.json();
  }
  return B2B;
}

function techLeadBox() {
  if (holders('DEFECT_FIX').length) return '';
  const tl = roleById('tech-lead');
  return `<div class="role-banner tl-warn">${icon('user')}<span><strong>${esc(tl?.name || 'Teknik Lider')} rolünde kullanıcı yok.</strong> Defect'leri düzeltecek (DEFECT_FIX) kimse olmadığı için atama yapılamaz. Kullanıcı Yönetimi'nden oluştur${can('USER_ADMIN') ? '' : ' (USER_ADMIN gerekir: Key User rolüne geç)'}.</span>
    <a class="btn btn-primary" href="#/users?new=tech-lead">${icon('users')}<span>Kullanıcı Yönetimi'nden oluştur</span></a></div>`;
}

function headHtml() {
  const R = releasesData();
  const cur = currentRelease();
  const fc = fixedCount();
  const s = read();
  const active = s.activeRun ? s.runs.find((r) => r.id === s.activeRun) : null;
  const tab = (id, label, n = '') => `<button type="button" role="tab" data-tab="${id}" aria-selected="${view === id}" class="${view === id ? 'is-active' : ''}">${label}${n}</button>`;
  const nOpen = openDefects(s).length;
  return `
    <section class="rel-card card">
      <div class="rel-left">
        <span class="stat-label">Sistem sürümü</span>
        <div class="seg-ctrl rel-seg" role="radiogroup" aria-label="Sistem sürümü">${R.releases
          .map((r) => `<button type="button" role="radio" data-rel="${esc(r.id)}" aria-checked="${r.id === cur.id}" class="${r.id === cur.id ? 'is-active' : ''}"><strong>${esc(r.name)}</strong><span class="cell-sub inline">${esc(r.label)}</span></button>`)
          .join('')}</div>
        <span class="cell-sub">Simülasyonlar seçili sürümün kurallarıyla çalışır. Hata Avı her zaman doğru sürümü kullanır.</span>
      </div>
      <div class="rel-right">
        <div class="rel-meta">${badge(cur.status, cur.status === 'Canlı' ? 'success' : 'warning')}<span class="cell-sub">${esc(cur.date)}</span>${fc.total ? badge(`Düzeltilen: ${fc.fixed}/${fc.total}`, fc.fixed === fc.total ? 'success' : 'info') : ''}</div>
        <ul class="rel-notes">${cur.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>
        ${fc.fixed ? `<button class="link small" type="button" data-reset-fixes>Düzeltmeleri geri al (sürümü baştan test et)</button>` : ''}
      </div>
    </section>
    ${techLeadBox()}
    <div class="toolbar">
      <div class="seg-ctrl tl-tabs" role="tablist" aria-label="Test laboratuvarı">
        ${tab('panel', 'Panel')}${tab('reqs', 'Gereksinimler')}${tab('cases', "Test case'ler")}${tab('run', 'Koşum', active ? ` <span class="count">1</span>` : '')}${tab('defects', "Defect'ler", nOpen ? ` <span class="count danger-count">${nOpen}</span>` : '')}${tab('trace', 'İzlenebilirlik')}
      </div>
    </div>`;
}

async function drawBody(root) {
  const body = root.querySelector('[data-tl-body]');
  const s = read();
  if (view === 'reqs') body.innerHTML = reqsView(s);
  else if (view === 'cases') body.innerHTML = casesView(s);
  else if (view === 'run') {
    body.innerHTML = runView(s);
    await mountSim(root);
  } else if (view === 'defects') body.innerHTML = defectsView(s);
  else if (view === 'trace') body.innerHTML = traceView(s);
  else body.innerHTML = panelView(s);
}

function redrawHead(root) {
  const tmp = document.createElement('div');
  tmp.innerHTML = headHtml();
  [...root.children].filter((el) => !el.matches('[data-tl-body]')).forEach((el) => el.remove());
  root.prepend(...tmp.children);
}

// ---------- panel ----------
function panelView(s) {
  const cs = cases(s);
  const rel = currentReleaseId();
  const results = cs.map((c) => latestResult(c.id, rel, s));
  const cnt = (k) => results.filter((r) => r === k).length;
  const executed = results.filter((r) => r !== 'none').length;
  const passRate = executed ? Math.round((cnt('pass') / executed) * 100) : 0;
  const covered = reqs().filter((r) => casesForReq(r.id, s).length).length;
  const open = openDefects(s);
  const bySev = LEVELS.map((l) => ({ l, n: open.filter((d) => d.severity === l).length }));
  const byStatus = Object.keys(DSTATUS).map((k) => ({ k, n: s.defects.filter((d) => d.status === k).length })).filter((x) => x.n);
  const seg = (k, n) => (n ? `<span class="sb-${k}" style="flex:${n}" title="${RESULT[k].label}: ${n}"></span>` : '');

  return `<div class="tl-panel">
    <div class="kpis">
      <div class="kpi card"><span class="stat-label">Gereksinim kapsaması</span><span class="kpi-value">${covered}/${reqs().length}</span>${progressBar((covered / reqs().length) * 100, covered === reqs().length ? 'var(--tone-success)' : 'var(--tone-warning)')}</div>
      <div class="kpi card"><span class="stat-label">Koşum ilerlemesi (${esc(rel)})</span><span class="kpi-value">${executed}/${cs.length}</span>${progressBar(cs.length ? (executed / cs.length) * 100 : 0, 'var(--primary)')}</div>
      <div class="kpi card"><span class="stat-label">Geçti oranı</span><span class="kpi-value ${executed && passRate < 100 ? 'neg' : executed ? 'ok' : ''}">${executed ? `%${passRate}` : '—'}</span><span class="cell-sub">${cnt('pass')} geçti · ${cnt('fail')} kaldı · ${cnt('blocked')} bloke</span></div>
      <div class="kpi card"><span class="stat-label">Açık defect</span><span class="kpi-value ${open.length ? 'neg' : 'ok'}">${open.length}</span><span class="cell-sub">${s.defects.length} toplam</span></div>
    </div>
    <section class="card tl-sec">
      <h3 class="card-title">Son sonuçlar (${esc(rel)})</h3>
      <div class="stackbar">${seg('pass', cnt('pass'))}${seg('fail', cnt('fail'))}${seg('blocked', cnt('blocked'))}${seg('none', cnt('none'))}</div>
      <div class="legend">${['pass', 'fail', 'blocked', 'none'].map((k) => `<span><i class="sb-${k}"></i>${RESULT[k].label} ${cnt(k)}</span>`).join('')}</div>
    </section>
    <section class="card tl-sec">
      <h3 class="card-title">Önem bazında açık defect'ler</h3>
      <div class="sev-tiles">${bySev.map((x) => `<div class="sev-tile sev-${LEVELS.indexOf(x.l)}"><span>${x.l}</span><strong>${x.n}</strong></div>`).join('')}</div>
      ${byStatus.length ? `<div class="chips mt-sm">${byStatus.map((x) => `<span class="chip static">${DSTATUS[x.k].label} · ${x.n}</span>`).join('')}</div>` : '<p class="cell-sub mt-sm">Henüz defect yok.</p>'}
    </section>
    <section class="card tl-sec">
      <h3 class="card-title">Çıkış kriterleri</h3>
      <ul class="exit-list">
        ${exitItem(covered === reqs().length, `Tüm gereksinimler kapsandı (${covered}/${reqs().length})`)}
        ${exitItem(executed === cs.length && cs.length > 0, `Tüm test case'ler koşuldu (${executed}/${cs.length})`)}
        ${exitItem(!open.some((d) => d.severity === 'Kritik' || d.severity === 'Yüksek'), 'Açık Kritik/Yüksek defect yok')}
        ${exitItem(executed > 0 && cnt('fail') === 0 && cnt('blocked') === 0, 'Kalan veya bloke test yok')}
      </ul>
    </section>
  </div>`;
}
const exitItem = (ok, text) => `<li class="${ok ? 'ok' : ''}"><span class="mark ${ok ? 'ok' : 'bad'}">${icon(ok ? 'check' : 'close')}</span>${esc(text)}</li>`;

// ---------- gereksinimler ----------
function reqsView(s) {
  const RR = { uncovered: { label: 'Kapsanmadı', tone: 'danger' }, ...RESULT };
  return `<div class="card table-card"><div class="table-wrap"><table class="table tl-table">
    <thead><tr><th>Gereksinim</th><th class="hide-sm">Alan</th><th class="hide-md">Öncelik</th><th>Test case</th><th>Durum</th></tr></thead>
    <tbody>${reqs()
      .map((r) => {
        const cs = casesForReq(r.id, s);
        return `<tr>
          <td><span class="code">${esc(r.id)}</span> <strong>${esc(r.title)}</strong><div class="cell-sub">${esc(r.detail)}</div></td>
          <td class="hide-sm">${esc(r.area)}</td>
          <td class="hide-md">${badge(r.priority, LEVEL_TONE[r.priority])}</td>
          <td><div class="chips">${cs.map((c) => `<button class="chip" type="button" data-edit-case="${esc(c.id)}">${esc(c.id)}</button>`).join('') || '<span class="muted">—</span>'}</div></td>
          <td>${rb(reqResult(r.id, s), RR)}</td>
        </tr>`;
      })
      .join('')}</tbody></table></div></div>`;
}

// ---------- test case'ler ----------
function casesView(s) {
  const cs = cases(s);
  const rel = currentReleaseId();
  return `<div class="toolbar">
      <span class="toolbar-count">${cs.length} test case · sonuçlar ${esc(rel)} sürümü için</span>
      ${actionBtn({ perm: 'DEFECT_CREATE', label: 'Yeni test case', iconName: 'flask', attrs: 'data-new-case' })}
    </div>
    <div class="case-grid">${cs
      .map(
        (c) => `<article class="card case-card">
        <header><span class="code">${esc(c.id)}</span>${badge(c.priority, LEVEL_TONE[c.priority])}${rb(latestResult(c.id, rel, s))}${c.sample ? badge('Örnek', 'neutral') : ''}</header>
        <h3>${esc(c.title)}</h3>
        <div class="chips">${c.requirements.map((r) => `<span class="chip static" title="${esc(reqById(r)?.title || '')}">${esc(r)}</span>`).join('')}</div>
        <p class="cell-sub">${c.steps.length} adım · ${esc(c.data || '')}</p>
        <div class="case-actions">
          <button class="btn btn-primary" type="button" data-run-case="${esc(c.id)}">${icon('play')}<span>Koş</span></button>
          ${actionBtn({ perm: 'DEFECT_CREATE', label: 'Düzenle', iconName: 'edit', cls: 'btn-ghost', attrs: `data-edit-case="${esc(c.id)}"` })}
        </div>
      </article>`
      )
      .join('')}</div>`;
}

function itemsText(preset) {
  return (preset?.items || []).map((i) => `${i.code} ${i.qty}`).join('\n');
}
function parseItems(txt) {
  return String(txt)
    .split('\n')
    .map((l) => l.match(/^\s*([A-Za-z]{2}-\d{4})\s*[x×*]?\s*(\d+)/))
    .filter(Boolean)
    .map((m) => ({ code: m[1].toUpperCase(), qty: Number(m[2]) }))
    .filter((i) => productOf(i.code) && i.qty > 0);
}

const stepRow = (st = { action: '', expected: '' }) => `<div class="step-edit" data-step-row>
  <span class="se-num"></span>
  <label class="field"><span class="field-label">Adım</span><textarea class="input textarea" rows="2" data-s-action>${esc(st.action)}</textarea></label>
  <label class="field"><span class="field-label">Beklenen sonuç</span><textarea class="input textarea" rows="2" data-s-expected>${esc(st.expected)}</textarea></label>
  <button class="icon-btn" type="button" data-act="del-step" aria-label="Adımı sil">${icon('close')}</button>
</div>`;

function openCaseEditor(id) {
  if (!can('DEFECT_CREATE')) return toast('Test case düzenlemek için DEFECT_CREATE gerekir');
  const c = id ? caseById(id) : { title: '', requirements: [], priority: 'Orta', precondition: '', data: '', steps: [{ action: '', expected: '' }], preset: null };
  const D = company();
  const partners = [...D.customers, ...(D.prospects || [])];
  const html =
    drawerHead(id ? `Test case · ${id}` : 'Yeni test case', id ? c.title : 'Test case oluştur', id && c.sample ? badge('Örnek', 'neutral') : '') +
    `<div class="drawer-body iam-form" data-case-form>
      <label class="field"><span class="field-label">Başlık <span class="req">*</span></span><input class="input" data-c="title" value="${esc(c.title)}" maxlength="100" placeholder="Ör. Teslimatta stok teslim miktarı kadar düşer"></label>
      <fieldset class="role-pick"><legend class="field-label">Bağlı gereksinim(ler) <span class="req">*</span></legend>
        ${reqs().map((r) => `<label class="role-opt"><input type="checkbox" data-c-req value="${esc(r.id)}" ${c.requirements.includes(r.id) ? 'checked' : ''}><span><strong>${esc(r.id)} · ${esc(r.title)}</strong><span class="cell-sub">${esc(r.detail)}</span></span></label>`).join('')}
      </fieldset>
      <div class="form-grid">
        <label class="field"><span class="field-label">Öncelik</span><select class="select" data-c="priority">${LEVELS.map((l) => `<option ${l === c.priority ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <label class="field"><span class="field-label">Simülasyon müşterisi (isteğe bağlı)</span><select class="select" data-c="customer"><option value="">—</option>${partners.map((p) => `<option value="${esc(p.id)}" ${c.preset?.customer === p.id ? 'selected' : ''}>${esc(p.id)} · ${esc(p.name)}</option>`).join('')}</select></label>
      </div>
      <label class="field"><span class="field-label">Simülasyon kalemleri (her satır: KOD MİKTAR)</span><textarea class="input textarea" rows="2" data-c="items" placeholder="GD-1001 10">${esc(itemsText(c.preset))}</textarea></label>
      <label class="field"><span class="field-label">Ön koşul</span><textarea class="input textarea" rows="2" data-c="precondition">${esc(c.precondition)}</textarea></label>
      <label class="field"><span class="field-label">Test verisi</span><textarea class="input textarea" rows="2" data-c="data">${esc(c.data)}</textarea></label>
      <div class="dsec"><h3>Adımlar ve beklenen sonuçlar</h3><div data-steps>${c.steps.map(stepRow).join('')}</div>
        <button class="btn btn-ghost" type="button" data-act="add-step">${icon('layers')}<span>Adım ekle</span></button></div>
      <div class="drawer-actions">
        <button class="btn btn-primary" type="button" data-act="case-save">${icon('check')}<span>${id ? 'Kaydet' : "Test case'i oluştur"}</span></button>
        ${id && !read().runs.some((r) => r.caseId === id) ? `<button class="btn btn-ghost danger" type="button" data-act="case-delete">${icon('close')}<span>Sil</span></button>` : ''}
        <button class="btn btn-ghost" type="button" data-close>Vazgeç</button>
      </div>
    </div>`;
  openDrawer(html, (el) => {
    const form = el.closest('[data-case-form]');
    if (el.dataset.act === 'add-step') {
      form.querySelector('[data-steps]').insertAdjacentHTML('beforeend', stepRow());
      form.querySelector('[data-step-row]:last-child [data-s-action]').focus();
    } else if (el.dataset.act === 'del-step') {
      if (form.querySelectorAll('[data-step-row]').length > 1) el.closest('[data-step-row]').remove();
      else toast('En az bir adım olmalı');
    } else if (el.dataset.act === 'case-save') saveCase(id, form);
    else if (el.dataset.act === 'case-delete') {
      if (!el.classList.contains('confirm')) {
        el.classList.add('confirm');
        el.querySelector('span').textContent = 'Silmek için tekrar dokun';
        return;
      }
      const s = read();
      s.cases = cases(s).filter((x) => x.id !== id);
      write(s);
      closeDrawer();
      toast(`${id} silindi`);
      refreshAll();
    }
  });
}

function saveCase(id, form) {
  const v = (k) => form.querySelector(`[data-c="${k}"]`)?.value.trim() || '';
  const requirements = [...form.querySelectorAll('[data-c-req]:checked')].map((x) => x.value);
  const steps = [...form.querySelectorAll('[data-step-row]')]
    .map((r) => ({ action: r.querySelector('[data-s-action]').value.trim(), expected: r.querySelector('[data-s-expected]').value.trim() }))
    .filter((st) => st.action || st.expected);
  if (!v('title')) return toast('Başlık zorunlu');
  if (!requirements.length) return toast('En az bir gereksinim seç');
  if (!steps.length || steps.some((st) => !st.action || !st.expected)) return toast('Her adımın hem işlemi hem beklenen sonucu olmalı');
  const items = parseItems(v('items'));
  const s = read();
  const list = cases(s);
  const rec = id ? list.find((c) => c.id === id) : { id: `TC-${String(Math.max(0, ...list.map((c) => Number(c.id.replace(/\D/g, '')) || 0)) + 1).padStart(2, '0')}` };
  Object.assign(rec, {
    title: v('title'), requirements, priority: v('priority'), precondition: v('precondition'), data: v('data'), steps,
    preset: v('customer') ? { customer: v('customer'), reference: rec.id, items } : null,
  });
  if (!id) list.push(rec);
  s.cases = list;
  write(s);
  closeDrawer();
  toast(id ? `${id} güncellendi` : `${rec.id} oluşturuldu`);
  refreshAll();
}

// ---------- koşum ----------
function runView(s) {
  const run = s.activeRun ? s.runs.find((r) => r.id === s.activeRun) : null;
  const c = run && caseById(run.caseId, s);
  if (!run || !c) {
    const recent = s.runs.filter((r) => r.status === 'done').slice(-12).reverse();
    return `<div class="card tl-sec">
        <h3 class="card-title">Koşulacak test case'i seç</h3>
        <ul class="run-pick">${cases(s)
          .map((x) => `<li><span class="code">${esc(x.id)}</span><span class="rp-title">${esc(x.title)}</span>${rb(latestResult(x.id, currentReleaseId(), s))}<button class="btn btn-primary" type="button" data-run-case="${esc(x.id)}">${icon('play')}<span>Koşumu başlat</span></button></li>`)
          .join('')}</ul>
      </div>
      ${recent.length ? `<section class="tl-sec"><h3 class="list-title">Son koşumlar</h3><div class="card table-card"><div class="table-wrap"><table class="table tl-table">
        <thead><tr><th>Koşum</th><th>Test case</th><th>Sürüm</th><th class="hide-sm">Koşan</th><th class="hide-md">Zaman</th><th>Sonuç</th></tr></thead>
        <tbody>${recent.map((r) => `<tr><td><span class="code">${esc(r.id)}</span></td><td>${esc(r.caseId)}</td><td>${esc(r.release)}</td><td class="hide-sm">${esc(userLabel(r.by))}</td><td class="hide-md">${datetime(r.finishedAt)}</td><td>${rb(r.result)}</td></tr>`).join('')}</tbody>
      </table></div></div></section>` : ''}`;
  }
  return `<div class="run-layout">
    <aside class="run-panel card" data-run-panel>${runPanel(s, run, c)}</aside>
    <section class="run-sim">
      <div class="run-sim-head">
        <strong>Simülasyon</strong>${badge(`Sürüm ${run.release}`, run.release === releasesData().default ? 'success' : 'warning')}
        <span class="cell-sub">Oturum: ${esc(userLabel(currentUser()?.id))}</span>
        <span class="run-links"><a class="link small" href="#/company/products">Ürün stokları</a><a class="link small" href="#/inbox">Onay Kutusu</a><a class="link small" href="#/interface">Aktarım Monitörü</a></span>
      </div>
      ${run.release !== currentReleaseId() ? alertBox('warning', 'Sürüm farklı', `Bu koşum ${esc(run.release)} için başlatıldı, seçili sürüm ${esc(currentReleaseId())}. Sonuçlar ${esc(run.release)} adına kaydedilir.`) : ''}
      <div data-sim-host></div>
    </section>
  </div>`;
}

function runPanel(s, run, c) {
  const marked = run.steps.filter((x) => x.status).length;
  return `
    <div class="run-head"><span class="code">${esc(run.id)}</span><span class="code">${esc(c.id)}</span>${badge(run.release, 'neutral')}</div>
    <h3>${esc(c.title)}</h3>
    <div class="chips">${c.requirements.map((r) => `<span class="chip static" title="${esc(reqById(r)?.title || '')}">${esc(r)}</span>`).join('')}</div>
    ${kv([['Ön koşul', esc(c.precondition || '—')], ['Test verisi', esc(c.data || '—')]])}
    <ol class="run-steps">${c.steps
      .map((st, i) => {
        const r = run.steps[i] || {};
        const def = s.defects.find((d) => d.runId === run.id && d.stepIndex === i);
        return `<li class="run-step ${r.status ? `st-${r.status}` : ''}">
          <span class="rs-num">${i + 1}</span>
          <div class="rs-body">
            <p class="rs-action">${esc(st.action)}</p>
            <p class="rs-exp"><span>Beklenen:</span> ${esc(st.expected)}</p>
            <div class="rs-btns" role="group" aria-label="Adım ${i + 1} sonucu">
              ${['pass', 'fail', 'blocked'].map((k) => `<button type="button" class="rs-btn rs-${k}${r.status === k ? ' is-on' : ''}" data-mark="${i}:${k}" aria-pressed="${r.status === k}">${icon(k === 'pass' ? 'check' : k === 'fail' ? 'close' : 'lock')}${RESULT[k].label}</button>`).join('')}
            </div>
            <input class="input rs-note" data-note="${i}" value="${esc(r.note || '')}" placeholder="${r.status === 'fail' ? 'Gerçekleşen sonucu yaz (defect\'e aktarılır)' : 'Not / gözlem'}">
            ${r.status === 'fail' ? (def ? `<button class="link small" type="button" data-defect="${esc(def.id)}">${icon('flask')} ${esc(def.id)} · ${esc(DSTATUS[def.status].label)}</button>` : actionBtn({ perm: 'DEFECT_CREATE', label: 'Defect aç', iconName: 'alert', cls: 'btn-ghost danger', attrs: `data-def-open="${i}"` })) : ''}
          </div>
        </li>`;
      })
      .join('')}</ol>
    <div class="run-foot">
      <span class="cell-sub">${marked}/${c.steps.length} adım işaretlendi</span>
      <button class="btn btn-ghost" type="button" data-cancel-run>${icon('close')}<span>İptal</span></button>
      <button class="btn btn-primary" type="button" data-finish>${icon('check')}<span>Koşumu bitir</span></button>
    </div>`;
}

async function mountSim(root) {
  const host = root.querySelector('[data-sim-host]');
  if (!host) return;
  const simCtx = simContext();
  // Sayfa yenilendiyse taslak boştur: aktif koşumun test verisini yeniden yükle
  const s = read();
  const run = s.runs.find((r) => r.id === s.activeRun);
  const c = run && caseById(run.caseId, s);
  // Satın alma (MM) test case'leri MM çalışma alanını gömer
  if (c?.sim === 'mm') {
    await loadMM();
    const mm = await renderMM(mmEmbed());
    if (!host.isConnected) return;
    host.innerHTML = mm.html;
    mm.bind(host);
    return;
  }
  if (c?.preset && !hasDraft()) applyPreset(c.preset, simCtx);
  const sim = await renderQuoteSim(simCtx);
  if (!host.isConnected) return;
  host.innerHTML = sim.html;
  sim.bind(host);
}

function startRun(caseId) {
  const s = read();
  if (s.activeRun && s.runs.some((r) => r.id === s.activeRun)) {
    view = 'run';
    toast('Önce aktif koşumu bitir veya iptal et');
    return refreshAll();
  }
  const c = caseById(caseId, s);
  if (!c) return;
  const run = { id: nextNo(s, 'run', 'RUN'), caseId, release: currentReleaseId(), by: currentUser()?.id, startedAt: nowIso(), status: 'active', steps: c.steps.map(() => ({ status: null, note: '' })) };
  s.runs.push(run);
  s.activeRun = run.id;
  write(s);
  if (c.preset) applyPreset(c.preset, simContext());
  view = 'run';
  toast(`${run.id} başladı · ${c.id}${c.preset ? ' · simülasyon test verisiyle açıldı' : ''}`);
  refreshAll();
}

function markStep(root, i, status) {
  const s = read();
  const run = s.runs.find((r) => r.id === s.activeRun);
  if (!run) return;
  run.steps[i].status = run.steps[i].status === status ? null : status;
  write(s);
  const panel = root.querySelector('[data-run-panel]');
  panel.innerHTML = runPanel(s, run, caseById(run.caseId, s));
}

function finishRun() {
  const s = read();
  const run = s.runs.find((r) => r.id === s.activeRun);
  if (!run) return;
  if (run.steps.some((x) => !x.status)) return toast('Bitirmeden önce tüm adımları Geçti / Kaldı / Bloke olarak işaretle');
  run.result = run.steps.some((x) => x.status === 'fail') ? 'fail' : run.steps.some((x) => x.status === 'blocked') ? 'blocked' : 'pass';
  run.status = 'done';
  run.finishedAt = nowIso();
  run.finishedBy = currentUser()?.id;
  s.activeRun = null;
  write(s);
  const first = !progress.isDone('testing', 'simulation');
  progress.setDone('testing', 'simulation', true);
  toast(`${run.id} tamamlandı: ${RESULT[run.result].label}`);
  if (first) document.dispatchEvent(new CustomEvent('erp:progress'));
  else refreshAll();
}

function cancelRun() {
  const s = read();
  s.runs = s.runs.filter((r) => r.id !== s.activeRun || s.defects.some((d) => d.runId === r.id));
  const run = s.runs.find((r) => r.id === s.activeRun);
  if (run) {
    run.status = 'cancelled';
    run.finishedAt = nowIso();
  }
  s.activeRun = null;
  write(s);
  toast('Koşum iptal edildi');
  refreshAll();
}

// ---------- defect ----------
function openDefectForm(stepIndex) {
  if (!can('DEFECT_CREATE')) return toast('Defect açmak için DEFECT_CREATE gerekir');
  const s = read();
  const run = s.runs.find((r) => r.id === s.activeRun);
  const c = run && caseById(run.caseId, s);
  if (!c) return;
  const st = c.steps[stepIndex];
  const note = run.steps[stepIndex]?.note || '';
  const repro = [`Ön koşul: ${c.precondition || '—'}`, ...c.steps.slice(0, stepIndex + 1).map((x, k) => `${k + 1}. ${x.action}`)].join('\n');
  const html =
    drawerHead('Yeni defect', `${c.id} · adım ${stepIndex + 1}`, badge(`Sürüm ${run.release}`, 'neutral') + badge(run.id, 'neutral')) +
    `<div class="drawer-body iam-form" data-def-form>
      <label class="field"><span class="field-label">Başlık <span class="req">*</span></span><input class="input" data-d="title" value="${esc(`${c.id} adım ${stepIndex + 1}: ${st.expected}`.slice(0, 120))}"></label>
      <div class="form-grid">
        <label class="field"><span class="field-label">Gereksinim <span class="req">*</span></span><select class="select" data-d="requirement">${reqs().map((r) => `<option value="${esc(r.id)}" ${r.id === c.requirements[0] ? 'selected' : ''}>${esc(r.id)} · ${esc(r.title)}</option>`).join('')}</select></label>
        <label class="field"><span class="field-label">Önem <span class="req">*</span></span><select class="select" data-d="severity">${LEVELS.map((l) => `<option ${l === (c.priority || 'Orta') ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      </div>
      <label class="field"><span class="field-label">Tekrar adımları (otomatik)</span><textarea class="input textarea" rows="5" data-d="steps">${esc(repro)}</textarea></label>
      <label class="field"><span class="field-label">Test verisi (otomatik)</span><textarea class="input textarea" rows="2" data-d="data">${esc(c.data || '')}</textarea></label>
      <label class="field"><span class="field-label">Beklenen sonuç</span><textarea class="input textarea" rows="2" data-d="expected">${esc(st.expected)}</textarea></label>
      <label class="field"><span class="field-label">Gerçekleşen sonuç <span class="req">*</span></span><textarea class="input textarea" rows="2" data-d="actual" placeholder="Ne gördün? Rakamla yaz.">${esc(note)}</textarea></label>
      <div class="drawer-actions">
        <button class="btn btn-primary" type="button" data-act="def-save">${icon('check')}<span>Defect'i kaydet</span></button>
        <button class="btn btn-ghost" type="button" data-close>Vazgeç</button>
      </div>
    </div>`;
  openDrawer(html, (el) => {
    if (el.dataset.act !== 'def-save') return;
    const f = el.closest('[data-def-form]');
    const v = (k) => f.querySelector(`[data-d="${k}"]`).value.trim();
    if (!v('title') || !v('actual')) return toast('Başlık ve gerçekleşen sonuç zorunlu');
    const s2 = read();
    const d = {
      id: nextNo(s2, 'defect', 'DEF'), title: v('title'), requirement: v('requirement'), severity: v('severity'), status: 'new',
      caseId: c.id, runId: run.id, stepIndex, release: run.release, steps: v('steps'), data: v('data'), expected: v('expected'), actual: v('actual'),
      createdBy: currentUser()?.id, createdAt: nowIso(), assignee: null, history: [],
    };
    d.history.push({ at: d.createdAt, by: d.createdBy, action: 'created', note: `${c.id} · adım ${stepIndex + 1}` });
    s2.defects.push(d);
    write(s2);
    toast(`${d.id} açıldı`);
    openDefect(d.id);
    refreshAll();
  });
}

function defectActions(d) {
  const me = currentUser();
  const fixers = holders('DEFECT_FIX');
  const out = [];
  if (['new', 'reopened'].includes(d.status)) {
    if (!fixers.length) out.push(techLeadBox());
    else
      out.push(`<div class="assign-row"><select class="select" data-assignee>${fixers.map((u) => `<option value="${esc(u.id)}" ${u.id === d.assignee ? 'selected' : ''}>${esc(userLabel(u.id))}</option>`).join('')}</select>
        ${actionBtn({ perm: 'DEFECT_CREATE', label: 'Ata', iconName: 'user', attrs: 'data-act="assign"' })}</div>`);
  }
  if (d.status === 'assigned') out.push(actionBtn({ perm: 'DEFECT_FIX', label: 'Düzeltmeye başla', iconName: 'play', attrs: 'data-act="start"', reason: can('DEFECT_FIX') && d.assignee !== me?.id ? `Atanan kişi: ${userLabel(d.assignee)}` : null }));
  if (d.status === 'fixing') out.push(actionBtn({ perm: 'DEFECT_FIX', label: 'Düzeltildi', iconName: 'check', attrs: 'data-act="fix"', reason: can('DEFECT_FIX') && d.assignee !== me?.id ? `Atanan kişi: ${userLabel(d.assignee)}` : null }));
  if (d.status === 'retest') {
    const ok = passedAfterFix(d);
    const reason = can('DEFECT_CLOSE') && d.fixedBy === me?.id ? 'Görevler ayrılığı: düzelten kişi kendi düzeltmesini kapatamaz.' : can('DEFECT_CLOSE') && !ok ? `Önce ${d.caseId}'yi ${d.release} üzerinde yeniden koş; düzeltme sonrası geçen koşum yok.` : null;
    out.push(actionBtn({ perm: 'DEFECT_CLOSE', label: 'Kapat', iconName: 'check', attrs: 'data-act="close"', reason }));
    out.push(actionBtn({ perm: 'DEFECT_CLOSE', label: 'Yeniden aç', iconName: 'alert', cls: 'btn-ghost danger', attrs: 'data-act="reopen"' }));
  }
  if (d.status === 'notrepro') {
    out.push(actionBtn({ perm: 'DEFECT_CLOSE', label: 'Kapat (tekrarlanamadı)', iconName: 'check', cls: 'btn-ghost', attrs: 'data-act="close-nr"' }));
    out.push(actionBtn({ perm: 'DEFECT_CLOSE', label: 'Düzeltip yeniden aç', iconName: 'alert', attrs: 'data-act="reopen"' }));
  }
  if (d.status === 'closed') out.push(actionBtn({ perm: 'DEFECT_CLOSE', label: 'Yeniden aç', iconName: 'alert', cls: 'btn-ghost danger', attrs: 'data-act="reopen"' }));
  return out.join('');
}

function passedAfterFix(d) {
  return read().runs.some((r) => r.caseId === d.caseId && r.release === d.release && r.status === 'done' && r.result === 'pass' && d.fixedAt && r.finishedAt > d.fixedAt);
}

function openDefect(id) {
  const s = read();
  const d = s.defects.find((x) => x.id === id);
  if (!d) return toast('Defect bulunamadı');
  const editableReq = ['new', 'reopened', 'notrepro'].includes(d.status) && can('DEFECT_CREATE');
  const lc = ['new', 'assigned', 'fixing', 'retest', 'closed'];
  const idx = lc.indexOf(d.status === 'reopened' ? 'new' : d.status === 'notrepro' ? 'fixing' : d.status);
  const html =
    drawerHead(`Defect · ${d.id}`, d.title, rb(d.status, DSTATUS) + badge(d.severity, LEVEL_TONE[d.severity]) + badge(`Sürüm ${d.release}`, 'neutral')) +
    `<div class="drawer-body">
      <ol class="lc">${lc.map((k, i) => `<li class="${i < idx ? 'done' : i === idx ? 'cur' : ''}">${esc(DSTATUS[k].label)}</li>`).join('')}</ol>
      ${d.status === 'notrepro' ? alertBox('warning', 'Tekrarlanamadı', esc(d.history.filter((h) => h.action === 'notrepro').pop()?.note || '')) : ''}
      ${d.status === 'retest' ? alertBox('info', 'Yeniden teste hazır', `Düzelten: ${esc(userLabel(d.fixedBy))}. ${esc(d.caseId)}'yi yeniden koş; geçerse kapat.`) : ''}
      ${dsec('İşlemler', `<div class="drawer-actions">${defectActions(d) || '<span class="cell-sub">Bu durumda işlem yok.</span>'}</div>`)}
      ${dsec('Ayrıntılar', kv([
        ['Gereksinim', editableReq
          ? `<span class="assign-row"><select class="select" data-req>${reqs().map((r) => `<option value="${esc(r.id)}" ${r.id === d.requirement ? 'selected' : ''}>${esc(r.id)} · ${esc(r.title)}</option>`).join('')}</select><button class="btn btn-ghost" type="button" data-act="req">Güncelle</button></span>`
          : `<span class="code">${esc(d.requirement)}</span> ${esc(reqById(d.requirement)?.title || '')}`],
        ['Test case / koşum', `<span class="code">${esc(d.caseId)}</span> · <span class="code">${esc(d.runId)}</span> · adım ${d.stepIndex + 1}`],
        ['Açan', esc(userLabel(d.createdBy))],
        ['Atanan', esc(d.assignee ? userLabel(d.assignee) : '—')],
      ]))}
      ${dsec('Tekrar adımları', `<p class="pre">${esc(d.steps)}</p>`)}
      ${dsec('Test verisi', `<p class="pre">${esc(d.data || '—')}</p>`)}
      ${dsec('Beklenen / gerçekleşen', kv([['Beklenen', esc(d.expected)], ['Gerçekleşen', `<strong>${esc(d.actual)}</strong>`]]))}
      ${dsec('Geçmiş', `<ol class="timeline">${[...d.history].reverse().map((h) => `<li><span class="tl-dot tone-${h.action === 'closed' || h.action === 'fixed' ? 'success' : h.action === 'reopened' || h.action === 'notrepro' ? 'danger' : 'info'}">${icon(h.action === 'closed' ? 'check' : 'flask')}</span><div class="tl-body"><div><strong>${esc(userLabel(h.by))}</strong> <span>${esc(DACTION[h.action] || h.action)}</span></div><span class="cell-sub">${datetime(h.at)}</span>${h.note ? `<p class="tl-note">${esc(h.note)}</p>` : ''}</div></li>`).join('')}</ol>`)}
    </div>`;
  openDrawer(html, (el) => defectAction(id, el));
}

function defectAction(id, el) {
  const act = el.dataset.act;
  const s = read();
  const d = s.defects.find((x) => x.id === id);
  const me = currentUser();
  const log = (action, note = '') => d.history.push({ at: nowIso(), by: me?.id, action, note });
  const root = el.closest('.drawer-inner');

  if (act === 'assign' && can('DEFECT_CREATE')) {
    const to = root.querySelector('[data-assignee]')?.value;
    if (!to) return;
    d.assignee = to;
    d.status = 'assigned';
    log('assigned', userLabel(to));
  } else if (act === 'start' && can('DEFECT_FIX') && d.assignee === me?.id) {
    d.status = 'fixing';
    log('started');
  } else if (act === 'fix' && can('DEFECT_FIX') && d.assignee === me?.id) {
    const bug = bugForRequirement(d.requirement);
    if (bug && flagActive(bug.flag, d.release)) {
      fixFlag(d.release, bug.flag);
      d.status = 'retest';
      d.fixedBy = me.id;
      d.fixedAt = nowIso();
      d.fixedFlag = bug.flag;
      log('fixed', bug.fixNote);
    } else {
      d.status = 'notrepro';
      log('notrepro', `${d.requirement} için ${d.release} sürümünde tekrarlanabilir hata bulunamadı. Gereksinim yanlış seçilmiş veya hata zaten düzeltilmiş olabilir.`);
    }
  } else if (act === 'close' && can('DEFECT_CLOSE') && d.fixedBy !== me?.id && passedAfterFix(d)) {
    d.status = 'closed';
    d.resolution = 'Düzeltildi';
    log('closed', 'Yeniden test geçti');
  } else if (act === 'close-nr' && can('DEFECT_CLOSE')) {
    d.status = 'closed';
    d.resolution = 'Tekrarlanamadı';
    log('closed', 'Tekrarlanamadı olarak kapatıldı');
  } else if (act === 'reopen' && can('DEFECT_CLOSE')) {
    d.status = 'reopened';
    log('reopened');
  } else if (act === 'req' && can('DEFECT_CREATE')) {
    const r = root.querySelector('[data-req]')?.value;
    if (!r || r === d.requirement) return;
    log('req-changed', `${d.requirement} → ${r}`);
    d.requirement = r;
  } else return;
  write(s);
  toast(`${d.id}: ${DSTATUS[d.status].label}`);
  openDefect(id);
  refreshAll();
}

function defectsView(s) {
  const list = (defFilter === 'open' ? openDefects(s) : s.defects).slice().reverse();
  return `<div class="toolbar">
      <div class="seg-ctrl" role="tablist" aria-label="Defect filtresi">
        <button type="button" data-dfilter="open" class="${defFilter === 'open' ? 'is-active' : ''}">Açık <span class="count danger-count">${openDefects(s).length}</span></button>
        <button type="button" data-dfilter="all" class="${defFilter === 'all' ? 'is-active' : ''}">Tümü <span class="count muted-count">${s.defects.length}</span></button>
      </div>
    </div>
    ${list.length
      ? `<div class="card table-card"><div class="table-wrap"><table class="table tl-table">
        <thead><tr><th>Defect</th><th class="hide-sm">Gereksinim</th><th>Önem</th><th>Durum</th><th class="hide-md">Atanan</th><th class="hide-md">Sürüm</th></tr></thead>
        <tbody>${list.map((d) => `<tr data-defect="${esc(d.id)}" tabindex="0"><td><span class="code">${esc(d.id)}</span> ${esc(d.title)}<div class="cell-sub">${esc(d.caseId)} · ${esc(userLabel(d.createdBy))}</div></td><td class="hide-sm"><span class="code">${esc(d.requirement)}</span></td><td>${badge(d.severity, LEVEL_TONE[d.severity])}</td><td>${rb(d.status, DSTATUS)}</td><td class="hide-md">${esc(d.assignee ? userLabel(d.assignee) : '—')}</td><td class="hide-md">${esc(d.release)}</td></tr>`).join('')}</tbody>
      </table></div></div>`
      : `<div class="card">${emptyState('flask', defFilter === 'open' ? 'Açık defect yok' : 'Henüz defect yok', 'Koşumda "Kaldı" işaretlediğin adımdan tek tıkla defect açabilirsin.')}</div>`}`;
}

// ---------- izlenebilirlik ----------
function traceView(s) {
  const rel = currentReleaseId();
  const RR = { uncovered: { label: 'Kapsanmadı', tone: 'danger' }, ...RESULT };
  return `<div class="card table-card"><div class="table-wrap"><table class="table tl-table trace">
    <thead><tr><th>Gereksinim</th><th>Test case · son sonuç (${esc(rel)})</th><th>Defect</th><th>Durum</th></tr></thead>
    <tbody>${reqs()
      .map((r) => {
        const cs = casesForReq(r.id, s);
        const ds = s.defects.filter((d) => d.requirement === r.id);
        return `<tr>
          <td><span class="code">${esc(r.id)}</span> ${esc(r.title)}</td>
          <td><div class="trace-cells">${cs.map((c) => `<button class="trace-chip" type="button" data-edit-case="${esc(c.id)}"><span class="code">${esc(c.id)}</span>${rb(latestResult(c.id, rel, s))}</button>`).join('') || '<span class="muted">—</span>'}</div></td>
          <td><div class="trace-cells">${ds.map((d) => `<button class="trace-chip" type="button" data-defect="${esc(d.id)}"><span class="code">${esc(d.id)}</span>${rb(d.status, DSTATUS)}</button>`).join('') || '<span class="muted">—</span>'}</div></td>
          <td>${rb(reqResult(r.id, s), RR)}</td>
        </tr>`;
      })
      .join('')}</tbody></table></div>
    <div class="table-foot">Kapsanmayan gereksinim test edilmemiş demektir; çıkış kriteri karşılanmaz.</div></div>`;
}

// ---------- olaylar ----------
let rootRef = null;
function refreshAll() {
  if (!rootRef?.isConnected) return;
  redrawHead(rootRef);
  drawBody(rootRef);
}

function bindRoot(root) {
  rootRef = root;
  root.addEventListener('click', (e) => {
    const q = (sel) => e.target.closest(sel);
    let el;
    if ((el = q('[data-tab]'))) {
      view = el.dataset.tab;
      return refreshAll();
    }
    if ((el = q('[data-rel]'))) {
      if (el.dataset.rel !== currentReleaseId()) {
        setRelease(el.dataset.rel);
        toast(`Sistem sürümü: ${el.dataset.rel}`);
      }
      return;
    }
    if (q('[data-reset-fixes]')) {
      resetFixes();
      return toast('Düzeltmeler geri alındı; hatalar yeniden etkin');
    }
    if (q('[data-new-case]')) return openCaseEditor(null);
    if ((el = q('[data-edit-case]'))) return openCaseEditor(el.dataset.editCase);
    if ((el = q('[data-run-case]'))) return startRun(el.dataset.runCase);
    if ((el = q('[data-mark]'))) {
      const [i, st] = el.dataset.mark.split(':');
      return markStep(root, Number(i), st);
    }
    if ((el = q('[data-def-open]'))) return openDefectForm(Number(el.dataset.defOpen));
    if (q('[data-finish]')) return finishRun();
    if (q('[data-cancel-run]')) return cancelRun();
    if ((el = q('[data-dfilter]'))) {
      defFilter = el.dataset.dfilter;
      return refreshAll();
    }
    if ((el = q('[data-defect]'))) return openDefect(el.dataset.defect);
  });
  root.addEventListener('change', (e) => {
    const n = e.target.closest('[data-note]');
    if (!n) return;
    const s = read();
    const run = s.runs.find((r) => r.id === s.activeRun);
    if (!run) return;
    run.steps[Number(n.dataset.note)].note = n.value;
    write(s);
  });
  root.addEventListener('keydown', (e) => {
    const r = e.target.closest('tr[data-defect]');
    if (r && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      openDefect(r.dataset.defect);
    }
  });
}

export const _test = { read, write, cases, latestResult, reqResult, passedAfterFix, startRun, finishRun, defectAction, setCtx: (c) => (ctx = c) };
