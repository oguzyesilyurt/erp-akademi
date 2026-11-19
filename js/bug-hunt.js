// Testler sekmesi: "Hata Avı" (tests.type = "bug-hunt")
// Her vakada salt okunur bir teklif açılır, kullanıcı hata raporu yazar ve puanlanır.
import { icon } from './icons.js';
import { href } from './router.js';
import { progress, results } from './store.js';
import { esc, badge, progressBar, helpBtn, emptyState, toast } from './ui.js';
import { loadCompany, partnerOf, useBase } from './company.js';
import { renderQuoteDoc, bindQuoteDoc } from './quote-doc.js';

const NS = 'bughunt';
const STATUS = {
  none: { label: 'Çözülmedi', tone: 'neutral' },
  wrong: { label: 'Çözülmedi', tone: 'danger' },
  partial: { label: 'Kısmi', tone: 'warning' },
  full: { label: 'Tam', tone: 'success' },
};
let scrollToResult = null;

const scoring = (c) => ({ field: 60, severityExact: 30, severityNear: 15, completeness: 10, passPct: 70, ...(c.scoring || {}) });
const maxPerCase = (S) => S.field + S.severityExact + S.completeness;

function load(trackId) {
  const r = results.get(NS, trackId);
  return { cases: r.cases || {} };
}

function summary(content, trackId) {
  const S = scoring(content);
  const st = load(trackId);
  const max = content.cases.length * maxPerCase(S);
  let score = 0;
  const counts = { full: 0, partial: 0, none: 0 };
  content.cases.forEach((c) => {
    const r = st.cases[c.id];
    if (r) score += r.score;
    if (r?.status === 'full') counts.full++;
    else if (r?.status === 'partial') counts.partial++;
    else counts.none++;
  });
  const attempted = content.cases.filter((c) => st.cases[c.id]).length;
  return { score, max, pct: max ? (score / max) * 100 : 0, counts, attempted, st, S };
}

// ---------- puanlama ----------
function grade(content, c, report) {
  const S = scoring(content);
  const sevIds = content.severities.map((s) => s.id);
  const fieldOk = report.field === c.answer.field;
  const diff = Math.abs(sevIds.indexOf(report.severity) - sevIds.indexOf(c.answer.severity));
  const sevPts = fieldOk ? (diff === 0 ? S.severityExact : diff === 1 ? S.severityNear : 0) : 0;

  const stepLines = report.steps.split('\n').map((s) => s.trim()).filter(Boolean);
  const parts = [report.expected.trim().length >= 15, report.actual.trim().length >= 15, stepLines.length >= 2];
  const compPts = Math.round((parts.filter(Boolean).length / parts.length) * S.completeness);

  const score = (fieldOk ? S.field : 0) + sevPts + compPts;
  const status = fieldOk && diff === 0 ? 'full' : fieldOk ? 'partial' : 'wrong';
  return { score, status, fieldOk, sevDiff: diff, sevPts, compPts, compParts: parts };
}

// ---------- giriş ----------
export async function renderBugHunt(ctx) {
  await loadCompany();
  return ctx.route.sub ? renderCase(ctx) : renderOverview(ctx);
}

function guideCard(g) {
  if (!g) return '';
  return `<section class="guide card">
    <div class="guide-head"><span class="icon-tile sm" style="--accent:var(--tone-info)">${icon('flask')}</span><h3>${esc(g.title)}</h3></div>
    <ol class="guide-points">${g.points.map((p) => `<li><strong>${esc(p.title)}</strong><span>${esc(p.text)}</span></li>`).join('')}</ol>
    ${g.example ? `<div class="example"><span class="example-label">${icon('check')} Örnek başlık</span><p>${esc(g.example)}</p></div>` : ''}
  </section>`;
}

function renderOverview(ctx) {
  const c = ctx.content;
  const sm = summary(c, ctx.track.id);

  const rows = c.cases
    .map((k) => {
      const r = sm.st.cases[k.id];
      const s = STATUS[r?.status || 'none'];
      const cust = useBase(() => partnerOf(k.quote.customer));
      return `<a class="task-row" href="${href('track', { id: ctx.track.id, section: 'tests', sub: k.id })}">
        <span class="code">${esc(k.id)}</span>
        <span class="task-main"><span class="cell-main">${esc(k.title)}</span><span class="cell-sub">Teklif ${esc(k.quote.no)} · ${esc(cust?.name || '')}</span></span>
        <span class="task-score">${r ? `${r.score}<small>/${maxPerCase(sm.S)}</small>` : '—'}</span>
        ${badge(s.label, s.tone)}
        ${icon('back', 'chev')}
      </a>`;
    })
    .join('');

  return {
    html: `<div class="content">
      <header class="content-head"><h2>${esc(c.title || 'Hata Avı')}</h2>${c.intro ? `<p class="lead">${esc(c.intro)}</p>` : ''}</header>
      ${guideCard(c.guide)}
      <section class="hunt-score card">
        <div>
          <span class="stat-label">Toplam puan</span>
          <div class="hunt-score-val"><strong>${sm.score}</strong><span>/ ${sm.max}</span></div>
          ${progressBar(sm.pct, 'var(--accent, var(--primary))')}
          <span class="cell-sub">${sm.attempted}/${c.cases.length} görev denendi · tüm görevler bitince %${sm.S.passPct} ve üstü bölümü tamamlar</span>
        </div>
        <div class="hunt-counts">
          <div>${badge('Tam', 'success')}<strong>${sm.counts.full}</strong></div>
          <div>${badge('Kısmi', 'warning')}<strong>${sm.counts.partial}</strong></div>
          <div>${badge('Çözülmedi', 'neutral')}<strong>${sm.counts.none}</strong></div>
        </div>
        ${sm.attempted ? `<button class="btn btn-ghost" type="button" data-hunt-reset>${icon('close')}<span>Sonuçları sıfırla</span></button>` : ''}
      </section>
      <h3 class="list-title">Görevler</h3>
      <div class="task-list">${rows}</div>
    </div>`,
    bind(root) {
      root.querySelector('[data-hunt-reset]')?.addEventListener('click', (e) => {
        const b = e.currentTarget;
        if (!b.classList.contains('confirm')) {
          b.classList.add('confirm', 'danger');
          b.querySelector('span').textContent = 'Emin misin? Tekrar dokun';
          return;
        }
        results.set(NS, ctx.track.id, { cases: {} });
        progress.setDone(ctx.track.id, 'tests', false);
        toast('Hata avı sonuçları sıfırlandı');
        document.dispatchEvent(new CustomEvent('erp:progress'));
      });
    },
  };
}

// ---------- vaka ----------
function renderCase(ctx) {
  const c = ctx.content;
  const idx = c.cases.findIndex((k) => k.id === ctx.route.sub);
  const back = `<a class="back" href="${href('track', { id: ctx.track.id, section: 'tests' })}">${icon('back')}<span>Tüm görevler</span></a>`;
  if (idx < 0) return { html: back + emptyState('flask', 'Görev bulunamadı', 'Bu görev kaldırılmış olabilir.') };

  const k = c.cases[idx];
  const st = load(ctx.track.id);
  const r = st.cases[k.id];
  const help = ctx.data?.sections?.simulation?.help || {};
  const s = STATUS[r?.status || 'none'];

  return {
    html: `<div class="hunt-case">
      ${back}
      <header class="scenario-head">
        <div class="badges"><span class="code">${esc(k.id)}</span>${badge(s.label, s.tone)}${badge(`Görev ${idx + 1}/${c.cases.length}`, 'neutral')}</div>
        <h2>${esc(k.title)}</h2>
        <p class="lead">${esc(k.brief)} Bu teklifte bilerek bırakılmış <strong>tek bir hata</strong> var.</p>
        <p class="hint">${icon('help')}<span>Müşteri ve ürün adlarına tıklayarak ana veriyi aç, kalemlerde ${icon('layers')} ile fiyat adımlarını incele. Bu görevler her zaman şirketin orijinal verisiyle çalışır; simülasyonda yaptığın ana veri ve stok değişikliklerinden etkilenmez.</span></p>
      </header>
      ${useBase(() => renderQuoteDoc(k.quote, { help }))}
      <div class="hunt-report" id="hunt-report">${r ? resultView(ctx, k, r, idx) : reportForm(c, k)}</div>
    </div>`,
    bind(root) {
      bindQuoteDoc(root, { base: true });
      const form = root.querySelector('[data-report]');
      if (form) form.addEventListener('submit', (e) => submit(e, ctx, k, form));
      if (scrollToResult === k.id) {
        scrollToResult = null;
        requestAnimationFrame(() => root.querySelector('#hunt-report')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
      }
    },
  };
}

function reportForm(c, k) {
  return `<form class="report card" data-report novalidate>
    <header class="report-head"><span class="icon-tile sm" style="--accent:var(--tone-danger)">${icon('alert')}</span><div><h3>Hata raporu</h3><span class="cell-sub">Teklif ${esc(k.quote.no)} için bulduğun hatayı raporla. Gönderdikten sonra puan ve ideal rapor gösterilir.</span></div></header>
    <div class="report-grid">
      <div class="field">
        <div class="field-label"><label for="r-field">Hatalı alan <span class="req">*</span></label>${helpBtn('Hatanın görüldüğü alan. Belgede birden fazla şey tuhaf görünebilir; kural ihlalinin kaynağı olan alanı seç.', 'Hatalı alan')}</div>
        <select class="select" id="r-field" name="field" required>
          <option value="">Alan seç…</option>
          ${c.fields.map((f) => `<option value="${esc(f.id)}">${esc(f.label)}</option>`).join('')}
        </select>
      </div>
      <fieldset class="field sev-field">
        <legend class="field-label">Önem <span class="req">*</span>${helpBtn(c.severities.map((s) => `${s.id}: ${s.text}`).join(' '), 'Önem')}</legend>
        <div class="sev-options">${c.severities
          .map((s, i) => `<label class="sev sev-${i}"><input type="radio" name="severity" value="${esc(s.id)}" required><span>${esc(s.id)}</span></label>`)
          .join('')}</div>
      </fieldset>
      <div class="field span-2">
        <div class="field-label"><label for="r-expected">Beklenen sonuç <span class="req">*</span></label>${helpBtn('Kurala ve ana veriye göre ne olmalıydı? Mümkünse rakam ve kaynağıyla yaz.', 'Beklenen')}</div>
        <textarea class="input textarea" id="r-expected" name="expected" rows="3" placeholder="Ör. B segmentinde K007 %5 olmalı (Şirket > Fiyatlar)" required></textarea>
      </div>
      <div class="field span-2">
        <div class="field-label"><label for="r-actual">Gerçekleşen sonuç <span class="req">*</span></label>${helpBtn('Belgede gerçekte ne görüyorsun? Alan adı ve değeriyle yaz.', 'Gerçekleşen')}</div>
        <textarea class="input textarea" id="r-actual" name="actual" rows="3" placeholder="Ör. Kalem 10'da K007 %8 uygulanmış" required></textarea>
      </div>
      <div class="field span-2">
        <div class="field-label"><label for="r-steps">Tekrar adımları <span class="req">*</span></label>${helpBtn('Başka birinin aynı hatayı görebilmesi için adımlar. Her adımı ayrı satıra yaz.', 'Tekrar adımları')}</div>
        <textarea class="input textarea" id="r-steps" name="steps" rows="4" placeholder="1. Teklif ${esc(k.quote.no)}'i aç&#10;2. …&#10;3. …" required></textarea>
      </div>
    </div>
    <div class="report-foot">
      <span class="cell-sub" data-report-error></span>
      <button class="btn btn-primary" type="submit">${icon('check')}<span>Raporu gönder</span></button>
    </div>
  </form>`;
}

function submit(e, ctx, k, form) {
  e.preventDefault();
  const fd = new FormData(form);
  const report = {
    field: fd.get('field') || '',
    severity: fd.get('severity') || '',
    expected: String(fd.get('expected') || ''),
    actual: String(fd.get('actual') || ''),
    steps: String(fd.get('steps') || ''),
  };
  const missing = [];
  if (!report.field) missing.push('hatalı alan');
  if (!report.severity) missing.push('önem');
  if (!report.expected.trim()) missing.push('beklenen sonuç');
  if (!report.actual.trim()) missing.push('gerçekleşen sonuç');
  if (!report.steps.trim()) missing.push('tekrar adımları');
  if (missing.length) {
    form.querySelector('[data-report-error]').textContent = `Eksik: ${missing.join(', ')}`;
    form.querySelector(missing[0] === 'önem' ? 'input[name="severity"]' : `[name="${{ 'hatalı alan': 'field', 'beklenen sonuç': 'expected', 'gerçekleşen sonuç': 'actual', 'tekrar adımları': 'steps' }[missing[0]]}"]`)?.focus();
    return;
  }

  const g = grade(ctx.content, k, report);
  const st = load(ctx.track.id);
  st.cases[k.id] = { ...g, report, at: new Date().toISOString() };
  results.set(NS, ctx.track.id, st);

  const sm = summary(ctx.content, ctx.track.id);
  if (sm.attempted === ctx.content.cases.length && sm.pct >= sm.S.passPct && !progress.isDone(ctx.track.id, 'tests')) {
    progress.setDone(ctx.track.id, 'tests', true);
    toast(`Hata avı tamamlandı: ${sm.score}/${sm.max} puan`);
  } else {
    toast(`${k.id}: ${g.score} puan · ${STATUS[g.status].label}`);
  }
  scrollToResult = k.id;
  document.dispatchEvent(new CustomEvent('erp:progress'));
}

function resultView(ctx, k, r, idx) {
  const c = ctx.content;
  const S = scoring(c);
  const fieldLabel = (id) => c.fields.find((f) => f.id === id)?.label || id || '—';
  const st = STATUS[r.status];
  const steps = (txt) => `<ol class="steps-mini">${txt.map((s) => `<li>${esc(s.replace(/^\s*\d+[.)]\s*/, ''))}</li>`).join('')}</ol>`;
  const userSteps = r.report.steps.split('\n').map((s) => s.trim()).filter(Boolean);
  const next = c.cases.slice(idx + 1).concat(c.cases.slice(0, idx)).find((x) => !load(ctx.track.id).cases[x.id]);
  const mark = (ok) => `<span class="mark ${ok ? 'ok' : 'bad'}">${icon(ok ? 'check' : 'close')}</span>`;

  return `<section class="result card">
    <header class="result-head">
      <div class="result-score tone-${st.tone}"><strong>${r.score}</strong><span>/ ${maxPerCase(S)}</span></div>
      <div>
        <div class="badges">${badge(st.label, st.tone)}</div>
        <h3>${r.status === 'full' ? 'Harika! Hatayı doğru alanda ve doğru önemle buldun.' : r.status === 'partial' ? 'Doğru alanı buldun; önem derecesi ideal rapordan farklı.' : 'Hatalı alan ideal rapordan farklı.'}</h3>
      </div>
    </header>
    <div class="breakdown">
      <div>${mark(r.fieldOk)}<span>Hatalı alan</span><strong>${r.fieldOk ? S.field : 0}/${S.field}</strong></div>
      <div>${mark(r.sevPts === S.severityExact)}<span>Önem ${r.fieldOk ? (r.sevDiff === 0 ? '(tam)' : r.sevDiff === 1 ? '(yakın)' : '(uzak)') : '(alan yanlış)'}</span><strong>${r.sevPts}/${S.severityExact}</strong></div>
      <div>${mark(r.compPts === S.completeness)}<span>Rapor bütünlüğü</span><strong>${r.compPts}/${S.completeness}</strong></div>
    </div>
    <div class="compare-reports">
      <div class="rep mine">
        <h4>Senin raporun</h4>
        <dl>
          <div><dt>Hatalı alan</dt><dd>${mark(r.fieldOk)} ${esc(fieldLabel(r.report.field))}</dd></div>
          <div><dt>Önem</dt><dd>${esc(r.report.severity)}</dd></div>
          <div><dt>Beklenen</dt><dd>${esc(r.report.expected)}</dd></div>
          <div><dt>Gerçekleşen</dt><dd>${esc(r.report.actual)}</dd></div>
          <div><dt>Adımlar</dt><dd>${steps(userSteps)}</dd></div>
        </dl>
      </div>
      <div class="rep ideal">
        <h4>${icon('check')} İdeal hata raporu</h4>
        <dl>
          <div><dt>Hatalı alan</dt><dd><strong>${esc(fieldLabel(k.answer.field))}</strong></dd></div>
          <div><dt>Önem</dt><dd><strong>${esc(k.answer.severity)}</strong></dd></div>
          <div><dt>Beklenen</dt><dd>${esc(k.answer.expected)}</dd></div>
          <div><dt>Gerçekleşen</dt><dd>${esc(k.answer.actual)}</dd></div>
          <div><dt>Adımlar</dt><dd>${steps(k.answer.steps)}</dd></div>
        </dl>
      </div>
    </div>
    <aside class="callout callout-info">${icon('help')}<div><strong>Açıklama</strong><p>${esc(k.answer.explanation)}</p></div></aside>
    <div class="result-actions">
      ${next ? `<a class="btn btn-primary" href="${href('track', { id: ctx.track.id, section: 'tests', sub: next.id })}">${icon('flask')}<span>Sonraki görev: ${esc(next.id)}</span></a>` : `<a class="btn btn-primary" href="${href('track', { id: ctx.track.id, section: 'tests' })}">${icon('grid')}<span>Sonuçları gör</span></a>`}
      ${next ? `<a class="btn btn-ghost" href="${href('track', { id: ctx.track.id, section: 'tests' })}">${icon('grid')}<span>Tüm görevler</span></a>` : ''}
    </div>
    <p class="cell-sub">Puan ilk gönderimde sabitlenir. Baştan denemek için görev listesindeki "Sonuçları sıfırla"yı kullan.</p>
  </section>`;
}
