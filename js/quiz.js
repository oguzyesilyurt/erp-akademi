// Quiz sekmesi (quiz.type = "quiz"): karışık sıralı çoktan seçmeli sorular
import { icon } from './icons.js';
import { progress, results } from './store.js';
import { esc, badge, progressBar, toast } from './ui.js';

const NS = 'quiz';
const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];
const TAG_TONE = { Kavram: 'info', Hesap: 'warning', Kural: 'success' };

// Yol başına oturum durumu (sekme değişse de korunur)
const sessions = new Map();

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function newSession(content) {
  const qs = shuffle(content.questions.map((_, i) => i));
  return {
    phase: 'q',
    order: qs,
    optOrder: qs.map((qi) => shuffle(content.questions[qi].options.map((_, i) => i))),
    idx: 0,
    picks: [], // seçilen orijinal şık indeksi
  };
}

const passPct = (c) => c.passPct ?? 70;

export function renderQuiz(ctx) {
  const id = ctx.track.id;
  if (!sessions.has(id)) sessions.set(id, { phase: 'start' });
  return {
    html: `<div class="quiz" data-quiz></div>`,
    bind(root) {
      const el = root.querySelector('[data-quiz]');
      const draw = (focusSel) => {
        el.innerHTML = view(ctx);
        if (focusSel) el.querySelector(focusSel)?.focus({ preventScroll: true });
      };
      draw();

      el.addEventListener('click', (e) => {
        const s = sessions.get(id);
        const b = e.target.closest('[data-q]');
        if (!b) return;
        const act = b.dataset.q;
        if (act === 'start') {
          sessions.set(id, newSession(ctx.content));
          draw('.opt');
          el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        } else if (act === 'pick' && s.picks[s.idx] == null) {
          s.picks[s.idx] = Number(b.dataset.opt);
          draw('[data-q="next"]');
        } else if (act === 'next') {
          if (s.idx < s.order.length - 1) {
            s.idx++;
            draw('.opt');
          } else {
            finish(ctx, s);
            draw();
          }
          el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        } else if (act === 'quit') {
          sessions.set(id, { phase: 'start' });
          draw();
        }
      });

      el.addEventListener('keydown', (e) => {
        const s = sessions.get(id);
        if (s.phase !== 'q' || s.picks[s.idx] != null) return;
        const n = Number(e.key);
        if (n >= 1 && n <= s.optOrder[s.idx].length) {
          el.querySelectorAll('.opt')[n - 1]?.click();
        }
      });
    },
  };
}

function finish(ctx, s) {
  const c = ctx.content;
  const correct = s.order.filter((qi, i) => s.picks[i] === c.questions[qi].answer).length;
  const pct = Math.round((correct / s.order.length) * 100);
  s.phase = 'end';
  s.correct = correct;
  s.pct = pct;

  const prev = results.get(NS, ctx.track.id);
  s.prevBest = prev.best ?? null;
  const best = Math.max(prev.best ?? 0, pct);
  results.set(NS, ctx.track.id, { best, attempts: (prev.attempts || 0) + 1, last: pct, at: new Date().toISOString() });

  if (pct >= passPct(c) && !progress.isDone(ctx.track.id, 'quiz')) {
    progress.setDone(ctx.track.id, 'quiz', true);
    toast(`Quiz geçildi: %${pct} · bölüm tamamlandı`);
    document.dispatchEvent(new CustomEvent('erp:progress'));
  }
}

function view(ctx) {
  const c = ctx.content;
  const s = sessions.get(ctx.track.id);
  if (s.phase === 'q') return questionView(c, s);
  if (s.phase === 'end') return endView(ctx, c, s);
  return startView(ctx, c);
}

function startView(ctx, c) {
  const r = results.get(NS, ctx.track.id);
  const tags = [...new Set(c.questions.map((q) => q.tag))];
  return `<div class="content">
    <header class="content-head"><h2>${esc(c.title || 'Quiz')}</h2>${c.intro ? `<p class="lead">${esc(c.intro)}</p>` : ''}</header>
    <div class="quiz-start card">
      <div class="quiz-facts">
        <div><span class="stat-label">Soru</span><strong>${c.questions.length}</strong></div>
        <div><span class="stat-label">Geçme notu</span><strong>%${passPct(c)}</strong></div>
        <div><span class="stat-label">En iyi skor</span><strong>${r.best != null ? `%${r.best}` : '—'}</strong></div>
        <div><span class="stat-label">Deneme</span><strong>${r.attempts || 0}</strong></div>
      </div>
      <div class="badges">${tags.map((t) => badge(`${t} · ${c.questions.filter((q) => q.tag === t).length}`, TAG_TONE[t] || 'neutral')).join('')}</div>
      <p class="cell-sub">Her sorudan sonra doğru cevap ve açıklama gösterilir. Klavyede 1–4 tuşlarıyla da cevaplayabilirsin.</p>
      <button class="btn btn-primary" type="button" data-q="start">${icon('play')}<span>${r.attempts ? 'Yeniden başla' : 'Quize başla'}</span></button>
    </div>
  </div>`;
}

function questionView(c, s) {
  const qi = s.order[s.idx];
  const q = c.questions[qi];
  const picked = s.picks[s.idx];
  const answered = picked != null;
  const total = s.order.length;
  const score = s.picks.filter((p, i) => p === c.questions[s.order[i]].answer).length;

  const opts = s.optOrder[s.idx]
    .map((oi, n) => {
      let cls = '';
      if (answered) {
        if (oi === q.answer) cls = 'is-correct';
        else if (oi === picked) cls = 'is-wrong';
        else cls = 'is-dim';
      }
      return `<button class="opt ${cls}" type="button" data-q="pick" data-opt="${oi}" ${answered ? 'disabled' : ''} aria-pressed="${oi === picked}">
        <span class="opt-key">${LETTERS[n]}</span><span class="opt-text">${esc(q.options[oi])}</span>
        ${answered && oi === q.answer ? icon('check', 'opt-ico') : answered && oi === picked ? icon('close', 'opt-ico') : ''}
      </button>`;
    })
    .join('');

  const ok = answered && picked === q.answer;
  return `<div class="quiz-q">
    <div class="quiz-top">
      <span class="cell-sub">Soru <strong>${s.idx + 1}</strong> / ${total}</span>
      ${badge(q.tag, TAG_TONE[q.tag] || 'neutral')}
      <span class="quiz-live">${icon('check')} ${score} doğru</span>
      <button class="link small" type="button" data-q="quit">Bırak</button>
    </div>
    ${progressBar(((s.idx + (answered ? 1 : 0)) / total) * 100, 'var(--accent, var(--primary))')}
    <h3 class="quiz-question" id="quiz-q">${esc(q.q)}</h3>
    <div class="opts" role="group" aria-labelledby="quiz-q">${opts}</div>
    ${answered ? `
      <aside class="callout ${ok ? 'callout-success' : 'callout-warning'}" aria-live="polite">${icon(ok ? 'check' : 'alert')}<div><strong>${ok ? 'Doğru' : 'Yanlış'}</strong><p>${esc(q.explanation)}</p></div></aside>
      <div class="quiz-next"><button class="btn btn-primary" type="button" data-q="next">${s.idx < total - 1 ? 'Sonraki soru' : 'Sonucu gör'}<span aria-hidden="true">→</span></button></div>` : ''}
  </div>`;
}

function endView(ctx, c, s) {
  const r = results.get(NS, ctx.track.id);
  const pass = s.pct >= passPct(c);
  const newBest = s.prevBest == null || s.pct > s.prevBest;
  const review = s.order
    .map((qi, i) => {
      const q = c.questions[qi];
      const ok = s.picks[i] === q.answer;
      return `<li class="${ok ? 'ok' : 'bad'}">
        <span class="mark ${ok ? 'ok' : 'bad'}">${icon(ok ? 'check' : 'close')}</span>
        <div>
          <div class="cell-main">${esc(q.q)}</div>
          ${ok ? '' : `<div class="cell-sub">Senin cevabın: ${esc(q.options[s.picks[i]])}</div><div class="review-correct">Doğru: ${esc(q.options[q.answer])}</div><p class="small">${esc(q.explanation)}</p>`}
        </div>
      </li>`;
    })
    .join('');

  const deg = Math.round((s.pct / 100) * 360);
  return `<div class="content">
    <div class="quiz-end card">
      <div class="ring ${pass ? 'pass' : 'fail'}" style="--deg:${deg}deg"><div><strong>%${s.pct}</strong><span>${s.correct}/${s.order.length}</span></div></div>
      <div class="quiz-end-text">
        <div class="badges">${badge(pass ? 'Geçti' : 'Geçme notunun altında', pass ? 'success' : 'warning')}${newBest ? badge('Yeni en iyi skor', 'info') : ''}</div>
        <h3>${pass ? 'Tebrikler! Quiz bölümü tamamlandı.' : `Geçmek için en az %${passPct(c)} gerekiyor.`}</h3>
        <p class="cell-sub">En iyi skor %${r.best} · ${r.attempts} deneme</p>
        <button class="btn btn-primary" type="button" data-q="start">${icon('play')}<span>Tekrar çöz</span></button>
      </div>
    </div>
    <h3 class="list-title">Soru bazında sonuç</h3>
    <ol class="review">${review}</ol>
  </div>`;
}
