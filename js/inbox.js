// Onay Kutusu (#/inbox): oturumdaki kullanıcının onayını bekleyen teklifler
import { icon } from './icons.js';
import { esc, money2 as money, datetime, badge, emptyState } from './ui.js';
import { loadCompany } from './company.js';
import { loadRoles, currentUser, currentRole, can, userLabel, lockReason, openLogin } from './auth.js';
import { inbox, handledBy, activeStep, statusBadge, openQuote } from './quotes.js';
import { loadMM, mmInbox } from './mm.js';
import { openDocRef } from './erp.js';

let tab = 'pending';

const APPROVE_PERMS = ['QUOTE_APPROVE', 'CREDIT_RELEASE', 'PR_RELEASE', 'PO_RELEASE'];

export function inboxCount() {
  try {
    return inbox().length + mmInbox().length;
  } catch {
    return 0;
  }
}

function row(q, mode) {
  const s = activeStep(q);
  const submitted = q.history.filter((h) => h.action === 'submitted').pop();
  const mine = mode === 'done' ? q.history.filter((h) => h.by === currentUser().id && (h.action === 'approved' || h.action === 'rejected')).pop() : null;
  return `<button class="inbox-row card" type="button" data-quote="${esc(q.no)}">
    <span class="inbox-icon ${mode === 'done' ? (mine?.action === 'approved' ? 'tone-success' : 'tone-danger') : 'tone-warning'}">${icon(mode === 'done' ? (mine?.action === 'approved' ? 'check' : 'close') : 'stamp')}</span>
    <span class="inbox-main">
      <span class="inbox-title"><span class="code">${esc(q.no)}</span> <strong>${esc(q.customerName)}</strong></span>
      <span class="cell-sub">${esc(userLabel(q.createdBy))} · ${datetime(submitted?.at || q.createdAt)}</span>
      ${s ? `<span class="inbox-reasons">${(s.reasons || []).map((r) => `<span>${esc(r)}</span>`).join('')}</span>` : ''}
      ${mine ? `<span class="cell-sub">Senin kararın: ${mine.action === 'approved' ? 'Onayladın' : 'Reddettin'} · ${datetime(mine.at)}${mine.note ? ` · “${esc(mine.note)}”` : ''}</span>` : ''}
    </span>
    <span class="inbox-side">
      <strong>${money(q.totals.net)}</strong>
      ${s ? badge(s.label, 'warning') : statusBadge(q)}
    </span>
  </button>`;
}

// Satın alma talebi / siparişi serbest bırakma satırı
function mmRow(x) {
  return `<button class="inbox-row card" type="button" data-mmdoc="${esc(x.kind)}:${esc(x.no)}">
    <span class="inbox-icon tone-warning">${icon(x.kind === 'pr' ? 'inbox' : 'cart')}</span>
    <span class="inbox-main">
      <span class="inbox-title"><span class="code">${esc(x.no)}</span> <strong>${x.kind === 'pr' ? 'Satın alma talebi' : 'Satın alma siparişi'} · ${esc(x.title)}</strong></span>
      <span class="cell-sub">${esc(userLabel(x.by))} · ${datetime(x.at)}</span>
      <span class="inbox-reasons"><span>${esc(x.reason)}</span></span>
    </span>
    <span class="inbox-side"><strong>${money(x.value)}</strong>${badge(x.kind === 'pr' ? 'Talep onayı' : 'Sipariş onayı', 'warning')}</span>
  </button>`;
}

export async function viewInbox(setView) {
  await loadRoles();
  await loadCompany();
  await loadMM();
  const me = currentUser();
  const role = currentRole();
  const hasPerm = APPROVE_PERMS.some((p) => can(p));
  const pending = inbox();
  const mmPending = mmInbox();
  const done = handledBy();

  let body;
  if (!hasPerm) {
    body = `<div class="card">${emptyState(
      'lock',
      'Bu rolün onay yetkisi yok',
      `${role?.name || 'Bu rol'} onay veremez. ${lockReason('QUOTE_APPROVE')}. Kredi onayı için: CREDIT_RELEASE.`,
      `<button class="btn btn-primary" type="button" data-login>${icon('user')}<span>Oturumu değiştir</span></button>`
    )}</div>`;
  } else {
    const list = tab === 'pending' ? pending : done;
    body = `
      <div class="seg-ctrl" role="tablist" aria-label="Onay kutusu">
        <button type="button" role="tab" data-tab="pending" aria-selected="${tab === 'pending'}" class="${tab === 'pending' ? 'is-active' : ''}">Bekleyen${pending.length + mmPending.length ? ` <span class="count">${pending.length + mmPending.length}</span>` : ''}</button>
        <button type="button" role="tab" data-tab="done" aria-selected="${tab === 'done'}" class="${tab === 'done' ? 'is-active' : ''}">İşlem yaptıklarım${done.length ? ` <span class="count muted-count">${done.length}</span>` : ''}</button>
      </div>
      <div class="inbox-list">${
        list.length || (tab === 'pending' && mmPending.length)
          ? (tab === 'pending' ? mmPending.map(mmRow).join('') : '') + list.map((q) => row(q, tab)).join('')
          : `<div class="card">${emptyState('inbox', tab === 'pending' ? 'Onay bekleyen teklif yok' : 'Henüz karar vermedin', tab === 'pending' ? 'Yetkine düşen bir onay adımı olduğunda burada görünür. Teklifi oluşturan kişi kendi teklifini onaylayamaz.' : 'Onayladığın veya reddettiğin teklifler burada listelenir.')}</div>`
      }</div>`;
  }

  setView(
    `<div data-inbox>
      <header class="page-head">
        <div>
          <p class="eyebrow">Onay akışı</p>
          <h1>Onay Kutusu</h1>
          <p class="lead">${esc(me?.name || '')} · ${esc(role?.name || '')}. ${can('QUOTE_APPROVE') ? 'İskonto ve tutar eşiğini aşan teklifler (müdür onayı) burada.' : can('CREDIT_RELEASE') ? 'Kredi limitini aşan teklifler (kredi onayı) burada; müdür onayından sonra sıraya girer.' : can('PR_RELEASE') || can('PO_RELEASE') ? 'Tutar eşiğini aşan satın alma talepleri ve siparişleri (serbest bırakma) burada.' : ''}</p>
        </div>
      </header>
      ${body}
    </div>`,
    'Onay Kutusu'
  );

  const root = document.querySelector('[data-inbox]');
  root?.addEventListener('click', (e) => {
    const t = e.target.closest('[data-tab]');
    if (t) {
      tab = t.dataset.tab;
      return viewInbox(setView);
    }
    if (e.target.closest('[data-login]')) return openLogin();
    const mm = e.target.closest('[data-mmdoc]');
    if (mm) return openDocRef(mm.dataset.mmdoc);
    const q = e.target.closest('[data-quote]');
    if (q) openQuote(q.dataset.quote);
  });
}
