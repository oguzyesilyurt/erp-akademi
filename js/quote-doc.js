// Kaydedilmiş bir teklifi salt okunur ERP belgesi olarak çizer.
// Kalemlerde yalnızca verilen alanlar (list, k007, zkmp, vatRate) kayıttaki değer olarak kullanılır;
// verilmeyenler ana veri ve fiyat kurallarından (priceFor) türetilir. Böylece bilerek
// bırakılmış hatalar dışında belge tutarlı kalır.
import { icon } from './icons.js';
import { esc, money2 as money, num, date, pct1, round2, badge, progressBar, helpBtn } from './ui.js';
import {
  company, partnerOf, productOf, priceFor, channelName, termName, userOf, openDetail,
} from './company.js';

export function computeDoc(q) {
  const cust = partnerOf(q.customer);
  const totals = { list: 0, k007: 0, zkmp: 0, net: 0, vat: 0, gross: 0, vatByRate: {} };
  const lines = (q.lines || []).map((ln, i) => {
    const p = productOf(ln.code);
    const qty = ln.qty;
    const std = priceFor(ln.code, cust.segment, cust.channel, qty);
    const list = ln.list ?? std.list;
    const k = ln.k007 ?? std.segRate;
    const z = ln.zkmp ?? (std.camp && std.campApplied ? std.camp.discount : 0);
    const vatRate = ln.vatRate ?? std.vatRate;

    const segAmt = round2((list * k) / 100);
    const afterSeg = list - segAmt;
    const cAmt = round2((afterSeg * z) / 100);
    const net = round2(afterSeg - cAmt);
    const vat = round2((net * vatRate) / 100);

    const listTotal = round2(list * qty);
    const netTotal = round2(net * qty);
    const k007T = round2(segAmt * qty);
    const zkmpT = round2(listTotal - k007T - netTotal);
    const vatTotal = round2((netTotal * vatRate) / 100);

    totals.list += listTotal;
    totals.k007 += k007T;
    totals.zkmp += zkmpT;
    totals.net += netTotal;
    totals.vat += vatTotal;
    totals.vatByRate[vatRate] = round2((totals.vatByRate[vatRate] || 0) + vatTotal);

    return {
      pos: (i + 1) * 10, p, qty, list, k, z, vatRate, segAmt, cAmt, net, vat,
      campName: std.camp?.name || 'Kampanya iskontosu',
      listTotal, netTotal, k007T, zkmpT, vatTotal, gross: round2(netTotal + vatTotal),
    };
  });
  for (const k of ['list', 'k007', 'zkmp', 'net', 'vat']) totals[k] = round2(totals[k]);
  totals.gross = round2(totals.net + totals.vat);
  totals.discountPct = totals.list > 0 ? ((totals.list - totals.net) / totals.list) * 100 : 0;
  return { cust, lines, totals };
}

function approvalText(a) {
  if (!a || a.status === 'not-required') return { label: 'Gerekmedi', html: 'Gerekmedi' };
  if (a.status === 'approved') {
    const u = userOf(a.by);
    return { label: 'Onaylandı', html: `Onaylandı · ${esc(u?.name || a.by || '')}${a.at ? ` · ${date(a.at)}` : ''}` };
  }
  return { label: 'Onay bekliyor', html: 'Onay bekliyor' };
}

const roField = (label, html, helpText = '') => `
  <div class="field">
    <div class="field-label"><span>${esc(label)}</span>${helpBtn(helpText, label)}</div>
    <div class="ro">${html}</div>
  </div>`;

function condTable(l, H) {
  const row = (cond, label, rate, unit, total, cls = '') => `<tr class="${cls}">
    <td>${cond ? `<span class="code">${esc(cond)}</span>${helpBtn(H[cond], cond)}` : ''}</td>
    <td>${label}</td><td class="num">${rate}</td><td class="num">${unit}</td><td class="num">${total}</td></tr>`;
  return `<table class="cond-table">
    <thead><tr><th>Koşul</th><th>Açıklama</th><th class="num">Oran</th><th class="num">Birim</th><th class="num">Tutar (× ${num(l.qty)})</th></tr></thead>
    <tbody>
      ${row('PR00', 'Liste fiyatı', '', money(l.list), money(l.listTotal))}
      ${row('K007', 'Segment iskontosu', `%-${l.k}`, money(-l.segAmt), money(-l.k007T))}
      ${l.z ? row('ZKMP', esc(l.campName), `%-${l.z}`, money(-l.cAmt), money(-l.zkmpT)) : ''}
      ${row('', 'Net', '', money(l.net), money(l.netTotal), 'total')}
      ${row('KDV', 'Katma değer vergisi', `%${l.vatRate}`, money(l.vat), money(l.vatTotal))}
      ${row('', 'KDV dahil', '', money(round2(l.net + l.vat)), money(l.gross), 'total')}
    </tbody>
  </table>`;
}

// q: teklif kaydı; opts.help: alan açıklamaları (simülasyon help nesnesi)
export function renderQuoteDoc(q, opts = {}) {
  const H = opts.help || {};
  const D = company();
  const { cust, lines, totals: t } = computeDoc(q);
  const rep = userOf(cust.salesRep);
  const wh = D.organization.warehouses.find((w) => w.code === q.plant);
  const ap = approvalText(q.approval);

  const rows = lines
    .map(
      (l) => `
      <tr class="item-row">
        <td class="pos">${l.pos}</td>
        <td>
          <button class="link" type="button" data-open="product" data-id="${esc(l.p.code)}">${esc(l.p.name)}</button>
          <div class="cell-sub">${esc(l.p.code)} · ${esc(l.p.pack)}${l.z ? ' · <span class="tag-camp">Kampanya</span>' : ''}</div>
        </td>
        <td class="num">${num(l.qty)}</td>
        <td class="cq-b">${esc(l.p.unit)}</td>
        <td class="num cq-a">${money(l.list)}</td>
        <td class="num cq-c">${money(l.net)}</td>
        <td class="num"><strong>${money(l.netTotal)}</strong></td>
        <td class="row-actions"><button class="icon-btn sm" type="button" data-doc-toggle="${l.pos}" aria-expanded="false" aria-label="Fiyat adımlarını göster" title="Fiyat adımları">${icon('layers')}</button></td>
      </tr>
      <tr class="cond-row" data-doc-cond="${l.pos}" hidden><td></td><td colspan="7">${condTable(l, H)}</td></tr>`
    )
    .join('');

  const line = (code, label, val, cls = '') => `<div class="sum-row ${cls}"><span>${code ? `<span class="code">${code}</span>` : ''}${label}</span><span>${val}</span></div>`;

  return `<div class="quote-doc">
    <div class="docbar card">
      <div class="docbar-title">
        <span class="doc-type">${icon('tag')}</span>
        <div><h2>Teklif <span class="code">${esc(q.no)}</span></h2><span class="cell-sub">${esc(cust.name)}</span></div>
      </div>
      <div class="docbar-side">${badge(q.status || 'Kaydedildi', 'info')}${badge('Salt okunur', 'neutral')}</div>
    </div>
    <div class="sim-grid">
      <div class="sim-main">
        <section class="sim-sec card">
          <header class="sim-sec-head"><h3>Başlık verileri</h3></header>
          <div class="form-grid">
            ${roField('Müşteri', `<button class="link" type="button" data-open="customer" data-id="${esc(cust.id)}">${esc(cust.id)} · ${esc(cust.name)}</button>`, H.customer)}
            ${roField('Satış alanı', `<span class="code">${esc(D.organization.salesOrg.code)}</span> / <span class="code">${esc(cust.channel)}</span> ${esc(channelName(cust.channel))}`, H.salesArea)}
            ${roField('Teklif tarihi', date(q.date), H.quoteDate)}
            ${roField('Geçerlilik tarihi', date(q.validTo), H.validTo)}
            ${roField('Ödeme koşulu', `<span class="code">${esc(cust.paymentTerm)}</span> ${esc(termName(cust.paymentTerm))}`, H.paymentTerm)}
            ${roField('Teslimat deposu', `<span class="code">${esc(q.plant)}</span> ${esc(wh?.name || '')}`, H.plant)}
            ${roField('İlgili kişi', esc(q.contact || '—'), H.contact)}
            ${roField('Satış temsilcisi', esc(rep?.name || '—'), H.salesRep)}
            ${roField('Müşteri referansı', esc(q.reference || '—'), H.reference)}
            ${roField('Onay durumu', ap.html, H.approval)}
          </div>
        </section>
        <section class="sim-sec card">
          <header class="sim-sec-head"><h3>Kalemler</h3><span class="cell-sub">${lines.length} kalem</span></header>
          <div class="table-wrap"><table class="table items">
            <thead><tr><th>Kalem</th><th>Ürün</th><th class="num">Miktar</th><th class="cq-b">Birim</th><th class="num cq-a">Liste</th><th class="num cq-c">Net birim</th><th class="num">Net tutar</th><th><span class="sr-only">İşlemler</span></th></tr></thead>
            <tbody>${rows}</tbody>
          </table></div>
        </section>
      </div>
      <aside class="summary card">
        <h3>Fiyat özeti</h3>
        ${line('PR00', 'Liste tutarı', money(t.list))}
        ${line('K007', 'Segment iskontosu', `−${money(t.k007)}`, 'minus')}
        ${line('ZKMP', 'Kampanya iskontosu', `−${money(t.zkmp)}`, 'minus')}
        ${line('', 'Net tutar', money(t.net), 'strong')}
        ${Object.entries(t.vatByRate).sort((a, b) => a[0] - b[0]).map(([r, v]) => line('KDV', ` %${r}`, money(v))).join('')}
        <div class="sum-total"><span>Genel toplam</span><strong>${money(t.gross)}</strong></div>
        <div class="disc">
          <div class="disc-head"><span>Toplam iskonto ${helpBtn(H.discount, 'Toplam iskonto')}</span><strong>${pct1(t.discountPct)}</strong></div>
          ${progressBar((t.discountPct / 25) * 100, 'var(--primary)')}
        </div>
        <div class="check is-na"><div class="check-head">${icon('user')}<strong>Onay: ${esc(ap.label)}</strong>${helpBtn(H.approval, 'Onay')}</div></div>
      </aside>
    </div>
  </div>`;
}

// Belge içi etkileşimler: fiyat adımlarını aç/kapat, ana veri detayını aç
// opts.base: ana veri detayları orijinal company.json ile açılır
export function bindQuoteDoc(root, opts = {}) {
  root.addEventListener('click', (e) => {
    const tg = e.target.closest('[data-doc-toggle]');
    if (tg) {
      const row = root.querySelector(`[data-doc-cond="${tg.dataset.docToggle}"]`);
      const open = row.hidden;
      row.hidden = !open;
      tg.setAttribute('aria-expanded', String(open));
      tg.closest('tr').classList.toggle('is-open', open);
      return;
    }
    const o = e.target.closest('.quote-doc [data-open]');
    if (o) openDetail(o.dataset.open, o.dataset.id, { base: !!opts.base });
  });
}
