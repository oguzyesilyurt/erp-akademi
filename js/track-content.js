// Yol bölümlerini veriden (data/tracks/<id>.json) çizer.
// Her oluşturucu { html, bind?(root) } döndürür.
import { icon } from './icons.js';
import { href } from './router.js';
import { esc, norm, badge, emptyState } from './ui.js';
import { loadCompany, partnerOf, userOf, openDetail } from './company.js';
import { renderQuoteSim } from './sim-quote.js';
import { renderBugHunt } from './bug-hunt.js';
import { renderQuiz } from './quiz.js';

export async function renderSection(ctx) {
  const { section, content } = ctx;
  if (section === 'intro') return renderIntro(content);
  if (section === 'concepts') return renderConcepts(content);
  if (section === 'scenarios') {
    await loadCompany();
    return ctx.route.sub ? renderScenario(ctx) : renderScenarioList(ctx);
  }
  if (section === 'simulation') {
    if (content.type === 'quote') return renderQuoteSim(ctx);
    return { html: emptyState('monitor', 'Simülasyon türü desteklenmiyor', `"${content.type}" türü için oynatıcı yok.`) };
  }
  if (section === 'tests' && content.type === 'bug-hunt') return renderBugHunt(ctx);
  if (section === 'quiz' && content.type === 'quiz') return renderQuiz(ctx);
  return { html: emptyState('inbox', 'İçerik türü desteklenmiyor', 'Bu bölüm için oluşturucu henüz eklenmedi.') };
}

// ---------- Giriş ----------
function renderIntro(c) {
  const blocks = (c.blocks || []).map(introBlock).join('');
  return {
    html: `<article class="content">
      <header class="content-head">
        <h2>${esc(c.title)}</h2>
        ${c.lead ? `<p class="lead">${esc(c.lead)}</p>` : ''}
        ${c.duration ? `<p class="meta-line">${icon('play')}<span>${esc(c.duration)} okuma</span></p>` : ''}
      </header>
      ${c.goals?.length ? `<section class="goals"><h3>Öğrenme hedefleri</h3><ul class="checklist">${c.goals.map((g) => `<li>${icon('check')}<span>${esc(g)}</span></li>`).join('')}</ul></section>` : ''}
      ${blocks}
    </article>`,
  };
}

function introBlock(b) {
  if (b.type === 'text') {
    return `<section class="block"><h3>${esc(b.title)}</h3>${(b.paragraphs || []).map((p) => `<p>${esc(p)}</p>`).join('')}</section>`;
  }
  if (b.type === 'compare') {
    return `<section class="block"><h3>${esc(b.title)}</h3>
      <div class="compare-wrap"><table class="compare">
        <thead><tr>${b.columns.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead>
        <tbody>${b.rows.map((r) => `<tr>${r.map((v, i) => (i === 0 ? `<th scope="row">${esc(v)}</th>` : `<td>${esc(v)}</td>`)).join('')}</tr>`).join('')}</tbody>
      </table></div></section>`;
  }
  if (b.type === 'flow') {
    return `<section class="block"><h3>${esc(b.title)}</h3>${b.text ? `<p>${esc(b.text)}</p>` : ''}
      <ol class="flow" style="--n:${b.steps.length}">${b.steps
        .map(
          (s, i) => `<li class="flow-step">
            <span class="flow-num">${i + 1}</span>
            <div class="flow-body">
              <div class="flow-title"><strong>${esc(s.label)}</strong><span class="flow-sys ${/ERP|S\/4/.test(s.system) ? 'is-erp' : ''}">${esc(s.system)}</span></div>
              <p>${esc(s.text)}</p>
              ${s.owner ? `<span class="cell-sub">${icon('user')} ${esc(s.owner)}</span>` : ''}
            </div>
          </li>`
        )
        .join('')}</ol></section>`;
  }
  if (b.type === 'callout') {
    return `<aside class="callout callout-${esc(b.tone || 'info')}">${icon('help')}<div><strong>${esc(b.title)}</strong><p>${esc(b.text)}</p></div></aside>`;
  }
  return '';
}

// ---------- Kavramlar ----------
function renderConcepts(c) {
  const items = c.items || [];
  const card = (k) => `
    <article class="concept card" data-concept data-search="${esc(norm([k.term, k.en, k.definition, k.example].join(' ')))}">
      <header><h3>${esc(k.term)}</h3>${k.en ? `<span class="concept-en">${esc(k.en)}</span>` : ''}</header>
      <p>${esc(k.definition)}</p>
      ${k.example ? `<div class="example"><span class="example-label">${icon('building')} Ege Dağıtım'da</span><p>${esc(k.example)}</p></div>` : ''}
      <div class="concept-links">
        ${k.link ? `<a class="link small" href="${esc(k.link.href)}">${esc(k.link.label)} →</a>` : ''}
        ${k.glossary ? `<a class="link small" href="#/docs/glossary?term=${encodeURIComponent(k.glossary)}">${icon('tag')} Sözlükte gör</a>` : ''}
      </div>
    </article>`;

  return {
    html: `<div class="content">
      <header class="content-head">
        <h2>Kavramlar</h2>
        ${c.intro ? `<p class="lead">${esc(c.intro)}</p>` : ''}
      </header>
      <div class="toolbar">
        <label class="search">${icon('search')}<input type="search" data-concept-q placeholder="Terim, tanım veya örnek ara" autocomplete="off"></label>
        <span class="toolbar-count" data-concept-count>${items.length} terim</span>
      </div>
      <div class="concepts">${items.map(card).join('')}</div>
      <div data-concept-empty hidden>${emptyState('search', 'Eşleşen terim yok', 'Farklı bir kelimeyle aramayı dene.')}</div>
    </div>`,
    bind(root) {
      const q = root.querySelector('[data-concept-q]');
      const cards = [...root.querySelectorAll('[data-concept]')];
      q.addEventListener('input', () => {
        const v = norm(q.value.trim());
        let n = 0;
        cards.forEach((el) => {
          const ok = !v || el.dataset.search.includes(v);
          el.hidden = !ok;
          if (ok) n++;
        });
        root.querySelector('[data-concept-count]').textContent = v ? `${items.length} terimden ${n}` : `${items.length} terim`;
        root.querySelector('[data-concept-empty]').hidden = n !== 0;
      });
    },
  };
}

// ---------- Senaryolar ----------
const LEVEL_TONE = { Başlangıç: 'success', Orta: 'info', İleri: 'warning' };

function simHref(ctx, s) {
  return href('track', { id: ctx.track.id, section: 'simulation' }, { scenario: s.id });
}

function renderScenarioList(ctx) {
  const c = ctx.content;
  const cards = (c.items || [])
    .map((s, i) => {
      const cust = partnerOf(s.customer);
      return `
      <article class="scenario-card card" style="--i:${i}">
        <div class="scenario-top">
          <span class="scenario-num">${i + 1}</span>
          <div class="badges">${badge(s.level, LEVEL_TONE[s.level] || 'neutral')}${s.duration ? badge(s.duration, 'neutral') : ''}</div>
        </div>
        <h3>${esc(s.title)}</h3>
        <p class="track-summary">${esc(s.summary)}</p>
        ${cust ? `<p class="cell-sub">${icon('users')} ${esc(cust.name)}</p>` : ''}
        <div class="scenario-actions">
          <a class="btn btn-primary" href="${href('track', { id: ctx.track.id, section: 'scenarios', sub: s.id })}">${icon('route')}<span>Adımları incele</span></a>
          <a class="btn btn-ghost" href="${simHref(ctx, s)}">${icon('monitor')}<span>Simülasyonda dene</span></a>
        </div>
      </article>`;
    })
    .join('');
  return {
    html: `<div class="content">
      <header class="content-head"><h2>Senaryolar</h2>${c.intro ? `<p class="lead">${esc(c.intro)}</p>` : ''}</header>
      <div class="scenarios">${cards}</div>
    </div>`,
  };
}

function renderScenario(ctx) {
  const s = (ctx.content.items || []).find((x) => x.id === ctx.route.sub);
  const back = `<a class="back" href="${href('track', { id: ctx.track.id, section: 'scenarios' })}">${icon('back')}<span>Tüm senaryolar</span></a>`;
  if (!s) return { html: back + emptyState('route', 'Senaryo bulunamadı', 'Bu senaryo kaldırılmış veya adı değişmiş olabilir.') };

  const cust = partnerOf(s.customer);
  const role = userOf(s.role);
  const tryBtn = `<a class="btn btn-primary" href="${simHref(ctx, s)}">${icon('monitor')}<span>Simülasyonda dene</span></a>`;

  const steps = s.steps
    .map(
      (st, i) => `
      <li class="step">
        <span class="step-num">${i + 1}</span>
        <div class="step-body">
          <h4>${esc(st.title)}</h4>
          <div class="step-grid">
            <div class="step-part what"><span class="step-label">${icon('play')} Ne yapılır</span><p>${esc(st.what)}</p></div>
            <div class="step-part why"><span class="step-label">${icon('help')} Neden</span><p>${esc(st.why)}</p></div>
            ${st.caution ? `<div class="step-part caution"><span class="step-label">${icon('alert')} Dikkat</span><p>${esc(st.caution)}</p></div>` : ''}
          </div>
        </div>
      </li>`
    )
    .join('');

  return {
    html: `<div class="content">
      ${back}
      <header class="scenario-head">
        <div class="badges">${badge(s.level, LEVEL_TONE[s.level] || 'neutral')}${s.duration ? badge(s.duration, 'neutral') : ''}${badge(`${s.steps.length} adım`, 'neutral')}</div>
        <h2>${esc(s.title)}</h2>
        <p class="lead">${esc(s.goal || s.summary)}</p>
        <dl class="scenario-meta">
          ${cust ? `<div><dt>Müşteri</dt><dd><button class="link" type="button" data-open="customer" data-id="${esc(cust.id)}">${esc(cust.name)}</button></dd></div>` : ''}
          ${role ? `<div><dt>Rolün</dt><dd>${esc(role.name)} · ${esc(role.role)}</dd></div>` : ''}
        </dl>
        <div class="scenario-actions">${tryBtn}</div>
      </header>
      <ol class="steps">${steps}</ol>
      ${s.outcome ? `<aside class="callout callout-success">${icon('check')}<div><strong>Beklenen sonuç</strong><p>${esc(s.outcome)}</p></div></aside>` : ''}
      <div class="scenario-actions end">${tryBtn}</div>
    </div>`,
    bind(root) {
      root.addEventListener('click', (e) => {
        const o = e.target.closest('[data-open]');
        if (o) openDetail(o.dataset.open, o.dataset.id);
      });
    },
  };
}
