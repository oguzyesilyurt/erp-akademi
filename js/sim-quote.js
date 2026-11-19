// Simülasyon: "Teklif Oluştur" (ERP teklif belgesi hissinde)
// Yapılandırma: data/tracks/<id>.json -> sections.simulation (type: "quote")
import { icon } from './icons.js';
import { href, stripQuery } from './router.js';
import { progress, quotes } from './store.js';
import { create as createQuote, visible, openQuote, statusBadge, activeStep, get as getQuote } from './quotes.js';
import { can, actionBtn, lockReason, currentRole, userLabel, openLogin, approverFor } from './auth.js';
import { flag } from './release.js';
import { visibleOrders, orderBadges, openDoc } from './erp.js';
import {
  esc, money2 as money, num, date, pct1, round2, badge, progressBar, kv, dsec, alertBox,
  helpBtn, toast, openDrawer, closeDrawer, drawerHead, emptyState,
} from './ui.js';
import {
  loadCompany, company, partnerOf, productOf, creditStatus, priceFor, channelName, divisionName,
  termName, userOf, unitName, stockTotal, segBadge, utilBar, openDetail, isCash,
} from './company.js';

// ---------- durum (sekme değişse de taslak korunur) ----------
const newDraft = () => ({ customer: '', contact: '', reference: '', plant: '', validTo: '', items: [], open: [], scenario: null, opportunity: null, addCode: '', addQty: '' });
const draft = newDraft();
let mode = 'form'; // 'form' | 'list' | 'orders'
let lastSaved = null;
let ctx = null;

const cfg = () => ctx.content;
// v1.1 hatası (BUG_APPROVAL_THRESHOLD): net tutar onay eşiği 50.000 yerine 500.000
const rules = () => {
  const r = { maxDiscountPct: 12, maxNet: 50000, firstQuoteNo: 20000001, validityDays: 30, ...(cfg().rules || {}) };
  if (flag('BUG_APPROVAL_THRESHOLD')) r.maxNet = 500000;
  return r;
};
const sysDate = () => cfg().systemDate || company().asOf;
const H = (key) => cfg().help?.[key] || '';

function addDays(iso, n) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function resetDraft() {
  Object.assign(draft, newDraft());
}

function setCustomer(id) {
  const c = partnerOf(id);
  draft.customer = c ? c.id : '';
  draft.plant = c?.plant || company().organization.warehouses[0].code;
  draft.contact = c?.contacts?.[0]?.name || '';
  if (!draft.validTo) draft.validTo = addDays(sysDate(), rules().validityDays);
}

function addItem(code, qty) {
  if (!productOf(code) || !(qty > 0)) return false;
  const i = draft.items.findIndex((x) => x.code === code);
  if (i >= 0) {
    draft.items[i].qty += qty;
    draft.open = [i];
  } else {
    draft.items.push({ code, qty });
    draft.open = [draft.items.length - 1];
  }
  return true;
}

// Taslakta müşteri seçili mi? (sayfa yenilendikten sonra test verisini yeniden yüklemek için)
export const hasDraft = () => !!draft.customer || draft.items.length > 0;

// Test koşumu gibi dış modüllerin simülasyonu belirli veriyle başlatması için
// preset: { customer, contact?, reference?, items: [{ code, qty }], opportunity?: { id, name } }
// simCtx: simülasyon henüz hiç çizilmediyse kurallar (sistem tarihi, geçerlilik) için gereken bağlam
export function applyPreset(preset, simCtx = null) {
  if (simCtx) ctx = simCtx;
  if (!preset?.customer || !ctx) return;
  resetDraft();
  setCustomer(preset.customer);
  const c = partnerOf(draft.customer);
  if (preset.contact && c?.contacts.some((k) => k.name === preset.contact)) draft.contact = preset.contact;
  draft.reference = preset.reference || '';
  draft.opportunity = preset.opportunity || null;
  (preset.items || []).forEach((it) => addItem(it.code, it.qty));
  draft.open = [];
  mode = 'form';
}

function applyScenario(id) {
  const sc = ctx.data?.sections?.scenarios?.items?.find((s) => s.id === id);
  if (!sc?.simulation) return;
  resetDraft();
  setCustomer(sc.simulation.customer || sc.customer);
  const c = partnerOf(draft.customer);
  if (sc.simulation.contact && c?.contacts.some((k) => k.name === sc.simulation.contact)) draft.contact = sc.simulation.contact;
  draft.reference = sc.simulation.reference || '';
  (sc.simulation.items || []).forEach((it) => addItem(it.code, it.qty));
  draft.open = [];
  draft.scenario = { id: sc.id, title: sc.title };
  mode = 'form';
  toast(`Senaryo yüklendi: ${sc.title}`);
}

// ---------- hesaplama ----------
function compute() {
  const R = rules();
  const cust = draft.customer ? partnerOf(draft.customer) : null;
  const lines = [];
  const totals = { list: 0, k007: 0, zkmp: 0, net: 0, vat: 0, gross: 0, vatByRate: {} };

  if (cust) {
    draft.items.forEach((it, i) => {
      const p = productOf(it.code);
      if (!p) return;
      const qty = it.qty;
      const r = priceFor(it.code, cust.segment, cust.channel, qty);
      const listTotal = round2(r.list * qty);
      const k007 = round2(-(r.steps.find((s) => s.cond === 'K007')?.amount || 0) * qty);
      const netTotal = round2(r.net * qty);
      const zkmp = round2(listTotal - k007 - netTotal);
      const vatTotal = round2((netTotal * r.vatRate) / 100);
      const stockAt = p.stock[draft.plant] ?? 0;
      const stockOther = stockTotal(p) - stockAt;

      const notes = [];
      if (qty > stockAt) {
        notes.push({
          tone: 'warning',
          text: `Stok yetersiz (${esc(draft.plant)} · ${esc(warehouseName(draft.plant))}): ${num(stockAt)} ${esc(p.unit)} var, ${num(qty - stockAt)} ${esc(p.unit)} eksik.${stockOther > 0 ? ` Diğer depoda ${num(stockOther)} ${esc(p.unit)} mevcut; teslimat deposunu değiştirebilir veya ayrı sevk planlayabilirsin.` : ' Diğer depoda da stok yok; satın alma ile teslim tarihi netleştirilmeli.'}`,
        });
      }
      if (r.camp && !r.campApplied) {
        notes.push({ tone: 'info', text: `${esc(r.camp.name)}: en az ${r.camp.minQty} ${esc(p.unit)} gerekir. ${r.camp.minQty - qty} ${esc(p.unit)} daha eklersen %${r.camp.discount} ek iskonto uygulanır.` });
      }
      if (r.camp && r.campApplied && draft.validTo && draft.validTo > r.camp.validTo) {
        notes.push({ tone: 'warning', text: `Teklif geçerliliği (${date(draft.validTo)}) kampanya bitişinden (${date(r.camp.validTo)}) sonra. Geçerlilik tarihini kampanya süresi içine çek.` });
      }

      lines.push({ i, pos: (i + 1) * 10, p, qty, r, listTotal, k007, zkmp, netTotal, vatTotal, gross: round2(netTotal + vatTotal), stockAt, stockOther, short: qty > stockAt, notes });
      totals.list += listTotal;
      totals.k007 += k007;
      totals.zkmp += zkmp;
      totals.net += netTotal;
      totals.vat += vatTotal;
      totals.vatByRate[r.vatRate] = round2((totals.vatByRate[r.vatRate] || 0) + vatTotal);
    });
  }
  for (const k of ['list', 'k007', 'zkmp', 'net', 'vat']) totals[k] = round2(totals[k]);
  totals.gross = round2(totals.net + totals.vat);
  totals.discountPct = totals.list > 0 ? ((totals.list - totals.net) / totals.list) * 100 : 0;

  const cs = cust ? creditStatus(cust) : null;
  const errors = [];
  if (!cust) errors.push('Müşteri seçilmedi.');
  if (cust?.blocked) errors.push(`Müşteri bloke (${cust.blockReason}). Bloke müşteriye teklif kaydedilemez.`);
  if (cust && !lines.length) errors.push('En az bir kalem ekle.');
  if (!draft.validTo) errors.push('Geçerlilik tarihi gir.');
  else if (draft.validTo < sysDate()) errors.push('Geçerlilik tarihi teklif tarihinden önce olamaz.');

  const approvals = [];
  const mReasons = [];
  if (totals.discountPct > R.maxDiscountPct + 1e-9) mReasons.push(`Toplam iskonto ${pct1(totals.discountPct)}, eşik %${R.maxDiscountPct}`);
  if (totals.net > R.maxNet) mReasons.push(`Net tutar ${money(totals.net)}, eşik ${money(R.maxNet)}`);
  if (mReasons.length) approvals.push({ key: 'manager', label: 'Müdür onayı gerekli', approver: approverOf('QUOTE_APPROVE'), reasons: mReasons });

  if (cust && !cust.prospect && !isCash(cust) && !cust.blocked && totals.gross > 0) {
    const exposure = round2(cust.openBalance + totals.gross);
    if (exposure > cust.creditLimit) {
      approvals.push({
        key: 'credit',
        label: 'Kredi onayı gerekli',
        approver: approverOf('CREDIT_RELEASE'),
        reasons: [`Açık bakiye + teklif (KDV dahil) = ${money(exposure)}, kredi limiti ${money(cust.creditLimit)}`],
      });
    }
  }

  return { cust, cs, lines, totals, errors, approvals, canSave: errors.length === 0 };
}

// Onaylayan: rol adına değil yetkiye göre bulunur (kullanıcı yönetiminden etkilenir)
function approverOf(perm) {
  return approverFor(perm);
}

function warehouseName(code) {
  const w = company().organization.warehouses.find((x) => x.code === code);
  return w ? w.name : code;
}

function statusOf(c) {
  if (!c.cust) return { label: 'Taslak', tone: 'neutral' };
  if (!c.canSave) return { label: c.cust.blocked ? 'Kaydedilemez' : 'Eksik bilgi', tone: c.cust.blocked ? 'danger-solid' : 'neutral' };
  if (c.approvals.length) return { label: 'Onay gerekli', tone: 'warning' };
  return { label: 'Kaydedilmeye hazır', tone: 'success' };
}

// ---------- şablon parçaları ----------
const field = (key, label, control, { span = 1, required = false, helpKey = key } = {}) => `
  <div class="field${span > 1 ? ` span-${span}` : ''}">
    <div class="field-label"><label for="q-${key}">${esc(label)}${required ? ' <span class="req" aria-hidden="true">*</span>' : ''}</label>${helpBtn(H(helpKey), label)}</div>
    ${control}
  </div>`;

const ro = (key, html) => `<div class="ro" id="q-${key}">${html}</div>`;

function customerSelect() {
  const D = company();
  const opt = (c) => {
    const s = creditStatus(c);
    const flag = s.key === 'blocked' ? ' · BLOKE' : s.key === 'over' ? ' · limit aşımı' : '';
    return `<option value="${esc(c.id)}" ${c.id === draft.customer ? 'selected' : ''}>${esc(c.id)} · ${esc(c.name)}${flag}</option>`;
  };
  return `<select class="select" id="q-customer" data-field="customer" data-fk="customer">
    <option value="">Müşteri seç…</option>
    <optgroup label="Müşteriler">${D.customers.map(opt).join('')}</optgroup>
    ${(D.prospects || []).length ? `<optgroup label="Aday müşteriler">${D.prospects.map(opt).join('')}</optgroup>` : ''}
  </select>`;
}

function headerFields(c) {
  const D = company();
  const cust = c.cust;
  const dis = cust ? '' : 'disabled';
  const salesArea = cust
    ? `<span class="code">${esc(D.organization.salesOrg.code)}</span> / <span class="code">${esc(cust.channel)}</span> ${esc(channelName(cust.channel))} / <span class="code">${D.organization.divisions.map((d) => d.code).join('-')}</span>`
    : '<span class="muted">Müşteriden gelir</span>';
  const rep = cust ? userOf(cust.salesRep) : null;

  return `<div class="form-grid">
    ${field('customer', 'Müşteri', customerSelect(), { span: 2, required: true })}
    ${field('salesArea', 'Satış alanı', ro('salesArea', salesArea))}
    ${field('quoteDate', 'Teklif tarihi', ro('quoteDate', `${date(sysDate())} <span class="cell-sub inline">sistem tarihi</span>`))}
    ${field('validTo', 'Geçerlilik tarihi', `<input class="input" type="date" id="q-validTo" data-field="validTo" data-fk="validTo" value="${esc(draft.validTo)}" min="${esc(sysDate())}" ${dis}>`, { required: true })}
    ${field('paymentTerm', 'Ödeme koşulu', ro('paymentTerm', cust ? `<span class="code">${esc(cust.paymentTerm)}</span> ${esc(termName(cust.paymentTerm))}` : '<span class="muted">Müşteriden gelir</span>'))}
    ${field('plant', 'Teslimat deposu', `<select class="select" id="q-plant" data-field="plant" data-fk="plant" ${dis}>${D.organization.warehouses
      .map((w) => `<option value="${esc(w.code)}" ${w.code === draft.plant ? 'selected' : ''}>${esc(w.code)} · ${esc(w.name)}</option>`)
      .join('')}</select>`)}
    ${field('contact', 'İlgili kişi', `<select class="select" id="q-contact" data-field="contact" data-fk="contact" ${dis}>${(cust?.contacts || [])
      .map((k) => `<option value="${esc(k.name)}" ${k.name === draft.contact ? 'selected' : ''}>${esc(k.name)} · ${esc(k.role)}</option>`)
      .join('') || '<option value="">—</option>'}</select>`)}
    ${field('salesRep', 'Satış temsilcisi', ro('salesRep', rep ? esc(rep.name) : '<span class="muted">Müşteriden gelir</span>'))}
    ${field('reference', 'Müşteri referansı', `<input class="input" type="text" id="q-reference" data-field="reference" data-fk="reference" value="${esc(draft.reference)}" maxlength="40" placeholder="Ör. talep no" ${dis}>`)}
  </div>`;
}

function customerStrip(c) {
  const cust = c.cust;
  if (!cust) return '';
  const s = c.cs;
  let alerts = '';
  if (cust.blocked) {
    const by = userOf(cust.blockedBy);
    alerts += alertBox('danger', 'Müşteri bloke: teklif kaydedilemez', `${esc(cust.blockReason)}. ${date(cust.blockedSince)} tarihinde ${esc(by?.name || 'muhasebe')} tarafından bloke edildi. Blokaj kaldırılmadan yeni teklif ve sipariş oluşturulamaz.`);
  } else if (s.key === 'over') {
    alerts += alertBox('danger', 'Kredi limiti aşılmış', `Açık bakiye ${money(cust.openBalance)}, limit ${money(cust.creditLimit)}${cust.overdue ? `, vadesi geçmiş ${money(cust.overdue)}` : ''}. Teklif kaydedilebilir ancak siparişe dönüşte kredi kontrolüne takılır; muhasebeyle görüş.`);
  } else if (s.key === 'risk') {
    alerts += alertBox('warning', 'Kredi limitine yaklaşıyor', `Kullanım ${pct1(s.ratio * 100)}${cust.overdue ? `, vadesi geçmiş ${money(cust.overdue)}` : ''}. Büyük tutarlı teklifler kredi onayı gerektirebilir.`);
  } else if (s.key === 'cash') {
    alerts += alertBox('info', 'Peşin çalışan müşteri', `ERP müşteri no ${esc(cust.erpNumber || cust.id)}. Kredi limiti tanımlı değil; ödeme koşulu Z000 (peşin), kredi kontrolü uygulanmaz.`);
  } else if (s.key === 'prospect') {
    alerts += alertBox('info', 'Aday müşteri', `${esc(cust.note || 'Kredi limiti tanımlı değil.')} Teklif kabul edilirse siparişten önce müşteri ana verisi açılmalıdır.`);
  }

  return `<div class="cust-strip">
    <div class="cust-strip-main">
      <button class="link" type="button" data-act="open-customer">${esc(cust.name)}</button>
      <div class="badges">${badge(s.label, s.tone)}${segBadge(cust.segment)}${badge(channelName(cust.channel), 'neutral')}</div>
    </div>
    ${cust.prospect || s.key === 'cash' ? '' : `<div class="cust-credit">
      ${utilBar(s)}
      <span class="cell-sub">Limit ${money(cust.creditLimit)} · Bakiye ${money(cust.openBalance)} · Kullanılabilir <strong class="${cust.creditLimit - cust.openBalance < 0 ? 'neg' : ''}">${money(cust.creditLimit - cust.openBalance)}</strong></span>
    </div>`}
  </div>${alerts}`;
}

function productOptions() {
  const D = company();
  return D.organization.divisions
    .map(
      (d) => `<optgroup label="${esc(d.name)}">${D.products
        .filter((p) => p.division === d.code)
        .map((p) => `<option value="${esc(p.code)}" ${p.code === draft.addCode ? 'selected' : ''}>${esc(p.code)} · ${esc(p.name)} (${esc(p.unit)})</option>`)
        .join('')}</optgroup>`
    )
    .join('');
}

function condTable(l) {
  const r = l.r;
  const row = (cond, label, rate, unit, total, cls = '') => `<tr class="${cls}">
    <td>${cond ? `<span class="code">${esc(cond)}</span>${helpBtn(H(cond), cond)}` : ''}</td>
    <td>${label}</td>
    <td class="num">${rate}</td>
    <td class="num">${unit}</td>
    <td class="num">${total}</td>
  </tr>`;
  const k = r.steps.find((s) => s.cond === 'K007');
  const z = r.steps.find((s) => s.cond === 'ZKMP');
  return `<table class="cond-table">
    <thead><tr><th>Koşul</th><th>Açıklama</th><th class="num">Oran</th><th class="num">Birim</th><th class="num">Tutar (× ${num(l.qty)})</th></tr></thead>
    <tbody>
      ${row('PR00', 'Liste fiyatı', '', money(r.list), money(l.listTotal))}
      ${row('K007', esc(k.label), `%${k.rate}`, money(k.amount), money(-l.k007))}
      ${z ? row('ZKMP', `${esc(z.label)}${r.campApplied ? '' : ` <span class="cell-sub inline">uygulanmadı · ${esc(z.note)}</span>`}`, r.campApplied ? `%${z.rate}` : '—', money(z.amount), money(-l.zkmp), r.campApplied ? '' : 'is-off') : ''}
      ${row('', 'Net', '', money(r.net), money(l.netTotal), 'total')}
      ${row('KDV', 'Katma değer vergisi', `%${r.vatRate}`, money(r.vat), money(l.vatTotal))}
      ${row('', 'KDV dahil', '', money(r.gross), money(l.gross), 'total')}
    </tbody>
  </table>`;
}

function itemsSection(c) {
  const cust = c.cust;
  const dis = cust && !cust.blocked ? '' : 'disabled';
  const rows = c.lines
    .map((l) => {
      const open = draft.open.includes(l.i);
      const stock = l.short ? badge(`Yetersiz · ${num(l.stockAt)}`, 'warning') : badge(`${num(l.stockAt)}`, 'success');
      return `
      <tr class="item-row${l.short ? ' has-warn' : ''}${open ? ' is-open' : ''}">
        <td class="pos">${l.pos}</td>
        <td>
          <div class="cell-main">${esc(l.p.name)}</div>
          <div class="cell-sub">${esc(l.p.code)} · ${esc(l.p.pack)}${l.r.camp ? ` · <span class="tag-camp${l.r.campApplied ? '' : ' off'}">${l.r.campApplied ? 'Kampanya' : 'Kampanya dışı'}</span>` : ''}</div>
        </td>
        <td><input class="input qty" type="number" inputmode="numeric" min="1" step="1" value="${l.qty}" data-qty="${l.i}" data-fk="qty-${l.p.code}" aria-label="${esc(l.p.name)} miktarı"></td>
        <td class="cq-b">${esc(l.p.unit)}</td>
        <td class="num cq-a">${money(l.r.list)}</td>
        <td class="num cq-c">${money(l.r.net)}</td>
        <td class="num"><strong>${money(l.netTotal)}</strong></td>
        <td class="cq-d">${stock}</td>
        <td class="row-actions">
          <button class="icon-btn sm" type="button" data-act="toggle" data-i="${l.i}" aria-expanded="${open}" aria-label="Fiyat adımlarını ${open ? 'gizle' : 'göster'}" title="Fiyat adımları">${icon('layers')}</button>
          <button class="icon-btn sm" type="button" data-act="remove" data-i="${l.i}" aria-label="Kalemi sil" title="Kalemi sil">${icon('close')}</button>
        </td>
      </tr>
      ${l.notes.length && !open ? `<tr class="note-row"><td></td><td colspan="8">${l.notes.map((n) => `<div class="line-note ${n.tone}">${icon(n.tone === 'info' ? 'help' : 'alert')}<span>${n.text}</span></div>`).join('')}</td></tr>` : ''}
      ${open ? `<tr class="cond-row"><td></td><td colspan="8">${condTable(l)}${l.notes.map((n) => `<div class="line-note ${n.tone}">${icon(n.tone === 'info' ? 'help' : 'alert')}<span>${n.text}</span></div>`).join('')}</td></tr>` : ''}`;
    })
    .join('');

  return `<section class="sim-sec card">
    <header class="sim-sec-head"><h3>Kalemler</h3><span class="cell-sub">${c.lines.length} kalem</span></header>
    <div class="add-row">
      <div class="field grow">
        <div class="field-label"><label for="q-addCode">Ürün</label>${helpBtn(H('product'), 'Ürün')}</div>
        <select class="select" id="q-addCode" data-fk="add-code" ${dis}><option value="">Ürün seç…</option>${productOptions()}</select>
      </div>
      <div class="field qty-field">
        <div class="field-label"><label for="q-addQty">Miktar</label>${helpBtn(H('qty'), 'Miktar')}</div>
        <input class="input" type="number" inputmode="numeric" id="q-addQty" data-fk="add-qty" min="1" step="1" value="${esc(draft.addQty)}" placeholder="0" ${dis}>
      </div>
      <button class="btn btn-primary add-btn" type="button" data-act="add" data-fk="add-btn" ${dis}>${icon('box')}<span>Ekle</span></button>
    </div>
    ${c.lines.length
      ? `<div class="table-wrap"><table class="table items">
          <thead><tr><th>Kalem</th><th>Ürün</th><th>Miktar</th><th class="cq-b">Birim</th><th class="num cq-a">Liste</th><th class="num cq-c">Net birim</th><th class="num">Net tutar</th><th class="cq-d">Stok</th><th><span class="sr-only">İşlemler</span></th></tr></thead>
          <tbody>${rows}</tbody>
        </table></div>`
      : `<div class="items-empty">${icon('inbox')}<span>${cust ? (cust.blocked ? 'Bloke müşteriye kalem eklenemez.' : 'Henüz kalem yok. Ürün ve miktar seçip ekle.') : 'Önce müşteri seç.'}</span></div>`}
  </section>`;
}

function summaryAside(c) {
  const R = rules();
  const t = c.totals;
  const scaleMax = Math.max(25, R.maxDiscountPct * 2);
  const over = t.discountPct > R.maxDiscountPct;
  const mgr = c.approvals.find((a) => a.key === 'manager');
  const cr = c.approvals.find((a) => a.key === 'credit');
  const line = (code, label, val, cls = '') => `<div class="sum-row ${cls}"><span>${code ? `<span class="code">${code}</span>` : ''}${label}</span><span>${val}</span></div>`;

  const check = (title, helpKey, a, okText, naText = null) => `
    <div class="check ${a ? 'is-warn' : naText ? 'is-na' : 'is-ok'}">
      <div class="check-head">${icon(a ? 'alert' : 'check')}<strong>${a ? esc(a.label) : esc(title)}</strong>${helpBtn(H(helpKey), title)}</div>
      ${a ? `<ul>${a.reasons.map((r) => `<li>${esc(r)}</li>`).join('')}</ul><span class="cell-sub">Onaylayan: ${esc(a.approver)}</span>` : `<span class="cell-sub">${esc(naText || okText)}</span>`}
    </div>`;

  return `<aside class="summary card">
    <h3>Fiyat özeti</h3>
    ${line('PR00', 'Liste tutarı', money(t.list))}
    ${line('K007', 'Segment iskontosu', t.k007 ? `−${money(t.k007)}` : money(0), 'minus')}
    ${line('ZKMP', 'Kampanya iskontosu', t.zkmp ? `−${money(t.zkmp)}` : money(0), 'minus')}
    ${line('', 'Net tutar', money(t.net), 'strong')}
    ${Object.keys(t.vatByRate).length
      ? Object.entries(t.vatByRate).sort((a, b) => a[0] - b[0]).map(([rate, v]) => line('KDV', ` %${rate}`, money(v))).join('')
      : line('KDV', '', money(0))}
    <div class="sum-total"><span>Genel toplam</span><strong>${money(t.gross)}</strong></div>

    <div class="disc">
      <div class="disc-head"><span>Toplam iskonto ${helpBtn(H('discount'), 'Toplam iskonto')}</span><strong class="${over ? 'neg' : ''}">${pct1(t.discountPct)}</strong></div>
      <div class="disc-bar">
        ${progressBar((t.discountPct / scaleMax) * 100, over ? 'var(--tone-warning)' : 'var(--tone-success)')}
        <span class="disc-mark" style="left:${(R.maxDiscountPct / scaleMax) * 100}%" title="Onay eşiği %${R.maxDiscountPct}"></span>
      </div>
      <span class="cell-sub">Onay eşiği %${R.maxDiscountPct} · net ${money(R.maxNet)}</span>
    </div>

    <div class="checks">
      ${check('Müdür onayı gerekmiyor', 'approval', mgr, 'İskonto ve tutar eşiklerin altında.', c.lines.length ? null : 'Kalem eklenince kontrol edilir.')}
      ${check('Kredi kontrolü uygun', 'credit', cr, 'Açık bakiye + teklif kredi limiti içinde.', !c.cust ? 'Müşteri seçilince kontrol edilir.' : c.cust.prospect || isCash(c.cust) ? 'Peşin çalışılır (Z000), kredi kontrolü yok.' : c.cust.blocked ? 'Müşteri bloke.' : !c.lines.length ? 'Kalem eklenince kontrol edilir.' : null)}
    </div>

    ${c.errors.length && c.cust ? `<ul class="errors">${c.errors.map((e) => `<li>${icon('alert')}<span>${esc(e)}</span></li>`).join('')}</ul>` : ''}
    ${!can('QUOTE_CREATE') ? `<p class="lock-note">${icon('lock')}<span>${esc(lockReason('QUOTE_CREATE'))}</span></p>` : ''}
    ${actionBtn({ perm: 'QUOTE_CREATE', label: c.approvals.length ? 'Kaydet ve onaya gönder' : 'Teklifi kaydet', iconName: c.approvals.length ? 'send' : 'check', cls: 'btn-primary btn-block', attrs: `data-act="save" data-fk="save" ${c.canSave ? '' : 'disabled'}` })}
    ${actionBtn({ perm: 'QUOTE_CREATE', label: 'Taslak olarak kaydet', iconName: 'edit', cls: 'btn-ghost btn-block', attrs: `data-act="save-draft" ${c.canSave ? '' : 'disabled'}` })}
  </aside>`;
}

function formView() {
  const c = compute();
  const st = statusOf(c);
  const nextNo = quotes.peekNo(rules().firstQuoteNo);
  const sc = draft.scenario;

  const role = currentRole();
  return `
    ${!can('QUOTE_CREATE') ? `<div class="role-banner">${icon('lock')}<span>Oturumdaki rol <strong>${esc(role?.name || '—')}</strong> teklif oluşturamaz. Formu inceleyip fiyatları hesaplayabilirsin; kaydetmek için Satış Temsilcisi ile oturum aç.</span><button class="btn btn-ghost" type="button" data-act="login">${icon('user')}<span>Oturumu değiştir</span></button></div>` : ''}
    ${sc ? `<div class="scenario-banner">${icon('route')}<span>Senaryo: <strong>${esc(sc.title)}</strong></span>
      <a class="link small" href="${href('track', { id: ctx.track.id, section: 'scenarios', sub: sc.id })}">Adımlara dön</a>
      <button class="icon-btn sm" type="button" data-act="drop-scenario" aria-label="Senaryo bağlantısını kaldır">${icon('close')}</button></div>` : ''}
    ${draft.opportunity ? `<div class="scenario-banner">${icon('cloud')}<span>C4C fırsatı: <strong>${esc(draft.opportunity.id)}</strong> ${esc(draft.opportunity.name || '')} · teklif onaylanınca fırsat güncellenir</span>
      <a class="link small" href="#/track/sap-c4c/simulation?opp=${encodeURIComponent(draft.opportunity.id)}">Fırsata dön</a>
      <button class="icon-btn sm" type="button" data-act="drop-opp" aria-label="Fırsat bağlantısını kaldır">${icon('close')}</button></div>` : ''}
    <div class="docbar card">
      <div class="docbar-title">
        <span class="doc-type">${icon('tag')}</span>
        <div><h2>${esc(cfg().title || 'Teklif Oluştur')}</h2><span class="cell-sub">Teklif no: <span class="code">${esc(nextNo)}</span> (kayıtta atanır)</span></div>
      </div>
      <div class="docbar-side">
        ${badge(st.label, st.tone)}
        <button class="btn btn-ghost" type="button" data-act="clear">${icon('close')}<span>Temizle</span></button>
      </div>
    </div>
    <div class="sim-grid">
      <div class="sim-main">
        <section class="sim-sec card">
          <header class="sim-sec-head"><h3>Başlık verileri</h3></header>
          ${headerFields(c)}
          ${customerStrip(c)}
        </section>
        ${itemsSection(c)}
      </div>
      ${summaryAside(c)}
    </div>`;
}

function listView() {
  const list = visible();
  const all = can('QUOTE_VIEW_ALL');
  if (!can('QUOTE_VIEW_ALL') && !can('QUOTE_VIEW_OWN')) {
    return `<div class="card">${emptyState('lock', 'Teklifleri görme yetkin yok', lockReason('QUOTE_VIEW_OWN'))}</div>`;
  }
  if (!list.length) {
    return `<div class="card">${emptyState('inbox', 'Henüz teklif yok', all ? 'Şirkette kaydedilmiş teklif yok.' : 'Kaydettiğin teklifler burada listelenir.', can('QUOTE_CREATE') ? `<button class="btn btn-primary" type="button" data-mode="form">${icon('tag')}<span>Yeni teklif oluştur</span></button>` : '')}</div>`;
  }
  return `<div class="card table-card">
    <div class="table-wrap"><table class="table">
      <thead><tr><th>Teklif no</th><th>Müşteri</th><th class="hide-md">Oluşturan</th><th class="hide-sm">Tarih</th><th class="num">Net</th><th>Durum</th></tr></thead>
      <tbody>${list
        .map(
          (q) => `<tr data-quote="${esc(q.no)}" tabindex="0" class="${q.no === lastSaved ? 'is-new' : ''}">
          <td><span class="code">${esc(q.no)}</span></td>
          <td><div class="cell-main">${esc(q.customerName)}</div><div class="cell-sub">${esc(q.customer)}${q.scenario ? ` · ${esc(q.scenario.title)}` : ''}</div></td>
          <td class="hide-md">${esc(userLabel(q.createdBy))}</td>
          <td class="hide-sm">${date(q.date)}</td>
          <td class="num"><strong>${money(q.totals.net)}</strong></td>
          <td>${statusBadge(q)}${activeStep(q) ? `<div class="cell-sub">${esc(activeStep(q).label)}</div>` : ''}</td>
        </tr>`
        )
        .join('')}</tbody>
    </table></div>
    <div class="table-foot"><strong>${list.length}</strong> teklif · ${all ? 'tüm kullanıcılar' : 'yalnızca senin tekliflerin'} · tarayıcında saklanır</div>
  </div>`;
}

function template() {
  const n = visible().length;
  const listLabel = can('QUOTE_VIEW_ALL') ? 'Tüm teklifler' : 'Tekliflerim';
  return `
    <div class="sim-top">
      <div class="seg-ctrl" role="tablist" aria-label="Simülasyon görünümü">
        <button type="button" role="tab" data-mode="form" aria-selected="${mode === 'form'}" class="${mode === 'form' ? 'is-active' : ''}">Yeni teklif</button>
        <button type="button" role="tab" data-mode="list" aria-selected="${mode === 'list'}" class="${mode === 'list' ? 'is-active' : ''}">${listLabel}${n ? ` <span class="count">${n}</span>` : ''}</button>
        <button type="button" role="tab" data-mode="orders" aria-selected="${mode === 'orders'}" class="${mode === 'orders' ? 'is-active' : ''}">Siparişler${visibleOrders().length ? ` <span class="count">${visibleOrders().length}</span>` : ''}</button>
      </div>
      <p class="cell-sub">${esc(cfg().description || '')}</p>
    </div>
    ${mode === 'form' ? formView() : mode === 'orders' ? ordersView() : listView()}`;
}

function ordersView() {
  const list = visibleOrders();
  if (!list.length) {
    return `<div class="card">${emptyState('cart', 'Henüz sipariş yok', 'Onaylanmış bir teklifin detayından "Siparişe dönüştür" ile sipariş oluştur.')}</div>`;
  }
  return `<div class="card table-card">
    <div class="table-wrap"><table class="table">
      <thead><tr><th>Sipariş no</th><th>Müşteri</th><th class="hide-md">Teklif</th><th class="hide-sm">İstenen teslim</th><th class="num">Net</th><th>Durum</th></tr></thead>
      <tbody>${list
        .map(
          (o) => `<tr data-order="${esc(o.no)}" tabindex="0">
          <td><span class="code">${esc(o.no)}</span></td>
          <td><div class="cell-main">${esc(o.customerName)}</div><div class="cell-sub">Müşteri sipariş no ${esc(o.customerPo)}</div></td>
          <td class="hide-md"><span class="code">${esc(o.quoteNo)}</span></td>
          <td class="hide-sm">${date(o.requestedDate)}</td>
          <td class="num"><strong>${money(o.totals.net)}</strong></td>
          <td><div class="badges tight">${orderBadges(o)}</div></td>
        </tr>`
        )
        .join('')}</tbody>
    </table></div>
    <div class="table-foot"><strong>${list.length}</strong> sipariş · satıra tıklayınca belge akışı ve ERP işlemleri açılır</div>
  </div>`;
}

// ---------- kayıt ve detay ----------
function save(asDraft = false) {
  if (!can('QUOTE_CREATE')) return toast(lockReason('QUOTE_CREATE'));
  const c = compute();
  if (!c.canSave) {
    toast(c.errors[0] || 'Teklif kaydedilemedi');
    return;
  }
  const D = company();
  const rec = createQuote(
    {
      date: sysDate(),
      validTo: draft.validTo,
      customer: c.cust.id,
      customerName: c.cust.name,
      prospect: !!c.cust.prospect,
      segment: c.cust.segment,
      channel: c.cust.channel,
      salesArea: `${D.organization.salesOrg.code}/${c.cust.channel}/${D.organization.divisions.map((d) => d.code).join('-')}`,
      paymentTerm: c.cust.paymentTerm,
      plant: draft.plant,
      contact: draft.contact,
      reference: draft.reference.trim(),
      scenario: draft.scenario,
      opportunity: draft.opportunity?.id || null,
      opportunityName: draft.opportunity?.name || null,
      lines: c.lines.map((l) => ({
        pos: l.pos, code: l.p.code, name: l.p.name, qty: l.qty, unit: l.p.unit,
        list: l.r.list, net: l.r.net, netTotal: l.netTotal, vatRate: l.r.vatRate, vatTotal: l.vatTotal,
        campaign: l.r.campApplied ? l.r.camp.id : null, short: l.short,
      })),
      totals: c.totals,
      approvals: c.approvals,
      track: ctx.track.id,
    },
    rules().firstQuoteNo,
    { asDraft }
  );
  lastSaved = rec.no;
  resetDraft();
  mode = 'list';
  toast(`Teklif ${rec.no} ${asDraft ? 'taslak olarak kaydedildi' : rec.status === 'pending' ? 'onaya gönderildi' : 'kaydedildi ve onaylandı'}`);
  progress.setDone(ctx.track.id, 'simulation', true);
  document.dispatchEvent(new CustomEvent('erp:refresh'));
}

function copyIntoDraft(src) {
  if (!src || !partnerOf(src.customer)) return;
  resetDraft();
  setCustomer(src.customer);
  if (src.contact) draft.contact = src.contact;
  draft.plant = src.plant;
  draft.reference = src.reference || '';
  draft.opportunity = src.opportunity ? { id: src.opportunity, name: src.opportunityName || '' } : null;
  src.lines.forEach((l) => addItem(l.code, l.qty));
  draft.open = [];
  mode = 'form';
  render();
  toast(`${src.no} yeni teklife kopyalandı`);
}

function quoteDetail(no) {
  openQuote(no, { onCopy: copyIntoDraft });
}

// ---------- çizim ve olaylar ----------
let root = null;

function render() {
  if (!root || !root.isConnected) return;
  const fk = document.activeElement?.closest?.('[data-fk]')?.dataset.fk;
  root.innerHTML = template();
  if (fk) root.querySelector(`[data-fk="${CSS.escape(fk)}"]`)?.focus({ preventScroll: true });
}

function bindSim(el) {
  root = el;

  el.addEventListener('click', (e) => {
    const m = e.target.closest('[data-mode]');
    if (m) {
      mode = m.dataset.mode;
      lastSaved = mode === 'list' ? lastSaved : null;
      return render();
    }
    const qrow = e.target.closest('tr[data-quote]');
    if (qrow) return quoteDetail(qrow.dataset.quote);
    const orow = e.target.closest('tr[data-order]');
    if (orow) return openDoc('order', orow.dataset.order);

    const a = e.target.closest('[data-act]');
    if (!a) return;
    const act = a.dataset.act;
    if (act === 'add') {
      const code = el.querySelector('[data-fk="add-code"]').value;
      const qty = parseInt(el.querySelector('[data-fk="add-qty"]').value, 10);
      if (!code) return toast('Önce ürün seç');
      if (!(qty > 0)) return toast('Miktar 1 veya daha büyük olmalı');
      addItem(code, qty);
      draft.addCode = '';
      draft.addQty = '';
      render();
      el.querySelector('[data-fk="add-code"]')?.focus();
    } else if (act === 'remove') {
      const i = Number(a.dataset.i);
      draft.items.splice(i, 1);
      draft.open = [];
      render();
    } else if (act === 'toggle') {
      const i = Number(a.dataset.i);
      draft.open = draft.open.includes(i) ? [] : [i];
      render();
    } else if (act === 'clear') {
      resetDraft();
      render();
    } else if (act === 'save') {
      save();
    } else if (act === 'save-draft') {
      save(true);
    } else if (act === 'login') {
      openLogin();
    } else if (act === 'drop-opp') {
      draft.opportunity = null;
      render();
    } else if (act === 'drop-scenario') {
      draft.scenario = null;
      render();
    } else if (act === 'open-customer') {
      openDetail('customer', draft.customer);
    }
  });

  el.addEventListener('change', (e) => {
    const t = e.target;
    if (t.dataset.field === 'customer') {
      setCustomer(t.value);
      return render();
    }
    if (t.dataset.field === 'plant' || t.dataset.field === 'contact' || t.dataset.field === 'validTo') {
      draft[t.dataset.field] = t.value;
      return render();
    }
    if (t.dataset.qty != null) {
      const i = Number(t.dataset.qty);
      const v = parseInt(t.value, 10);
      if (v > 0) draft.items[i].qty = v;
      else toast('Miktar 1 veya daha büyük olmalı');
      return render();
    }
    if (t.dataset.fk === 'add-code') draft.addCode = t.value;
  });

  el.addEventListener('input', (e) => {
    const t = e.target;
    if (t.dataset.field === 'reference') draft.reference = t.value;
    if (t.dataset.fk === 'add-qty') draft.addQty = t.value;
  });

  el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.dataset.fk === 'add-qty') {
      e.preventDefault();
      el.querySelector('[data-act="add"]')?.click();
    }
    const qrow = e.target.closest?.('tr[data-quote]');
    if (qrow && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      quoteDetail(qrow.dataset.quote);
    }
  });
}

// ---------- giriş noktası ----------
export async function renderQuoteSim(c) {
  await loadCompany();
  ctx = c;
  const sc = c.route.query?.scenario;
  const cp = c.route.query?.copy;
  if (sc) {
    applyScenario(sc);
    stripQuery();
  } else if (cp) {
    stripQuery();
    copyIntoDraft(getQuote(cp));
  }
  return {
    html: `<div class="sim" data-sim>${template()}</div>`,
    bind(container) {
      bindSim(container.querySelector('[data-sim]'));
    },
  };
}

// Test ve diğer modüller için
export const _internals = { draft, compute: () => compute(), setCustomer, addItem, resetDraft, setCtx: (c) => (ctx = c) };
