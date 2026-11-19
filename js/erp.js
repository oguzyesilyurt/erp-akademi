// ERP tarafı simülasyonu: satış siparişi → aktarım mesajı (CRM → ERP) → teslimat → fatura
// Tüm belgeler tarayıcıda saklanır. Numara aralıkları:
//   sipariş 10000001+, aktarım mesajı 50000001+, teslimat 80000001+, fatura 90000001+
import { icon } from './icons.js';
import {
  esc, money2 as money, num, date, datetime, badge, kv, dsec, alertBox, toast,
  openDrawer, closeDrawer, drawerHead, drawerOpen,
} from './ui.js';
import {
  company, partnerOf, productOf, erpNumberOf, termOf, termName, channelName, updateProduct, updateCustomer, openDetail,
} from './company.js';
import { can, currentUser, userLabel, actionBtn } from './auth.js';
import { flag } from './release.js';
import { get as getQuote, openQuote, statusBadge as quoteStatusBadge } from './quotes.js';

const KEY = 'erp-akademi:erp';
const START = { order: 10000001, message: 50000001, delivery: 80000001, invoice: 90000001 };
const PROCESS_DELAY = 1400;

// ---------- depolama ----------
const empty = () => ({ orders: [], messages: [], deliveries: [], invoices: [], seq: {} });

function read() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    return s ? { ...empty(), ...s, seq: s.seq || {} } : empty();
  } catch {
    return empty();
  }
}

function write(s) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {}
}

function nextNo(s, kind) {
  const n = Math.max((s.seq[kind] || 0) + 1, START[kind]);
  s.seq[kind] = n;
  return String(n);
}

const nowIso = () => new Date().toISOString();
const sysDate = () => company().asOf;
const refresh = () => document.dispatchEvent(new CustomEvent('erp:refresh'));
const whName = (code) => company().organization.warehouses.find((w) => w.code === code)?.name || code;
const actorLabel = (by) => (by === 'SYSTEM' ? 'Sistem (arayüz)' : userLabel(by));

function addDays(iso, n) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// ---------- okuma ----------
export const orders = () => read().orders;
export const messages = () => read().messages;
export const invoices = () => read().invoices;
export const getOrder = (no) => read().orders.find((o) => o.no === no) || null;
export const getMessage = (no) => read().messages.find((m) => m.no === no) || null;
export const getDelivery = (no) => read().deliveries.find((d) => d.no === no) || null;
export const getInvoice = (no) => read().invoices.find((i) => i.no === no) || null;
export const orderForQuote = (qno) => read().orders.find((o) => o.quoteNo === qno) || null;
export const errorCount = () => read().messages.filter((m) => m.status === 'error').length;

export function visibleOrders(user = currentUser()) {
  if (can('QUOTE_VIEW_ALL')) return orders();
  if (can('QUOTE_VIEW_OWN')) return orders().filter((o) => o.createdBy === user?.id);
  return [];
}

export const ORDER_STATUS = {
  open: { label: 'Açık', tone: 'info' },
  delivered: { label: 'Teslim edildi', tone: 'info' },
  invoiced: { label: 'Faturalandı', tone: 'success' },
};
export const ERP_STATUS = {
  pending: { label: 'Aktarım bekliyor', tone: 'neutral' },
  error: { label: 'Aktarım hatalı', tone: 'danger' },
  transferred: { label: "ERP'ye aktarıldı", tone: 'success' },
};
export const MSG_STATUS = {
  pending: { label: 'Bekliyor', tone: 'neutral' },
  success: { label: 'Başarılı', tone: 'success' },
  error: { label: 'Hatalı', tone: 'danger' },
};
const st = (map, k) => badge(map[k]?.label || k, map[k]?.tone || 'neutral');
export const orderBadges = (o) => st(ORDER_STATUS, o.status) + st(ERP_STATUS, o.erpStatus);

// ---------- sipariş ----------
export function createOrder(qno, { customerPo, requestedDate, plant, note = '' }) {
  const q = getQuote(qno);
  const me = currentUser();
  if (!q || q.status !== 'approved') return { error: 'Yalnızca onaylanmış teklif siparişe dönüştürülebilir.' };
  if (!can('ORDER_CREATE')) return { error: 'Sipariş oluşturma yetkin yok (ORDER_CREATE).' };
  if (orderForQuote(qno)) return { error: 'Bu teklif zaten siparişe dönüştürülmüş.' };
  if (!customerPo?.trim()) return { error: 'Müşteri sipariş no gir.' };
  if (!requestedDate || requestedDate < sysDate()) return { error: 'İstenen teslim tarihi bugünden önce olamaz.' };
  if (q.validTo && q.validTo < sysDate()) return { error: 'Teklifin geçerlilik süresi dolmuş.' };

  const s = read();
  const at = nowIso();
  const cust = partnerOf(q.customer);
  const o = {
    no: nextNo(s, 'order'),
    quoteNo: q.no,
    date: sysDate(),
    customer: q.customer,
    customerName: q.customerName,
    segment: q.segment,
    channel: q.channel,
    salesArea: q.salesArea,
    paymentTerm: cust?.paymentTerm || q.paymentTerm,
    plant,
    requestedDate,
    customerPo: customerPo.trim(),
    note: note.trim(),
    contact: q.contact,
    lines: q.lines,
    totals: q.totals,
    track: q.track,
    createdBy: me.id,
    createdAt: at,
    status: 'open',
    erpStatus: 'pending',
    history: [{ at, by: me.id, action: 'order-created', note: `Teklif ${q.no} referanslı` }],
  };
  const m = {
    no: nextNo(s, 'message'),
    type: 'ORDERS',
    direction: 'CRM → ERP',
    orderNo: o.no,
    status: 'pending',
    createdAt: at,
    attempts: [],
    error: null,
    payload: buildPayload(o),
  };
  o.messageNo = m.no;
  o.history.push({ at, by: 'SYSTEM', action: 'msg-created', note: `Mesaj ${m.no}` });
  s.orders.unshift(o);
  s.messages.unshift(m);
  write(s);
  scheduleProcess(m.no);
  refresh();
  return { order: o, message: m };
}

function buildPayload(o) {
  const cust = partnerOf(o.customer);
  return {
    messageType: 'ORDERS',
    sender: 'CRM',
    receiver: 'S4H_100',
    header: {
      crmOrderNo: o.no,
      quoteRef: o.quoteNo,
      soldTo: erpNumberOf(cust),
      crmAccount: o.customer,
      salesArea: o.salesArea,
      plant: o.plant,
      requestedDeliveryDate: o.requestedDate,
      customerPO: o.customerPo,
      paymentTerm: o.paymentTerm,
      currency: company().currency,
    },
    items: o.lines.map((l) => ({ item: l.pos, material: l.code, quantity: l.qty, unit: l.unit, netPrice: l.net, netValue: l.netTotal })),
  };
}

// ---------- aktarım kuralları ----------
function validate(o) {
  const errors = [];
  const cust = partnerOf(o.customer);
  const erp = erpNumberOf(cust);
  if (!erp) {
    errors.push({ kind: 'customer', text: `Müşteri ERP'de tanımlı değil: ${o.customer} ${o.customerName}. Müşteri ana verisi ERP'de açılmadan satış siparişi oluşturulamaz.` });
  } else if (cust?.blocked) {
    errors.push({ kind: 'blocked', text: `Müşteri ERP'de bloke: ${erp} ${o.customerName}. Blokaj kaldırılmadan sipariş kabul edilmez.` });
  }
  const short = o.lines
    .map((l) => ({ l, avail: productOf(l.code)?.stock?.[o.plant] ?? 0 }))
    .filter((x) => x.avail < x.l.qty);
  if (short.length) {
    errors.push({
      kind: 'stock',
      text: `Depoda kullanılabilir stok yok: ${o.plant} ${whName(o.plant)} — ${short.map((x) => `${x.l.code} (istenen ${num(x.l.qty)} ${x.l.unit}, mevcut ${num(x.avail)})`).join('; ')}.`,
    });
  }
  return errors;
}

const pendingTimers = new Map();
function scheduleProcess(no) {
  if (pendingTimers.has(no)) return;
  pendingTimers.set(no, setTimeout(() => {
    pendingTimers.delete(no);
    processMessage(no, 'SYSTEM');
  }, PROCESS_DELAY));
}

// Sayfa yeniden açıldığında yarım kalan mesajları işler
export function processPending() {
  read().messages.filter((m) => m.status === 'pending').forEach((m) => scheduleProcess(m.no));
}

function processMessage(no, by) {
  const s = read();
  const m = s.messages.find((x) => x.no === no);
  const o = m && s.orders.find((x) => x.no === m.orderNo);
  if (!m || !o) return null;
  const at = nowIso();
  const errors = validate(o);
  m.payload = buildPayload(o);
  m.status = errors.length ? 'error' : 'success';
  m.error = errors.length ? errors.map((e) => e.text).join('\n') : null;
  m.errorKinds = errors.map((e) => e.kind);
  m.attempts.push({ at, by, result: m.status, error: m.error });
  o.erpStatus = errors.length ? 'error' : 'transferred';
  if (!errors.length) o.erpCustomer = erpNumberOf(partnerOf(o.customer));
  o.history.push({ at, by, action: errors.length ? 'erp-error' : 'erp-ok', note: errors.length ? m.error : `ERP müşteri ${o.erpCustomer}` });
  write(s);

  toast(errors.length ? `Aktarım hatası · mesaj ${m.no}` : `Sipariş ${o.no} ERP'ye aktarıldı`);
  refresh();
  if (drawerOpen() && current && ((current.type === 'order' && current.no === o.no) || (current.type === 'message' && current.no === m.no))) {
    openDoc(current.type, current.no);
  }
  return m;
}

export function reprocess(no) {
  const m = getMessage(no);
  if (!m || m.status !== 'error') return { error: 'Yalnızca hatalı mesaj yeniden işlenir.' };
  if (!can('INTERFACE_REPROCESS')) return { error: 'Yetki yok (INTERFACE_REPROCESS).' };
  return { message: processMessage(no, currentUser().id) };
}

export function changeOrderPlant(orderNo, plant) {
  if (!can('INTERFACE_REPROCESS')) return false;
  const s = read();
  const o = s.orders.find((x) => x.no === orderNo);
  if (!o || o.erpStatus === 'transferred' || o.plant === plant) return false;
  const prev = o.plant;
  o.plant = plant;
  o.history.push({ at: nowIso(), by: currentUser().id, action: 'plant-changed', note: `${prev} → ${plant}` });
  write(s);
  refresh();
  return true;
}

// ---------- teslimat ve fatura ----------
export function createDelivery(orderNo) {
  if (!can('DELIVERY_CREATE')) return { error: 'Teslimat oluşturma yetkin yok (DELIVERY_CREATE).' };
  const s = read();
  const o = s.orders.find((x) => x.no === orderNo);
  if (!o || o.erpStatus !== 'transferred') return { error: "Sipariş henüz ERP'ye aktarılmadı." };
  if (o.deliveryNo) return { error: 'Bu sipariş için teslimat zaten var.' };
  const short = o.lines.filter((l) => (productOf(l.code)?.stock?.[o.plant] ?? 0) < l.qty);
  if (short.length) return { error: `Teslimat oluşturulamadı: ${o.plant} deposunda yetersiz stok (${short.map((l) => l.code).join(', ')}).` };

  const at = nowIso();
  const me = currentUser();
  const moves = o.lines.map((l) => {
    const p = productOf(l.code);
    const before = p.stock[o.plant] ?? 0;
    // v1.1 hatası (BUG_DELIVERY_NO_STOCK): belge doğru görünür ama stok güncellenmez
    if (!flag('BUG_DELIVERY_NO_STOCK')) updateProduct(l.code, { stock: { ...p.stock, [o.plant]: before - l.qty } }, { silent: true });
    return { code: l.code, name: l.name, qty: l.qty, unit: l.unit, before, after: before - l.qty };
  });
  const d = { no: nextNo(s, 'delivery'), orderNo: o.no, customer: o.customer, customerName: o.customerName, date: sysDate(), plant: o.plant, lines: moves, createdBy: me.id, createdAt: at };
  s.deliveries.unshift(d);
  o.deliveryNo = d.no;
  o.status = 'delivered';
  o.history.push({ at, by: me.id, action: 'delivered', note: `Teslimat ${d.no} · ${o.plant} ${whName(o.plant)}` });
  write(s);
  refresh();
  return { delivery: d };
}

export function createInvoice(orderNo) {
  if (!can('INVOICE_CREATE')) return { error: 'Fatura oluşturma yetkin yok (INVOICE_CREATE).' };
  const s = read();
  const o = s.orders.find((x) => x.no === orderNo);
  if (!o?.deliveryNo) return { error: 'Faturadan önce teslimat oluşturulmalı.' };
  if (o.invoiceNo) return { error: 'Bu sipariş zaten faturalandı.' };

  const at = nowIso();
  const me = currentUser();
  const cust = partnerOf(o.customer);
  const before = cust?.openBalance || 0;
  const after = Math.round((before + o.totals.gross) * 100) / 100;
  updateCustomer(o.customer, { openBalance: after }, { silent: true });
  const term = termOf(o.paymentTerm);
  const inv = {
    no: nextNo(s, 'invoice'), orderNo: o.no, deliveryNo: o.deliveryNo, customer: o.customer, customerName: o.customerName,
    erpCustomer: o.erpCustomer, date: sysDate(), // v1.1 hatası (BUG_INVOICE_DUE): vade ödeme koşulunu yok sayar
    dueDate: flag('BUG_INVOICE_DUE') ? sysDate() : addDays(sysDate(), term?.days || 0), paymentTerm: o.paymentTerm,
    net: o.totals.net, vat: o.totals.vat, gross: o.totals.gross, balanceBefore: before, balanceAfter: after, createdBy: me.id, createdAt: at,
  };
  s.invoices.unshift(inv);
  o.invoiceNo = inv.no;
  o.status = 'invoiced';
  o.history.push({ at, by: me.id, action: 'invoiced', note: `Fatura ${inv.no} · ${money(inv.gross)}` });
  write(s);
  refresh();
  return { invoice: inv };
}

export function resetErp() {
  write(empty());
  pendingTimers.forEach((t) => clearTimeout(t));
  pendingTimers.clear();
  refresh();
}

// ---------- belge akışı ----------
// anchor: { type: 'quote'|'order'|'delivery'|'invoice'|'message', no }
export function flowHtml(anchor) {
  let o = null;
  let q = null;
  if (anchor.type === 'quote') {
    q = getQuote(anchor.no);
    o = orderForQuote(anchor.no);
  } else {
    o = anchor.type === 'order' ? getOrder(anchor.no)
      : anchor.type === 'delivery' ? getOrder(getDelivery(anchor.no)?.orderNo)
      : anchor.type === 'invoice' ? getOrder(getInvoice(anchor.no)?.orderNo)
      : getOrder(getMessage(anchor.no)?.orderNo);
    q = o ? getQuote(o.quoteNo) : null;
  }
  const m = o?.messageNo ? getMessage(o.messageNo) : null;
  const d = o?.deliveryNo ? getDelivery(o.deliveryNo) : null;
  const inv = o?.invoiceNo ? getInvoice(o.invoiceNo) : null;

  const node = (type, no, lvl, label, ic, statusHtml, meta, sys) => {
    const isCur = anchor.type === type && anchor.no === no;
    if (!no) {
      return `<li class="df-node is-empty" style="--lvl:${lvl}"><span class="df-ico">${icon(ic)}</span><div class="df-body"><span class="df-type">${esc(label)}</span><span class="cell-sub">Henüz oluşturulmadı</span></div></li>`;
    }
    return `<li class="df-node${isCur ? ' is-current' : ''}" style="--lvl:${lvl}">
      <button class="df-btn" type="button" data-act="doc" data-doc="${type}:${esc(no)}" ${isCur ? 'aria-current="true"' : ''}>
        <span class="df-ico">${icon(ic)}</span>
        <span class="df-body">
          <span class="df-top"><span class="df-type">${esc(label)}</span><span class="code">${esc(no)}</span>${sys ? `<span class="flow-sys${sys === 'ERP' ? ' is-erp' : ''}">${sys}</span>` : ''}</span>
          <span class="df-meta">${statusHtml}<span class="cell-sub">${meta}</span></span>
        </span>
      </button>
    </li>`;
  };

  return `<ol class="docflow">
    ${node('quote', q?.no, 0, 'Teklif', 'tag', q ? quoteStatusBadge(q) : '', q ? `${date(q.date)} · ${money(q.totals.net)}` : '', 'CRM')}
    ${node('order', o?.no, 1, 'Satış siparişi', 'cart', o ? st(ERP_STATUS, o.erpStatus) : '', o ? `${date(o.date)} · ${money(o.totals.net)}` : '', 'CRM')}
    ${o ? node('message', m?.no, 2, 'Aktarım mesajı', 'link', m ? st(MSG_STATUS, m.status) : '', m ? `${esc(m.direction)} · ${m.attempts.length} deneme` : '', '') : ''}
    ${o ? node('delivery', d?.no, 2, 'Teslimat', 'truck', d ? badge('Çıkış yapıldı', 'success') : '', d ? `${date(d.date)} · ${esc(d.plant)} ${esc(whName(d.plant))}` : '', 'ERP') : ''}
    ${o ? node('invoice', inv?.no, 3, 'Fatura', 'book', inv ? badge(`Vade ${date(inv.dueDate)}`, 'neutral') : '', inv ? `${date(inv.date)} · ${money(inv.gross)}` : '', 'ERP') : ''}
  </ol>`;
}

// ---------- detay panelleri ----------
let current = null;

const ACTION = {
  'order-created': ['Siparişi oluşturdu', 'cart', 'neutral'],
  'msg-created': ['Aktarım mesajı oluşturdu', 'link', 'info'],
  'erp-ok': ["ERP'ye aktarıldı", 'check', 'success'],
  'erp-error': ['Aktarım hatası', 'alert', 'danger'],
  'plant-changed': ['Teslimat deposunu değiştirdi', 'edit', 'info'],
  delivered: ['Teslimat oluşturdu', 'truck', 'success'],
  invoiced: ['Fatura kesti', 'book', 'success'],
};

function historyHtml(hist) {
  return `<ol class="timeline">${[...hist]
    .reverse()
    .map((h) => {
      const [label, ic, tone] = ACTION[h.action] || [h.action, 'clock', 'neutral'];
      return `<li><span class="tl-dot tone-${tone}">${icon(ic)}</span><div class="tl-body">
        <div><strong>${esc(actorLabel(h.by))}</strong> <span>${esc(label)}</span></div>
        <span class="cell-sub">${datetime(h.at)}</span>
        ${h.note ? `<p class="tl-note">${esc(h.note)}</p>` : ''}
      </div></li>`;
    })
    .join('')}</ol>`;
}

function linesTable(lines, extra = null) {
  return `<table class="cond-table"><thead><tr><th>Kalem</th><th>Ürün</th><th class="num">Miktar</th><th class="num">${extra ? esc(extra.head) : 'Net tutar'}</th></tr></thead><tbody>${lines
    .map((l, i) => `<tr><td><span class="code">${l.pos || (i + 1) * 10}</span></td><td>${esc(l.name)}<div class="cell-sub">${esc(l.code)}</div></td><td class="num">${num(l.qty)} ${esc(l.unit)}</td><td class="num">${extra ? extra.cell(l) : money(l.netTotal)}</td></tr>`)
    .join('')}</tbody></table>`;
}

const docLink = (type, no) => `<button class="link" type="button" data-act="doc" data-doc="${type}:${esc(no)}">${esc(no)}</button>`;

function orderHtml(o) {
  const m = getMessage(o.messageNo);
  const stateBtn = (label, ic, hint) => `<button class="btn btn-ghost" type="button" disabled title="${esc(hint)}">${icon(ic)}<span>${label}</span></button>`;
  let deliveryBtn;
  if (o.deliveryNo) deliveryBtn = '';
  else if (o.erpStatus !== 'transferred') deliveryBtn = stateBtn('Teslimat oluştur', 'truck', "Önce ERP aktarımı başarılı olmalı");
  else deliveryBtn = actionBtn({ perm: 'DELIVERY_CREATE', label: 'Teslimat oluştur', iconName: 'truck', attrs: `data-act="delivery" data-no="${esc(o.no)}"` });
  let invoiceBtn;
  if (o.invoiceNo) invoiceBtn = '';
  else if (!o.deliveryNo) invoiceBtn = stateBtn('Fatura oluştur', 'book', 'Önce teslimat oluşturulmalı');
  else invoiceBtn = actionBtn({ perm: 'INVOICE_CREATE', label: 'Fatura oluştur', iconName: 'book', attrs: `data-act="invoice" data-no="${esc(o.no)}"` });

  return (
    drawerHead(`Satış siparişi · ${o.no}`, o.customerName, orderBadges(o)) +
    `<div class="drawer-body">
      ${o.erpStatus === 'error' && m ? alertBox('danger', 'ERP aktarımı hatalı', `${esc(m.error)}<br><button class="link" type="button" data-act="doc" data-doc="message:${esc(m.no)}">Mesaj ${esc(m.no)}'i aç →</button>`) : ''}
      ${o.erpStatus === 'pending' ? alertBox('info', "ERP'ye aktarılıyor…", `Mesaj ${esc(o.messageNo)} işleniyor. Sonuç Aktarım Monitörü'ne düşer.`) : ''}
      ${dsec('ERP işlemleri', `<div class="drawer-actions">${deliveryBtn}${invoiceBtn}${o.deliveryNo && o.invoiceNo ? `<span class="cell-sub">Sipariş teslim edildi ve faturalandı.</span>` : ''}</div>`)}
      ${dsec('Belge akışı', flowHtml({ type: 'order', no: o.no }))}
      ${dsec(
        'Başlık',
        kv([
          ['Teklif referansı', docLink('quote', o.quoteNo)],
          ['Müşteri', `${esc(o.customer)} · ${esc(o.customerName)}${o.erpCustomer ? ` · ERP <span class="code">${esc(o.erpCustomer)}</span>` : ''}`],
          ['Müşteri sipariş no', `<span class="code">${esc(o.customerPo)}</span>`],
          ['Sipariş tarihi', date(o.date)],
          ['İstenen teslim tarihi', date(o.requestedDate)],
          ['Teslimat deposu', `<span class="code">${esc(o.plant)}</span> ${esc(whName(o.plant))}`],
          ['Ödeme koşulu', `<span class="code">${esc(o.paymentTerm)}</span> ${esc(termName(o.paymentTerm))}`],
          ['Satış alanı', `<span class="code">${esc(o.salesArea || '')}</span> ${esc(channelName(o.channel))}`],
          ['Oluşturan', esc(userLabel(o.createdBy))],
          o.note ? ['Not', esc(o.note)] : null,
        ])
      )}
      ${dsec(`Kalemler (${o.lines.length})`, linesTable(o.lines))}
      ${dsec('Toplamlar', kv([['Net tutar', `<strong>${money(o.totals.net)}</strong>`], ['KDV', money(o.totals.vat)], ['Genel toplam', `<strong>${money(o.totals.gross)}</strong>`]]))}
      ${dsec('Durum geçmişi', historyHtml(o.history))}
    </div>`
  );
}

function messageHtml(m) {
  const o = getOrder(m.orderNo);
  const kinds = m.errorKinds || [];
  const fixes = [];
  if (kinds.includes('customer')) fixes.push(`Key user müşteri ana verisini ERP'de açar: <button class="link" type="button" data-act="customer" data-id="${esc(o?.customer)}">${esc(o?.customerName)} kaydını aç</button> → "ERP'de müşteri aç".`);
  if (kinds.includes('blocked')) fixes.push('Muhasebe blokajı kaldırmadan sipariş kabul edilmez.');
  if (kinds.includes('stock')) fixes.push('Teslimat deposunu stoğu olan depoyla değiştir (aşağıda) veya stok girişini bekle.');

  const plantForm = kinds.includes('stock') && o && m.status === 'error'
    ? `<div class="md-form">
        <label class="field"><span class="field-label">Siparişin teslimat deposu</span>
          <select class="select" data-plant ${can('INTERFACE_REPROCESS') ? '' : 'disabled'}>${company().organization.warehouses
            .map((w) => {
              const ok = o.lines.every((l) => (productOf(l.code)?.stock?.[w.code] ?? 0) >= l.qty);
              return `<option value="${esc(w.code)}" ${w.code === o.plant ? 'selected' : ''}>${esc(w.code)} · ${esc(w.name)}${ok ? ' · stok yeterli' : ' · stok yetersiz'}</option>`;
            })
            .join('')}</select></label>
        <div class="drawer-actions">${actionBtn({ perm: 'INTERFACE_REPROCESS', label: 'Depoyu değiştir', iconName: 'edit', cls: 'btn-ghost', attrs: `data-act="plant" data-no="${esc(o.no)}"` })}</div>
      </div>`
    : '';

  return (
    drawerHead(`Aktarım mesajı · ${m.no}`, `${m.type} · Sipariş ${m.orderNo}`, st(MSG_STATUS, m.status) + badge(m.direction, 'neutral') + badge(`${m.attempts.length} deneme`, 'neutral')) +
    `<div class="drawer-body">
      ${m.status === 'error' ? alertBox('danger', 'Hata', esc(m.error).replace(/\n/g, '<br>')) : ''}
      ${m.status === 'pending' ? alertBox('info', 'İşleniyor…', 'Mesaj ERP tarafında işlenmeyi bekliyor.') : ''}
      ${m.status === 'success' ? alertBox('success', 'Başarılı', `Sipariş ERP'de ${esc(o?.erpCustomer || '')} müşterisi için oluşturuldu.`) : ''}
      ${m.status === 'error' ? dsec('Çözüm', `<ul class="bullets">${fixes.map((f) => `<li>${f}</li>`).join('')}</ul>${plantForm}
        <div class="drawer-actions">${actionBtn({ perm: 'INTERFACE_REPROCESS', label: 'Yeniden işle', iconName: 'play', attrs: `data-act="reprocess" data-no="${esc(m.no)}"` })}</div>`) : ''}
      ${dsec('Mesaj', kv([
        ['Mesaj no', `<span class="code">${esc(m.no)}</span>`],
        ['Tür / yön', `${esc(m.type)} · ${esc(m.direction)}`],
        ['Sipariş', o ? docLink('order', o.no) : esc(m.orderNo)],
        ['Oluşturma', datetime(m.createdAt)],
      ]))}
      ${dsec('İçerik (JSON)', `<pre class="json">${jsonHtml(m.payload)}</pre>`)}
      ${dsec('İşleme denemeleri', m.attempts.length ? `<ol class="timeline">${[...m.attempts].reverse().map((a) => `<li><span class="tl-dot tone-${a.result === 'success' ? 'success' : 'danger'}">${icon(a.result === 'success' ? 'check' : 'alert')}</span><div class="tl-body"><div><strong>${esc(actorLabel(a.by))}</strong> <span>${a.result === 'success' ? 'Başarılı' : 'Hatalı'}</span></div><span class="cell-sub">${datetime(a.at)}</span>${a.error ? `<p class="tl-note">${esc(a.error)}</p>` : ''}</div></li>`).join('')}</ol>` : '<p class="cell-sub">Henüz işlenmedi.</p>')}
    </div>`
  );
}

// Basit JSON vurgulama
function jsonHtml(obj) {
  return esc(JSON.stringify(obj, null, 2))
    .replace(/(&quot;[^&]*?&quot;)(\s*:)/g, '<span class="j-key">$1</span>$2')
    .replace(/:\s(&quot;.*?&quot;)/g, ': <span class="j-str">$1</span>')
    .replace(/:\s(-?\d+(?:\.\d+)?)/g, ': <span class="j-num">$1</span>')
    .replace(/:\s(null|true|false)/g, ': <span class="j-lit">$1</span>');
}

function deliveryHtml(d) {
  return (
    drawerHead(`Teslimat · ${d.no}`, d.customerName, badge('Mal çıkışı yapıldı', 'success') + badge(`${d.plant} ${whName(d.plant)}`, 'neutral')) +
    `<div class="drawer-body">
      ${dsec('Belge akışı', flowHtml({ type: 'delivery', no: d.no }))}
      ${dsec('Başlık', kv([['Sipariş', docLink('order', d.orderNo)], ['Teslimat tarihi', date(d.date)], ['Depo', `<span class="code">${esc(d.plant)}</span> ${esc(whName(d.plant))}`], ['Oluşturan', esc(userLabel(d.createdBy))]]))}
      ${dsec('Stok hareketi', linesTable(d.lines, { head: 'Stok (önce → sonra)', cell: (l) => `${num(l.before)} → <strong>${num(l.after)}</strong>` }))}
      ${(() => {
        const o = getOrder(d.orderNo);
        return o && !o.invoiceNo ? `<div class="drawer-actions">${actionBtn({ perm: 'INVOICE_CREATE', label: 'Fatura oluştur', iconName: 'book', attrs: `data-act="invoice" data-no="${esc(o.no)}"` })}</div>` : '';
      })()}
    </div>`
  );
}

function invoiceHtml(inv) {
  return (
    drawerHead(`Fatura · ${inv.no}`, inv.customerName, badge(`Vade ${date(inv.dueDate)}`, 'neutral') + badge(termName(inv.paymentTerm), 'neutral')) +
    `<div class="drawer-body">
      ${alertBox('info', 'Müşteri açık bakiyesi güncellendi', `${money(inv.balanceBefore)} → <strong>${money(inv.balanceAfter)}</strong> (+${money(inv.gross)})`)}
      ${dsec('Belge akışı', flowHtml({ type: 'invoice', no: inv.no }))}
      ${dsec('Başlık', kv([
        ['Sipariş', docLink('order', inv.orderNo)],
        ['Teslimat', docLink('delivery', inv.deliveryNo)],
        ['ERP müşteri', `<span class="code">${esc(inv.erpCustomer || inv.customer)}</span> ${esc(inv.customerName)}`],
        ['Fatura tarihi', date(inv.date)],
        ['Vade tarihi', date(inv.dueDate)],
        ['Ödeme koşulu', `<span class="code">${esc(inv.paymentTerm)}</span> ${esc(termName(inv.paymentTerm))}`],
        ['Kesen', esc(userLabel(inv.createdBy))],
      ]))}
      ${dsec('Tutarlar', kv([['Net', money(inv.net)], ['KDV', money(inv.vat)], ['Toplam', `<strong>${money(inv.gross)}</strong>`]]))}
    </div>`
  );
}

// ---------- panel yönlendirme ----------
export function openDoc(type, no) {
  if (type === 'quote') {
    current = { type, no };
    return openQuote(no);
  }
  const rec = type === 'order' ? getOrder(no) : type === 'message' ? getMessage(no) : type === 'delivery' ? getDelivery(no) : type === 'invoice' ? getInvoice(no) : null;
  if (!rec) return toast('Belge bulunamadı');
  current = { type, no };
  const html = type === 'order' ? orderHtml(rec) : type === 'message' ? messageHtml(rec) : type === 'delivery' ? deliveryHtml(rec) : invoiceHtml(rec);
  openDrawer(html, onAction);
}

export function openDocRef(ref) {
  const [type, no] = String(ref).split(':');
  openDoc(type, no);
}

function onAction(el) {
  const act = el.dataset.act;
  if (act === 'doc') return openDocRef(el.dataset.doc);
  if (act === 'customer') return openDetail('customer', el.dataset.id);
  const no = el.dataset.no;
  if (act === 'delivery') {
    const r = createDelivery(no);
    if (r.error) return toast(r.error);
    toast(`Teslimat ${r.delivery.no} oluşturuldu · stok düştü`);
    return openDoc('order', no);
  }
  if (act === 'invoice') {
    const r = createInvoice(no);
    if (r.error) return toast(r.error);
    toast(`Fatura ${r.invoice.no} kesildi · ${money(r.invoice.gross)}`);
    return openDoc('order', no);
  }
  if (act === 'reprocess') {
    const r = reprocess(no);
    if (r.error) return toast(r.error);
    return openDoc('message', no);
  }
  if (act === 'plant') {
    const plant = el.closest('.drawer-inner').querySelector('[data-plant]')?.value;
    if (!changeOrderPlant(no, plant)) return toast('Depo değiştirilemedi');
    toast(`Sipariş ${no}: teslimat deposu ${plant} oldu. Şimdi yeniden işle.`);
    return openDoc('message', current.no);
  }
}

// ---------- siparişe dönüştürme formu ----------
export function openOrderForm(qno) {
  const q = getQuote(qno);
  if (!q) return toast('Teklif bulunamadı');
  const existing = orderForQuote(qno);
  if (existing) return openDoc('order', existing.no);
  const D = company();
  const minDate = sysDate();
  const html =
    drawerHead(`Teklif ${q.no} → Satış siparişi`, q.customerName, quoteStatusBadge(q) + badge(money(q.totals.net), 'neutral')) +
    `<div class="drawer-body">
      <p class="cell-sub mt-sm">Onaylanmış teklifin kalemleri ve fiyatları siparişe aynen taşınır. Kaydettiğinde sipariş ERP'ye (S/4HANA) aktarım için mesaj olarak gönderilir.</p>
      <div class="form-grid order-form">
        <div class="field"><div class="field-label"><span>Teklif referansı</span></div><div class="ro"><span class="code">${esc(q.no)}</span></div></div>
        <label class="field"><span class="field-label">Müşteri sipariş no <span class="req">*</span></span><input class="input" data-f="customerPo" maxlength="30" placeholder="Ör. ODM-2026-001"></label>
        <label class="field"><span class="field-label">İstenen teslim tarihi <span class="req">*</span></span><input class="input" type="date" data-f="requestedDate" min="${esc(minDate)}" value="${esc(addDays(minDate, 7))}"></label>
        <label class="field"><span class="field-label">Teslimat deposu</span><select class="select" data-f="plant">${D.organization.warehouses
          .map((w) => `<option value="${esc(w.code)}" ${w.code === q.plant ? 'selected' : ''}>${esc(w.code)} · ${esc(w.name)}</option>`)
          .join('')}</select></label>
        <label class="field span-2"><span class="field-label">Not</span><input class="input" data-f="note" maxlength="80" placeholder="Ör. Rampa saat 08:00–12:00"></label>
      </div>
      ${dsec(`Kalemler (${q.lines.length})`, linesTable(q.lines))}
      <div class="drawer-actions">
        ${actionBtn({ perm: 'ORDER_CREATE', label: 'Siparişi kaydet', iconName: 'cart', attrs: `data-act="order-save" data-no="${esc(q.no)}"` })}
        <button class="btn btn-ghost" type="button" data-act="doc" data-doc="quote:${esc(q.no)}">${icon('back')}<span>Teklife dön</span></button>
      </div>
      <p class="cell-sub" data-order-err></p>
    </div>`;
  current = { type: 'order-form', no: qno };
  openDrawer(html, (el) => {
    if (el.dataset.act === 'doc') return openDocRef(el.dataset.doc);
    if (el.dataset.act !== 'order-save') return;
    const root = el.closest('.drawer-inner');
    const v = (k) => root.querySelector(`[data-f="${k}"]`)?.value || '';
    const r = createOrder(qno, { customerPo: v('customerPo'), requestedDate: v('requestedDate'), plant: v('plant'), note: v('note') });
    if (r.error) {
      root.querySelector('[data-order-err]').textContent = r.error;
      return toast(r.error);
    }
    toast(`Sipariş ${r.order.no} oluşturuldu · ERP'ye aktarılıyor`);
    openDoc('order', r.order.no);
  });
}

export { closeDrawer };
