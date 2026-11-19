// Teklif iş akışı: durumlar, sıralı onay adımları, görünürlük ve detay paneli
// Durumlar: draft (Taslak) → pending (Onay bekliyor) → approved (Onaylandı) | rejected (Reddedildi)
import { icon } from './icons.js';
import { quotes as store } from './store.js';
import {
  esc, money2 as money, num, date, datetime, pct1, badge, kv, dsec, alertBox, toast,
  openDrawer, closeDrawer, drawerHead,
} from './ui.js';
import { channelName, termName, company } from './company.js';
import { can, currentUser, userLabel, actionBtn, lockReason } from './auth.js';
import { flowHtml, orderForQuote, openOrderForm, openDocRef } from './erp.js';

export const STATUS = {
  draft: { label: 'Taslak', tone: 'neutral' },
  pending: { label: 'Onay bekliyor', tone: 'warning' },
  approved: { label: 'Onaylandı', tone: 'success' },
  rejected: { label: 'Reddedildi', tone: 'danger' },
};

// Onay adımı → gereken yetki
export const STEP_PERM = { manager: 'QUOTE_APPROVE', credit: 'CREDIT_RELEASE' };
const STEP_LABEL = { manager: 'Müdür onayı', credit: 'Kredi onayı' };

const ACTION = {
  created: { label: 'Teklifi oluşturdu', icon: 'tag', tone: 'neutral' },
  draft: { label: 'Taslak olarak kaydetti', icon: 'edit', tone: 'neutral' },
  submitted: { label: 'Onaya gönderdi', icon: 'send', tone: 'info' },
  'auto-approved': { label: 'Onay gerekmedi, teklif onaylandı', icon: 'check', tone: 'success' },
  approved: { label: 'Onayladı', icon: 'check', tone: 'success' },
  rejected: { label: 'Reddetti', icon: 'close', tone: 'danger' },
};

const nowIso = () => new Date().toISOString();

// Eski kayıtları (adım 3) yeni yapıya taşır
export function normalize(q) {
  if (!q) return q;
  const n = { ...q };
  n.createdBy = n.createdBy || 'U01';
  n.approvals = (n.approvals || []).map((a, i) => ({
    ...a,
    perm: a.perm || STEP_PERM[a.key],
    status: a.status || (i === 0 ? 'pending' : 'waiting'),
  }));
  if (!n.status) n.status = n.approvals.length ? 'pending' : 'approved';
  if (!n.history) {
    n.history = [{ at: n.createdAt, by: n.createdBy, action: 'created' }];
    n.history.push(n.approvals.length ? { at: n.createdAt, by: n.createdBy, action: 'submitted' } : { at: n.createdAt, by: n.createdBy, action: 'auto-approved' });
  }
  return n;
}

export const all = () => store.list().map(normalize);
export const get = (no) => normalize(store.get(no));

export function activeStep(q) {
  return q.status === 'pending' ? q.approvals.find((a) => a.status === 'pending') || null : null;
}

// Kullanıcının görebileceği teklifler
export function visible(user = currentUser()) {
  if (can('QUOTE_VIEW_ALL')) return all();
  if (can('QUOTE_VIEW_OWN')) return all().filter((q) => q.createdBy === user?.id);
  return [];
}

// Onay Kutusu: aktif adımı kullanıcının yetkisinde olan, kendi oluşturmadığı teklifler
export function inbox(user = currentUser()) {
  return all().filter((q) => {
    const s = activeStep(q);
    return s && can(s.perm) && q.createdBy !== user?.id;
  });
}

// Kullanıcının daha önce işlem yaptığı (onay/ret) teklifler
export function handledBy(user = currentUser()) {
  return all().filter((q) => q.history.some((h) => h.by === user?.id && (h.action === 'approved' || h.action === 'rejected')));
}

// ---------- durum geçişleri ----------
function persist(q) {
  store.update(q);
  document.dispatchEvent(new CustomEvent('erp:refresh'));
}

// Yeni kayıt: rec onay adımlarını (key, label, reasons, approver) içerir
export function create(rec, start, { asDraft = false } = {}) {
  const me = currentUser();
  const at = nowIso();
  const base = {
    ...rec,
    createdBy: me.id,
    createdAt: at,
    approvals: (rec.approvals || []).map((a) => ({ ...a, perm: STEP_PERM[a.key], status: 'waiting' })),
    status: 'draft',
    history: [{ at, by: me.id, action: asDraft ? 'draft' : 'created' }],
  };
  if (!asDraft) applySubmit(base, me.id, at);
  return store.add(base, start);
}

function applySubmit(q, by, at) {
  if (q.approvals.length) {
    q.status = 'pending';
    q.approvals.forEach((a, i) => (a.status = i === 0 ? 'pending' : 'waiting'));
    q.history.push({ at, by, action: 'submitted' });
  } else {
    q.status = 'approved';
    q.history.push({ at, by, action: 'auto-approved' });
  }
}

export function submit(no) {
  const q = get(no);
  const me = currentUser();
  if (!q || q.status !== 'draft' || q.createdBy !== me.id || !can('QUOTE_CREATE')) return false;
  applySubmit(q, me.id, nowIso());
  persist(q);
  return q;
}

export function approve(no, note = '') {
  const q = get(no);
  const me = currentUser();
  const s = q && activeStep(q);
  if (!s || !can(s.perm) || q.createdBy === me.id) return false;
  const at = nowIso();
  Object.assign(s, { status: 'approved', by: me.id, at, note });
  q.history.push({ at, by: me.id, action: 'approved', step: s.key, note });
  const next = q.approvals.find((a) => a.status === 'waiting');
  if (next) next.status = 'pending';
  else q.status = 'approved';
  persist(q);
  return q;
}

export function reject(no, note) {
  const q = get(no);
  const me = currentUser();
  const s = q && activeStep(q);
  if (!s || !can(s.perm) || q.createdBy === me.id || !note?.trim()) return false;
  const at = nowIso();
  Object.assign(s, { status: 'rejected', by: me.id, at, note });
  q.approvals.filter((a) => a.status === 'waiting').forEach((a) => (a.status = 'skipped'));
  q.status = 'rejected';
  q.history.push({ at, by: me.id, action: 'rejected', step: s.key, note });
  persist(q);
  return q;
}

export function remove(no) {
  store.remove(no);
  document.dispatchEvent(new CustomEvent('erp:refresh'));
}

// ---------- görünüm parçaları ----------
export const statusBadge = (q) => badge(STATUS[q.status]?.label || q.status, STATUS[q.status]?.tone || 'neutral');

function stepper(q) {
  if (!q.approvals.length) return `<p class="cell-sub">Bu teklif onay eşiklerinin altında; onay adımı yok.</p>`;
  const st = {
    waiting: ['Sırada', 'neutral', 'clock'],
    pending: ['Bekliyor', 'warning', 'clock'],
    approved: ['Onaylandı', 'success', 'check'],
    rejected: ['Reddedildi', 'danger', 'close'],
    skipped: ['Atlandı', 'neutral', 'close'],
  };
  return `<ol class="ap-steps">${q.approvals
    .map((a) => {
      const [l, tone, ic] = st[a.status] || st.waiting;
      return `<li class="ap-step is-${a.status}">
        <span class="ap-dot tone-${tone}">${icon(ic)}</span>
        <div>
          <div class="ap-title"><strong>${esc(a.label || STEP_LABEL[a.key])}</strong>${badge(l, tone)}</div>
          <ul class="ap-reasons">${(a.reasons || []).map((r) => `<li>${esc(r)}</li>`).join('')}</ul>
          <span class="cell-sub">${a.by ? `${esc(userLabel(a.by))} · ${datetime(a.at)}` : `Yetki: <span class="code">${esc(a.perm)}</span> · ${esc(a.approver || '')}`}</span>
          ${a.note ? `<p class="ap-note">“${esc(a.note)}”</p>` : ''}
        </div>
      </li>`;
    })
    .join('')}</ol>`;
}

export function timeline(q) {
  return `<ol class="timeline">${[...q.history]
    .reverse()
    .map((h) => {
      const a = ACTION[h.action] || { label: h.action, icon: 'clock', tone: 'neutral' };
      return `<li>
        <span class="tl-dot tone-${a.tone}">${icon(a.icon)}</span>
        <div class="tl-body">
          <div><strong>${esc(userLabel(h.by))}</strong> <span>${esc(a.label)}${h.step ? ` · ${esc(STEP_LABEL[h.step] || h.step)}` : ''}</span></div>
          <span class="cell-sub">${datetime(h.at)}</span>
          ${h.note ? `<p class="tl-note">${esc(h.note)}</p>` : ''}
        </div>
      </li>`;
    })
    .join('')}</ol>`;
}

function actionsHtml(q) {
  const me = currentUser();
  const s = activeStep(q);
  const own = q.createdBy === me?.id;
  let html = '';

  if (s) {
    const sod = own ? 'Görevler ayrılığı: kendi oluşturduğun teklifi onaylayamazsın.' : null;
    html += `<div class="decide">
      <div class="decide-head">${icon('stamp')}<strong>${esc(s.label || STEP_LABEL[s.key])}</strong><span class="cell-sub">Gerekli yetki: <span class="code">${esc(s.perm)}</span></span></div>
      ${can(s.perm) && !own ? `<label class="field"><span class="field-label">Not / gerekçe <span class="cell-sub inline">reddederken zorunlu</span></span><textarea class="input textarea" rows="2" data-note placeholder="Ör. Kampanya kapsamında, A segmenti; onaylandı."></textarea></label>` : ''}
      <div class="decide-actions">
        ${actionBtn({ perm: s.perm, label: 'Onayla', iconName: 'check', cls: 'btn-primary', attrs: `data-act="approve" data-no="${esc(q.no)}"`, reason: sod })}
        ${actionBtn({ perm: s.perm, label: 'Reddet', iconName: 'close', cls: 'btn-ghost danger', attrs: `data-act="reject" data-no="${esc(q.no)}"`, reason: sod })}
      </div>
    </div>`;
  }

  const btns = [];
  if (q.status === 'approved') {
    const o = orderForQuote(q.no);
    btns.push(
      o
        ? `<button class="btn btn-primary" type="button" data-act="doc" data-doc="order:${esc(o.no)}">${icon('cart')}<span>Sipariş ${esc(o.no)}</span></button>`
        : actionBtn({ perm: 'ORDER_CREATE', label: 'Siparişe dönüştür', iconName: 'cart', attrs: `data-act="to-order" data-no="${esc(q.no)}"` })
    );
  }
  if (q.status === 'draft') {
    btns.push(actionBtn({ perm: 'QUOTE_CREATE', label: 'Onaya gönder', iconName: 'send', attrs: `data-act="submit" data-no="${esc(q.no)}"`, reason: !own ? 'Taslağı yalnızca oluşturan kişi gönderebilir.' : null }));
  }
  if (q.status === 'rejected' || q.status === 'draft' || q.status === 'approved') {
    btns.push(actionBtn({ perm: 'QUOTE_CREATE', label: q.status === 'rejected' ? 'Revize et (yeni teklif)' : 'Yeni teklife kopyala', iconName: 'layers', cls: q.status === 'rejected' ? 'btn-primary' : 'btn-ghost', attrs: `data-act="copy" data-no="${esc(q.no)}"` }));
  }
  const hasOrder = !!orderForQuote(q.no);
  btns.push(actionBtn({ perm: 'QUOTE_CREATE', label: 'Sil', iconName: 'close', cls: 'btn-ghost danger', attrs: `data-act="delete" data-no="${esc(q.no)}"`, reason: hasOrder ? 'Siparişe dönüşmüş teklif silinemez.' : !own && can('QUOTE_CREATE') ? 'Yalnızca oluşturan kişi silebilir.' : null }));
  return html + `<div class="drawer-actions">${btns.join('')}</div>`;
}

function detailHtml(q) {
  const wh = company().organization.warehouses.find((w) => w.code === q.plant);
  return (
    drawerHead(`Teklif · ${q.no}`, q.customerName, statusBadge(q) + badge(`Segment ${q.segment}`, 'neutral') + badge(channelName(q.channel), 'neutral')) +
    `<div class="drawer-body">
      ${q.status === 'rejected' ? alertBox('danger', 'Teklif reddedildi', esc(q.history.filter((h) => h.action === 'rejected').pop()?.note || '')) : ''}
      ${dsec('Onay akışı', stepper(q))}
      ${actionsHtml(q)}
      ${dsec('Belge akışı', flowHtml({ type: 'quote', no: q.no }))}
      ${dsec('Durum geçmişi', timeline(q))}
      ${dsec(
        'Başlık',
        kv([
          ['Müşteri', `${esc(q.customer)} · ${esc(q.customerName)}`],
          ['Oluşturan', esc(userLabel(q.createdBy))],
          ['Satış alanı', `<span class="code">${esc(q.salesArea)}</span>`],
          ['Teklif tarihi', date(q.date)],
          ['Geçerlilik', date(q.validTo)],
          ['Ödeme koşulu', `<span class="code">${esc(q.paymentTerm)}</span> ${esc(termName(q.paymentTerm))}`],
          ['Teslimat deposu', esc(`${q.plant} · ${wh?.name || ''}`)],
          ['İlgili kişi', esc(q.contact || '—')],
          q.reference ? ['Müşteri referansı', esc(q.reference)] : null,
          q.scenario ? ['Senaryo', esc(q.scenario.title)] : null,
        ])
      )}
      ${dsec(
        `Kalemler (${q.lines.length})`,
        `<table class="cond-table"><thead><tr><th>Kalem</th><th>Ürün</th><th class="num">Miktar</th><th class="num">Net tutar</th></tr></thead><tbody>${q.lines
          .map((l) => `<tr><td><span class="code">${l.pos}</span></td><td>${esc(l.name)}${l.campaign ? ' <span class="tag-camp">Kampanya</span>' : ''}${l.short ? ' <span class="tag-camp warn">Stok</span>' : ''}<div class="cell-sub">${money(l.net)} / ${esc(l.unit)}</div></td><td class="num">${num(l.qty)} ${esc(l.unit)}</td><td class="num">${money(l.netTotal)}</td></tr>`)
          .join('')}</tbody></table>`
      )}
      ${dsec(
        'Toplamlar',
        kv([
          ['Liste tutarı (PR00)', money(q.totals.list)],
          ['Segment iskontosu (K007)', `−${money(q.totals.k007)}`],
          ['Kampanya iskontosu (ZKMP)', `−${money(q.totals.zkmp)}`],
          ['Net tutar', `<strong>${money(q.totals.net)}</strong>`],
          ['KDV', money(q.totals.vat)],
          ['Genel toplam', `<strong>${money(q.totals.gross)}</strong>`],
          ['Toplam iskonto', pct1(q.totals.discountPct)],
        ])
      )}
    </div>`
  );
}

// opts.onCopy(q): "kopyala / revize et" için çağıran modülün işleyicisi
export function openQuote(no, opts = {}) {
  const q = get(no);
  if (!q) return toast('Teklif bulunamadı');
  openDrawer(detailHtml(q), (el) => {
    const act = el.dataset.act;
    const root = el.closest('.drawer-inner');
    const note = root?.querySelector('[data-note]')?.value.trim() || '';
    if (act === 'doc') return openDocRef(el.dataset.doc);
    if (act === 'to-order') return openOrderForm(no);
    if (act === 'approve') {
      const r = approve(no, note);
      if (!r) return toast('Onay verilemedi');
      toast(r.status === 'approved' ? `Teklif ${no} onaylandı` : `${no}: adım onaylandı, sıradaki onaya geçti`);
      openQuote(no, opts);
    } else if (act === 'reject') {
      if (!note) {
        root.querySelector('[data-note]')?.focus();
        return toast('Reddetmek için gerekçe yaz');
      }
      if (!reject(no, note)) return toast('Ret işlemi yapılamadı');
      toast(`Teklif ${no} reddedildi`);
      openQuote(no, opts);
    } else if (act === 'submit') {
      const r = submit(no);
      if (!r) return toast('Gönderilemedi');
      toast(r.status === 'approved' ? 'Onay gerekmedi; teklif onaylandı' : 'Teklif onaya gönderildi');
      openQuote(no, opts);
    } else if (act === 'delete') {
      if (!el.classList.contains('confirm')) {
        el.classList.add('confirm');
        el.querySelector('span').textContent = 'Silmek için tekrar dokun';
        return;
      }
      remove(no);
      closeDrawer();
      toast(`Teklif ${no} silindi`);
    } else if (act === 'copy') {
      if (opts.onCopy) {
        closeDrawer();
        opts.onCopy(q);
      } else {
        closeDrawer();
        location.hash = `#/track/${encodeURIComponent(q.track || 'b2b-crm')}/simulation?copy=${encodeURIComponent(no)}`;
      }
    }
  });
}

export { lockReason };
