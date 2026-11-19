// Şirket sayfası: ortak sahte şirket verisi (data/company.json)
import { icon } from './icons.js';
import { href } from './router.js';
import {
  esc, money, num, date, datetime, pct, norm, round2, emptyState, progressBar, badge,
  kv, dsec, alertBox, openDrawer, drawerHead, toast,
} from './ui.js';
import { can, currentUser, userLabel, actionBtn, userById as iamUserById, usersOf as iamUsers, rolesOfUser, permsOfUser, permOf } from './auth.js';
import { flag } from './release.js';

export const COMPANY_TABS = [
  { id: 'org',       label: 'Organizasyon', icon: 'building' },
  { id: 'customers', label: 'Müşteriler',   icon: 'users' },
  { id: 'products',  label: 'Ürünler',      icon: 'box' },
  { id: 'prices',    label: 'Fiyatlar',     icon: 'tag' },
  { id: 'suppliers', label: 'Tedarikçiler', icon: 'truck' },
];

// ---------- veri ----------
let dataPromise = null;
let D = null;

// ---------- ana veri değişiklikleri (tarayıcıda saklanır) ----------
const MD_KEY = 'erp-akademi:masterdata';
const clone = (o) => JSON.parse(JSON.stringify(o));
let BASE_D = null; // company.json'un dokunulmamış kopyası
let baseMode = false;

function readMd() {
  try {
    const md = JSON.parse(localStorage.getItem(MD_KEY)) || {};
    return { customers: md.customers || {}, products: md.products || {}, prospects: md.prospects || [] };
  } catch {
    return { customers: {}, products: {}, prospects: [] };
  }
}

function writeMd(md) {
  try {
    localStorage.setItem(MD_KEY, JSON.stringify(md));
  } catch {}
}

function applyOverrides() {
  const md = readMd();
  // CRM'de lead dönüşümüyle açılan aday hesaplar (C4C)
  D.prospects = D.prospects || [];
  for (const p of md.prospects) if (!partnerOf(p.id)) D.prospects.push(clone(p));
  for (const [id, patch] of Object.entries(md.customers)) {
    const c = partnerOf(id);
    if (c) Object.assign(c, patch);
  }
  for (const [code, patch] of Object.entries(md.products)) {
    const p = productOf(code);
    if (p) Object.assign(p, clone(patch));
  }
}

// İşlem verisi (fatura → açık bakiye, teslimat → stok) ve CRM'den eklenen ilgili kişiler
// ana veri değişikliği sayılmaz
const TX_FIELDS = ['openBalance', 'contacts'];

// CRM'de (lead dönüşümü) yeni aday hesap açar; ERP'de açılana kadar müşteri numarası yoktur
export function addProspect(rec) {
  const md = readMd();
  const nums = [...(D.prospects || []).map((p) => p.id), ...md.prospects.map((p) => p.id)].map((x) => Number(String(x).replace(/\D/g, '')) || 0);
  const id = `A-${String(Math.max(0, ...nums) + 1).padStart(4, '0')}`;
  const p = {
    id, prospect: true, taxNo: '', taxOffice: '', city: rec.region || '', segment: 'C', channel: '10', plant: D.organization.warehouses[0].code,
    creditLimit: 0, openBalance: 0, overdue: 0, paymentTerm: 'Z000', blocked: false, contacts: [], ...rec,
  };
  p.id = id;
  md.prospects.push(p);
  writeMd(md);
  D.prospects = D.prospects || [];
  D.prospects.push(clone(p));
  return p;
}

// C4C demo verisi sıfırlanırken CRM'de açılan aday hesapları kaldırır
export function removeProspects(ids) {
  const set = new Set(ids);
  const md = readMd();
  md.prospects = md.prospects.filter((p) => !set.has(p.id));
  for (const id of ids) delete md.customers[id];
  writeMd(md);
  if (D) D.prospects = (D.prospects || []).filter((p) => !set.has(p.id));
}
export const crmProspectIds = () => readMd().prospects.map((p) => p.id);

export function hasMasterDataChanges() {
  return Object.values(readMd().customers).some((p) => Object.keys(p).some((k) => !TX_FIELDS.includes(k)));
}

// fn'i orijinal company.json verisiyle çalıştırır (ör. Hata Avı); senkron olmalı
export function useBase(fn) {
  if (!BASE_D) return fn();
  const saved = D;
  const savedMode = baseMode;
  D = BASE_D;
  baseMode = true;
  try {
    return fn();
  } finally {
    D = saved;
    baseMode = savedMode;
  }
}

// Müşteri ana verisini günceller (yetki kontrolü çağıran tarafta yapılır)
export function updateCustomer(id, patch, { silent = false } = {}) {
  const md = readMd();
  md.customers[id] = { ...(md.customers[id] || {}), ...patch };
  writeMd(md);
  const c = partnerOf(id);
  if (c) Object.assign(c, patch);
  if (!silent) document.dispatchEvent(new CustomEvent('erp:refresh'));
}

// Ürün verisini (ör. depo stoğu) günceller
export function updateProduct(code, patch, { silent = false } = {}) {
  const md = readMd();
  md.products[code] = { ...(md.products[code] || {}), ...clone(patch) };
  writeMd(md);
  const p = productOf(code);
  if (p) Object.assign(p, clone(patch));
  if (!silent) document.dispatchEvent(new CustomEvent('erp:refresh'));
}

// opts.keepProducts: işlem verisini (stok hareketleri, faturalardan gelen açık bakiye) koru
export function resetMasterData({ keepProducts = false } = {}) {
  const md = readMd();
  const customers = {};
  if (keepProducts) {
    for (const [id, p] of Object.entries(md.customers)) {
      const tx = Object.fromEntries(Object.entries(p).filter(([k]) => TX_FIELDS.includes(k)));
      if (Object.keys(tx).length) customers[id] = tx;
    }
  }
  writeMd({ customers, products: keepProducts ? md.products : {}, prospects: md.prospects });
  if (BASE_D) {
    D = clone(BASE_D);
    applyOverrides();
  }
  document.dispatchEvent(new CustomEvent('erp:refresh'));
}

export function loadCompany() {
  if (!dataPromise) {
    dataPromise = fetch('data/company.json', { cache: 'no-cache' })
      .then((r) => {
        if (!r.ok) throw new Error(`company.json: ${r.status}`);
        return r.json();
      })
      .then((d) => {
        BASE_D = clone(d);
        D = d;
        applyOverrides();
        return D;
      })
      .catch((e) => {
        dataPromise = null;
        throw e;
      });
  }
  return dataPromise;
}

// Yüklenmiş veriye erişim (diğer modüller için)
export const company = () => D;

export const channelName = (code) => D.organization.distributionChannels.find((c) => c.code === code)?.name || code;
export const divisionName = (code) => D.organization.divisions.find((c) => c.code === code)?.name || code;
export const termOf = (code) => D.organization.paymentTerms.find((t) => t.code === code);
export const termName = (code) => termOf(code)?.name || code;
// Kullanıcılar Kullanıcı Yönetimi'nden (IAM) gelir; Hata Avı gibi orijinal veri modunda company.json kullanılır
export const userOf = (id) => (baseMode ? null : iamUserById(id)) || D.organization.users.find((u) => u.id === id);
export const unitName = (u) => D.units?.[u] || u;
export const productOf = (code) => D.products.find((p) => p.code === code);
export const supplierOf = (id) => D.suppliers.find((s) => s.id === id);
export const stockTotal = (p) => Object.values(p.stock || {}).reduce((a, b) => a + b, 0);
// Müşteri veya aday (prospect) kaydı
export const partnerOf = (id) => D.customers.find((c) => c.id === id) || (D.prospects || []).find((c) => c.id === id);

// ERP müşteri numarası: gerçek müşterilerde kendi numarası, adaylarda ERP'de açılınca atanan numara
export const erpNumberOf = (c) => (c ? c.erpNumber || (c.prospect ? null : c.id) : null);
// Kredi limiti olmadan peşin (Z000) çalışan müşteri
export const isCash = (c) => !!c && !c.prospect && c.paymentTerm === 'Z000' && !c.creditLimit;

// ---------- iş kuralları (diğer yollar da kullanabilir) ----------
export function creditStatus(c) {
  if (c.prospect) return { key: 'prospect', label: 'Aday', tone: 'info', ratio: 0 };
  if (c.blocked) return { key: 'blocked', label: 'Bloke', tone: 'danger-solid', ratio: c.creditLimit > 0 ? c.openBalance / c.creditLimit : 1 };
  if (isCash(c)) return { key: 'cash', label: 'Peşin', tone: 'info', ratio: 0 };
  const ratio = c.creditLimit > 0 ? c.openBalance / c.creditLimit : 1;
  if (ratio > 1) return { key: 'over', label: 'Limit aşımı', tone: 'danger', ratio };
  if (ratio >= 0.8) return { key: 'risk', label: 'Riskli', tone: 'warning', ratio };
  return { key: 'ok', label: 'Uygun', tone: 'success', ratio };
}

export function stockStatus(p) {
  const total = stockTotal(p);
  if (total <= p.reorderPoint) return { key: 'critical', label: 'Kritik', tone: 'danger' };
  if (Object.values(p.stock).some((q) => q === 0)) return { key: 'partial', label: 'Depoda eksik', tone: 'warning' };
  return { key: 'ok', label: 'Yeterli', tone: 'success' };
}

export function activeCampaign(code, channel, onDate = D?.asOf) {
  return (D.pricing.campaigns || []).find(
    (k) =>
      k.active &&
      k.products.includes(code) &&
      (!channel || k.channels.includes(channel)) &&
      (!onDate || (k.validFrom <= onDate && onDate <= k.validTo))
  );
}

// Fiyat hesaplama: PR00 liste → K007 segment iskontosu → ZKMP kampanya
export function priceFor(code, segment, channel, qty = null) {
  const p = productOf(code);
  const list = D.pricing.listPrices.prices[code] ?? 0;
  const segRate = D.pricing.segmentDiscounts.rates[segment] ?? 0;
  const steps = [{ cond: D.pricing.listPrices.condition, label: 'Liste fiyatı', amount: list }];

  const segAmt = round2((list * segRate) / 100);
  steps.push({ cond: D.pricing.segmentDiscounts.condition, label: `Segment ${segment} iskontosu`, rate: -segRate, amount: -segAmt });
  let net = list - segAmt;

  const camp = activeCampaign(code, channel);
  let campApplied = false;
  if (camp) {
    // v1.1 hatası (BUG_CAMPAIGN_MINQTY): minimum miktar kontrolü yok. Orijinal veri modunda (Hata Avı) bayrak yok sayılır.
    campApplied = qty == null || qty >= camp.minQty || (!baseMode && flag('BUG_CAMPAIGN_MINQTY'));
    const cAmt = round2((net * camp.discount) / 100);
    steps.push({
      cond: camp.condition,
      label: camp.name,
      rate: -camp.discount,
      amount: campApplied ? -cAmt : 0,
      note: `En az ${camp.minQty} ${unitName(p?.unit).toLocaleLowerCase('tr-TR')}`,
    });
    if (campApplied) net -= cAmt;
  }

  net = round2(net);
  const vatRate = p?.vatRate ?? 0;
  const vat = round2((net * vatRate) / 100);
  return { list, segRate, camp, campApplied, steps, net, vatRate, vat, gross: round2(net + vat) };
}

// ---------- filtre durumu (oturum boyunca korunur) ----------
const state = {
  customers: { q: '', segment: '', channel: '', credit: '' },
  products: { q: '', division: '', category: '', stock: '' },
  prices: { q: '', segment: 'A', channel: '10' },
  suppliers: { q: '', rating: '' },
};

const matches = (q, ...fields) => !q || fields.some((f) => norm(f).includes(norm(q)));

// ---------- liste tanımları ----------
const LISTS = {
  customers: {
    head: ['Müşteri', ['Bölge', 'hide-sm'], 'Segment', ['Kanal', 'hide-md'], ['Açık bakiye', 'hide-sm num'], ['Kredi kullanımı', 'hide-sm'], 'Durum'],
    items: () => [...D.customers, ...(D.prospects || [])],
    filter: (c, f) =>
      matches(f.q, c.name, c.id, c.taxNo, c.city, c.region, ...c.contacts.map((k) => k.name)) &&
      (!f.segment || c.segment === f.segment) &&
      (!f.channel || c.channel === f.channel) &&
      (!f.credit || creditStatus(c).key === f.credit),
    row: (c) => {
      const s = creditStatus(c);
      return `
      <tr data-open="customer" data-id="${esc(c.id)}" tabindex="0">
        <td><div class="cell-main">${esc(c.name)}</div><div class="cell-sub">${esc(c.id)} · ${esc(c.city)}</div></td>
        <td class="hide-sm">${esc(c.region)}</td>
        <td>${segBadge(c.segment)}</td>
        <td class="hide-md">${esc(channelName(c.channel))}</td>
        <td class="hide-sm num">${money(c.openBalance)}</td>
        <td class="hide-sm">${utilBar(s)}</td>
        <td>${badge(s.label, s.tone)}</td>
      </tr>`;
    },
  },
  products: {
    head: ['Ürün', ['Kategori', 'hide-sm'], ['Bölüm', 'hide-md'], ['Birim', 'hide-sm'], ['Toplam stok', 'num'], 'Durum'],
    items: () => D.products,
    filter: (p, f) =>
      matches(f.q, p.code, p.name, p.category, p.pack) &&
      (!f.division || p.division === f.division) &&
      (!f.category || p.category === f.category) &&
      (!f.stock || stockStatus(p).key === f.stock),
    row: (p) => {
      const s = stockStatus(p);
      const wh = D.organization.warehouses.map((w) => `<td class="hide-md num">${num(p.stock[w.code] ?? 0)}</td>`).join('');
      return `
      <tr data-open="product" data-id="${esc(p.code)}" tabindex="0">
        <td><div class="cell-main">${esc(p.name)}</div><div class="cell-sub">${esc(p.code)} · ${esc(p.pack)}</div></td>
        <td class="hide-sm">${esc(p.category)}</td>
        <td class="hide-md">${esc(divisionName(p.division))}</td>
        <td class="hide-sm">${esc(p.unit)}</td>
        ${wh}
        <td class="num"><strong>${num(stockTotal(p))}</strong></td>
        <td>${badge(s.label, s.tone)}</td>
      </tr>`;
    },
  },
  prices: {
    head: ['Ürün', ['Liste (PR00)', 'num hide-sm'], ['Segment (K007)', 'num hide-md'], ['Kampanya', 'hide-sm'], ['Net', 'num'], ['KDV dahil', 'num hide-md']],
    items: () => D.products,
    filter: (p, f) => matches(f.q, p.code, p.name, p.category),
    row: (p, f) => {
      const r = priceFor(p.code, f.segment, f.channel);
      return `
      <tr data-open="price" data-id="${esc(p.code)}" tabindex="0">
        <td><div class="cell-main">${esc(p.name)}</div><div class="cell-sub">${esc(p.code)} · ${esc(unitName(p.unit))} · KDV %${r.vatRate}</div></td>
        <td class="num hide-sm">${money(r.list)}</td>
        <td class="num hide-md">−%${r.segRate}</td>
        <td class="hide-sm">${r.camp ? badge(`−%${r.camp.discount} · min ${r.camp.minQty}`, 'info') : '<span class="muted">—</span>'}</td>
        <td class="num"><strong>${money(r.net)}</strong></td>
        <td class="num hide-md">${money(r.gross)}</td>
      </tr>`;
    },
  },
  suppliers: {
    head: ['Tedarikçi', ['Şehir', 'hide-sm'], ['Kategori', 'hide-md'], ['Ödeme koşulu', 'hide-md'], ['Tedarik süresi', 'hide-sm num'], 'Puan'],
    items: () => D.suppliers,
    filter: (s, f) => matches(f.q, s.name, s.id, s.city, s.category, s.taxNo) && (!f.rating || s.rating === f.rating),
    row: (s) => `
      <tr data-open="supplier" data-id="${esc(s.id)}" tabindex="0">
        <td><div class="cell-main">${esc(s.name)}</div><div class="cell-sub">${esc(s.id)} · ${s.products.length} ürün</div></td>
        <td class="hide-sm">${esc(s.city)}</td>
        <td class="hide-md">${esc(s.category)}</td>
        <td class="hide-md">${esc(termName(s.paymentTerm))}</td>
        <td class="hide-sm num">${s.leadTimeDays} gün</td>
        <td>${badge(s.rating, s.rating === 'A' ? 'success' : s.rating === 'B' ? 'info' : 'warning')}</td>
      </tr>`,
  },
};

// Ürün tablosuna depo sütunlarını ekle (depo listesi veriden gelir)
function productHead() {
  const base = LISTS.products.head.slice();
  const wh = D.organization.warehouses.map((w) => [`${w.code} stok`, 'hide-md num']);
  base.splice(4, 0, ...wh);
  return base;
}

// ---------- küçük parçalar ----------
export function segBadge(s) {
  return `<span class="seg seg-${esc(s)}" title="Segment ${esc(s)}">${esc(s)}</span>`;
}

export function utilBar(s) {
  const v = s.ratio * 100;
  return `<div class="util" style="--accent:var(--tone-${s.tone.replace('-solid', '')})">${progressBar(Math.min(v, 100), `var(--tone-${s.tone.replace('-solid', '')})`)}<span>${pct(v)}</span></div>`;
}

const select = (key, value, options, allLabel) =>
  `<select class="select" data-filter="${key}" aria-label="${esc(allLabel)}">
    ${allLabel ? `<option value="">${esc(allLabel)}</option>` : ''}
    ${options.map(([v, l]) => `<option value="${esc(v)}" ${v === value ? 'selected' : ''}>${esc(l)}</option>`).join('')}
  </select>`;

function searchBox(value, placeholder) {
  return `<label class="search">${icon('search')}<input type="search" data-filter="q" value="${esc(value)}" placeholder="${esc(placeholder)}" autocomplete="off" spellcheck="false"></label>`;
}

export function contactList(list) {
  return `<ul class="contacts">${list
    .map((c) => {
      const initials = c.name.split(' ').map((w) => w[0]).slice(0, 2).join('');
      return `
      <li>
        <span class="avatar">${esc(initials)}</span>
        <div class="contact-text">
          <div class="cell-main">${esc(c.name)}</div>
          <div class="cell-sub">${esc(c.role)}</div>
        </div>
        <div class="contact-actions">
          ${c.phone ? `<a class="icon-btn" href="tel:${esc(c.phone.replace(/\s/g, ''))}" title="${esc(c.phone)}" aria-label="Ara: ${esc(c.phone)}">${icon('phone')}</a>` : ''}
          ${c.email ? `<a class="icon-btn" href="mailto:${esc(c.email)}" title="${esc(c.email)}" aria-label="E-posta: ${esc(c.email)}">${icon('mail')}</a>` : ''}
        </div>
      </li>`;
    })
    .join('')}</ul>`;
}

// ---------- sekme gövdeleri ----------
function toolbar(tab) {
  const f = state[tab];
  const o = D.organization;
  if (tab === 'customers') {
    return `<div class="toolbar">
      ${searchBox(f.q, 'Ad, numara, vergi no, şehir veya kişi ara')}
      ${select('segment', f.segment, [['A', 'Segment A'], ['B', 'Segment B'], ['C', 'Segment C']], 'Tüm segmentler')}
      ${select('channel', f.channel, o.distributionChannels.map((c) => [c.code, c.name]), 'Tüm kanallar')}
      ${select('credit', f.credit, [['ok', 'Uygun'], ['risk', 'Riskli'], ['over', 'Limit aşımı'], ['blocked', 'Bloke'], ['cash', 'Peşin'], ['prospect', 'Aday']], 'Tüm kredi durumları')}
    </div>`;
  }
  if (tab === 'products') {
    const cats = [...new Set(D.products.map((p) => p.category))].sort((a, b) => a.localeCompare(b, 'tr'));
    return `<div class="toolbar">
      ${searchBox(f.q, 'Kod, ad veya kategori ara')}
      ${select('division', f.division, o.divisions.map((d) => [d.code, d.name]), 'Tüm bölümler')}
      ${select('category', f.category, cats.map((c) => [c, c]), 'Tüm kategoriler')}
      ${select('stock', f.stock, [['ok', 'Yeterli'], ['partial', 'Depoda eksik'], ['critical', 'Kritik']], 'Tüm stok durumları')}
    </div>`;
  }
  if (tab === 'prices') {
    return `<div class="toolbar">
      ${searchBox(f.q, 'Ürün ara')}
      ${select('segment', f.segment, ['A', 'B', 'C'].map((s) => [s, `Segment ${s} (−%${D.pricing.segmentDiscounts.rates[s]})`]))}
      ${select('channel', f.channel, o.distributionChannels.map((c) => [c.code, `Kanal: ${c.name}`]))}
    </div>`;
  }
  if (tab === 'suppliers') {
    return `<div class="toolbar">
      ${searchBox(f.q, 'Ad, şehir veya kategori ara')}
      ${select('rating', f.rating, [['A', 'Puan A'], ['B', 'Puan B'], ['C', 'Puan C']], 'Tüm puanlar')}
    </div>`;
  }
  return '';
}

function tableCard(tab) {
  const head = (tab === 'products' ? productHead() : LISTS[tab].head)
    .map((h) => (Array.isArray(h) ? `<th class="${h[1]}">${esc(h[0])}</th>` : `<th>${esc(h)}</th>`))
    .join('');
  return `
    <div class="card table-card">
      <div class="table-wrap">
        <table class="table">
          <thead><tr>${head}</tr></thead>
          <tbody data-rows></tbody>
        </table>
      </div>
      <div class="table-foot" data-count></div>
      <div data-noresult hidden>${emptyState('search', 'Sonuç bulunamadı', 'Arama veya filtreleri değiştirmeyi dene.', '<button class="btn btn-ghost" type="button" data-reset>Filtreleri temizle</button>')}</div>
    </div>`;
}

function customersHeader() {
  const cs = D.customers;
  const totalBal = cs.reduce((a, c) => a + c.openBalance, 0);
  const totalLim = cs.reduce((a, c) => a + c.creditLimit, 0);
  const overdue = cs.reduce((a, c) => a + c.overdue, 0);
  const flagged = cs.filter((c) => ['over', 'blocked'].includes(creditStatus(c).key)).length;
  return `<div class="kpis">
    <div class="kpi card"><span class="stat-label">Müşteri</span><span class="kpi-value">${cs.length}</span></div>
    <div class="kpi card"><span class="stat-label">Toplam açık bakiye</span><span class="kpi-value">${money(totalBal)}</span><span class="cell-sub">Limitin ${pct((totalBal / totalLim) * 100)}'i</span></div>
    <div class="kpi card"><span class="stat-label">Vadesi geçmiş</span><span class="kpi-value">${money(overdue)}</span></div>
    <div class="kpi card"><span class="stat-label">Aşım / bloke</span><span class="kpi-value">${flagged}</span><span class="cell-sub">Kredi kontrolü gerekli</span></div>
  </div>`;
}

function pricesHeader() {
  const pl = D.pricing.listPrices;
  const sd = D.pricing.segmentDiscounts;
  const camps = (D.pricing.campaigns || []).filter((k) => k.active);
  return `<div class="price-cards">
    <div class="card info-card">
      <div class="info-card-head"><span class="cond">${esc(pl.condition)}</span><h3>${esc(pl.name)}</h3></div>
      <p class="cell-sub">${date(pl.validFrom)} – ${date(pl.validTo)}</p>
      <p class="muted small">${esc(pl.note)}</p>
    </div>
    <div class="card info-card">
      <div class="info-card-head"><span class="cond">${esc(sd.condition)}</span><h3>${esc(sd.name)}</h3></div>
      <div class="seg-rates">${Object.entries(sd.rates).map(([s, r]) => `<div>${segBadge(s)}<strong>−%${r}</strong></div>`).join('')}</div>
    </div>
    ${camps
      .map(
        (k) => `
      <div class="card info-card campaign">
        <div class="info-card-head"><span class="cond">${esc(k.condition)}</span><h3>${esc(k.name)}</h3>${badge('Aktif', 'success')}</div>
        <p class="small">${esc(k.description)}</p>
        <p class="cell-sub">−%${k.discount} · en az ${k.minQty} birim · ${k.channels.map(channelName).join(', ')} · ${date(k.validFrom)} – ${date(k.validTo)}</p>
        <div class="chips">${k.products.map((c) => `<button class="chip" type="button" data-open="product" data-id="${esc(c)}">${esc(productOf(c)?.name || c)}</button>`).join('')}</div>
      </div>`
      )
      .join('')}
  </div>`;
}

function orgBody() {
  const o = D.organization;
  const c = o.company;
  const countBy = (key, val) => D.customers.filter((x) => x[key] === val).length;
  const whStock = (code) => D.products.reduce((a, p) => a + (p.stock[code] || 0), 0);

  return `<div class="org-grid">
    <section class="card org-card span-2">
      <div class="org-card-head"><span class="icon-tile" style="--accent:var(--primary)">${icon('building')}</span>
        <div><h3>${esc(c.name)}</h3><p class="cell-sub">${esc(c.business)}</p></div></div>
      ${kv([
        ['Şirket kodu', `<span class="code">${esc(c.code)}</span>`],
        ['Ticari unvan', esc(c.legalName)],
        ['Vergi no / daire', `${esc(c.taxNo)} · ${esc(c.taxOffice)}`],
        ['Adres', esc(c.address)],
        ['Kuruluş', esc(c.founded)],
        ['Çalışan', num(c.employees)],
        ['Mali yıl', esc(c.fiscalYear)],
        ['Para birimi', esc(D.currency)],
      ])}
    </section>

    <section class="card org-card">
      <h3 class="card-title">Organizasyon yapısı</h3>
      <ul class="tree">
        <li><span class="code">${esc(c.code)}</span> Şirket kodu
          <ul>
            <li><span class="code">${esc(o.salesOrg.code)}</span> ${esc(o.salesOrg.name)}
              <ul>${o.distributionChannels.map((d) => `<li><span class="code">${esc(d.code)}</span> ${esc(d.name)}</li>`).join('')}</ul>
            </li>
            <li><span class="code">${esc(o.purchasingOrg.code)}</span> ${esc(o.purchasingOrg.name)}</li>
            ${o.warehouses.map((w) => `<li><span class="code">${esc(w.code)}</span> ${esc(w.name)}</li>`).join('')}
          </ul>
        </li>
      </ul>
    </section>

    <section class="card org-card">
      <h3 class="card-title">Dağıtım kanalları</h3>
      <ul class="list">${o.distributionChannels
        .map(
          (d) => `<li><span class="code">${esc(d.code)}</span><div><div class="cell-main">${esc(d.name)}</div><div class="cell-sub">${esc(d.description)}</div></div><span class="pill">${countBy('channel', d.code)} müşteri</span></li>`
        )
        .join('')}</ul>
      <h3 class="card-title mt">Bölümler</h3>
      <ul class="list">${o.divisions
        .map((d) => `<li><span class="code">${esc(d.code)}</span><div class="cell-main">${esc(d.name)}</div><span class="pill">${D.products.filter((p) => p.division === d.code).length} ürün</span></li>`)
        .join('')}</ul>
    </section>

    <section class="card org-card">
      <h3 class="card-title">Depolar</h3>
      <ul class="list">${o.warehouses
        .map(
          (w) => `<li><span class="icon-tile sm" style="--accent:var(--primary)">${icon('warehouse')}</span><div><div class="cell-main">${esc(w.name)} <span class="code">${esc(w.code)}</span></div><div class="cell-sub">${esc(w.type)} · ${esc(w.address)}</div><div class="cell-sub">Kapasite ${num(w.capacityPallet)} palet · Stok ${num(whStock(w.code))} birim</div></div></li>`
        )
        .join('')}</ul>
      <h3 class="card-title mt">Ödeme koşulları</h3>
      <div class="chips">${o.paymentTerms.map((t) => `<span class="chip static"><span class="code">${esc(t.code)}</span> ${esc(t.name)}</span>`).join('')}</div>
    </section>

    <section class="card org-card span-2">
      <h3 class="card-title">Kullanıcılar ve roller</h3>
      <div class="users">${(iamUsers().length ? iamUsers() : o.users)
        .map(
          (u) => `<button class="user-card" type="button" data-open="user" data-id="${esc(u.id)}">
            <span class="avatar lg">${esc(u.name.split(' ').map((w) => w[0]).slice(0, 2).join(''))}</span>
            <span><span class="cell-main">${esc(u.name)}</span><span class="cell-sub">${esc(rolesOfUser(u.id).map((r) => r.name).join(', ') || u.role || '')} · ${esc(u.username)}</span></span>
          </button>`
        )
        .join('')}</div>
      <p class="cell-sub mt-sm">Kullanıcı ve rol değişiklikleri <a class="link" href="#/users">Kullanıcı Yönetimi</a> sayfasından yapılır.</p>
    </section>
  </div>`;
}

// ---------- detay paneli ----------
const DETAILS = {
  customer(id) {
    const c = partnerOf(id);
    if (!c) return null;
    const s = creditStatus(c);
    const avail = c.creditLimit - c.openBalance;
    const rep = userOf(c.salesRep);
    const blocker = userOf(c.blockedBy);
    const tone = s.tone.replace('-solid', '');
    return (
      drawerHead(`Müşteri · ${c.id}`, c.name, badge(s.label, s.tone) + badge(`Segment ${c.segment}`, 'neutral') + badge(channelName(c.channel), 'neutral')) +
      `<div class="drawer-body">
        ${c.prospect ? alertBox('info', 'Aday müşteri', `${esc(c.note || '')} Kaynak: ${esc(c.source || '—')}. Tahmini yıllık hacim ${money(c.estimatedAnnualVolume || 0)}.`) : ''}
        ${c.blocked ? alertBox('danger', 'Müşteri bloke', `${esc(c.blockReason)}. ${date(c.blockedSince)} tarihinde ${esc(blocker?.name || '')} tarafından bloke edildi. Yeni sipariş ve teslimat yapılamaz.`) : ''}
        ${!c.blocked && s.key === 'over' ? alertBox('danger', 'Kredi limiti aşıldı', esc(c.note || 'Açık bakiye kredi limitini aşıyor.')) : ''}
        ${s.key === 'risk' ? alertBox('warning', 'Limite yaklaşıyor', `Kredi kullanımı ${pct(s.ratio * 100)}. Büyük siparişler limit kontrolüne takılabilir.`) : ''}
        ${dsec(
          'Kredi durumu',
          `<div class="credit-meter" style="--accent:var(--tone-${tone})">
            <div class="credit-meter-top"><span class="kpi-value">${pct(s.ratio * 100)}</span><span class="cell-sub">kullanım</span></div>
            ${progressBar(Math.min(s.ratio * 100, 100), `var(--tone-${tone})`)}
          </div>` +
            kv([
              ['Kredi limiti', money(c.creditLimit)],
              ['Açık bakiye', money(c.openBalance)],
              ['Kullanılabilir limit', `<span class="${avail < 0 ? 'neg' : ''}">${money(avail)}</span>`],
              ['Vadesi geçmiş', `<span class="${c.overdue > 0 ? 'neg' : ''}">${money(c.overdue)}</span>`],
              ['Ödeme koşulu', `<span class="code">${esc(c.paymentTerm)}</span> ${esc(termName(c.paymentTerm))}`],
            ])
        )}
        ${dsec(
          'Genel bilgiler',
          kv([
            ['Vergi no', esc(c.taxNo)],
            ['Vergi dairesi', esc(c.taxOffice)],
            ['Bölge / şehir', `${esc(c.region)} · ${esc(c.city)}`],
            ['ERP müşteri no', erpNumberOf(c) ? `<span class="code">${esc(erpNumberOf(c))}</span>` : `<span class="neg">Tanımlı değil</span>`],
            ['Satış alanı', `<span class="code">${esc(D.organization.salesOrg.code)}/${esc(c.channel)}/${D.organization.divisions.map((d) => d.code).join('-')}</span>`],
            c.plant ? ['Teslimat deposu', `<span class="code">${esc(c.plant)}</span> ${esc(D.organization.warehouses.find((w) => w.code === c.plant)?.name || '')}`] : null,
            ['Satış temsilcisi', esc(rep ? `${rep.name} (${rep.role})` : '—')],
            ['Müşteri tarihi', esc(c.customerSince)],
          ])
        )}
        ${dsec('İlgili kişiler', contactList(c.contacts))}
        ${baseMode ? '' : `<a class="btn btn-ghost" href="#/track/sap-c4c/simulation?account=${encodeURIComponent(c.id)}">${icon('cloud')}<span>Hesap 360 (C4C)</span></a>`}
        ${baseMode ? '' : dsec(
          'İşlemler',
          `${c.erpOpenedBy ? alertBox('success', `ERP'de açıldı · ${esc(c.erpNumber)}`, `${esc(userLabel(c.erpOpenedBy))} · ${datetime(c.erpOpenedAt)}`) : ''}
          ${c.unblockedBy ? alertBox('info', 'Blokaj kaldırıldı', `${esc(userLabel(c.unblockedBy))} · ${datetime(c.unblockedAt)}${c.unblockNote ? ` · “${esc(c.unblockNote)}”` : ''}`) : ''}
          ${c.editedBy ? `<p class="cell-sub">Son ana veri değişikliği: ${esc(userLabel(c.editedBy))} · ${datetime(c.editedAt)}</p>` : ''}
          <div class="drawer-actions">
            ${!erpNumberOf(c) ? actionBtn({ perm: 'MASTERDATA_EDIT', label: "ERP'de müşteri aç", iconName: 'building', attrs: `data-act="erp-open" data-id="${esc(c.id)}"` }) : ''}
            ${c.blocked ? actionBtn({ perm: 'CREDIT_RELEASE', label: 'Blokajı kaldır', iconName: 'shield', attrs: `data-act="unblock" data-id="${esc(c.id)}"` }) : ''}
            ${actionBtn({ perm: 'MASTERDATA_EDIT', label: 'Ana veriyi düzenle', iconName: 'edit', cls: 'btn-ghost', attrs: `data-act="md-edit" data-id="${esc(c.id)}"` })}
          </div>
          <div data-md-panel></div>`
        )}
      </div>`
    );
  },

  product(code) {
    const p = productOf(code);
    if (!p) return null;
    const s = stockStatus(p);
    const sup = supplierOf(p.supplier);
    const camp = activeCampaign(p.code);
    const maxStock = Math.max(...Object.values(p.stock), 1);
    return (
      drawerHead(`Ürün · ${p.code}`, p.name, badge(s.label, s.tone) + badge(divisionName(p.division), 'neutral') + (camp ? badge('Kampanyada', 'info') : '')) +
      `<div class="drawer-body">
        ${s.key === 'critical' ? alertBox('danger', 'Stok kritik seviyede', `Toplam stok ${num(stockTotal(p))} ${esc(unitName(p.unit).toLocaleLowerCase('tr-TR'))}; yeniden sipariş noktası ${num(p.reorderPoint)}. Satın alma talebi açılmalı.`) : ''}
        ${dsec(
          'Depo stokları',
          `<ul class="stock-list">${D.organization.warehouses
            .map((w) => {
              const q = p.stock[w.code] ?? 0;
              return `<li><div class="stock-row"><span>${esc(w.name)} <span class="code">${esc(w.code)}</span></span><strong class="${q === 0 ? 'neg' : ''}">${num(q)} ${esc(p.unit)}</strong></div>${progressBar((q / maxStock) * 100, q === 0 ? 'var(--tone-danger)' : 'var(--primary)')}</li>`;
            })
            .join('')}</ul>` +
            kv([
              ['Toplam', `<strong>${num(stockTotal(p))} ${esc(p.unit)}</strong>`],
              ['Yeniden sipariş noktası', `${num(p.reorderPoint)} ${esc(p.unit)}`],
            ])
        )}
        ${dsec(
          'Ürün bilgileri',
          kv([
            ['Kategori', esc(p.category)],
            ['Satış birimi', `${esc(unitName(p.unit))} (${esc(p.unit)})`],
            ['Ambalaj', esc(p.pack)],
            ['KDV oranı', `%${p.vatRate}`],
            ['Tedarikçi', sup ? `<button class="link" type="button" data-open="supplier" data-id="${esc(sup.id)}">${esc(sup.name)}</button>` : '—'],
          ])
        )}
        ${dsec(
          'Net fiyatlar (bayi kanalı)',
          `<div class="seg-prices">${['A', 'B', 'C']
            .map((sg) => {
              const r = priceFor(p.code, sg, '10');
              return `<div class="seg-price">${segBadge(sg)}<span class="kpi-value sm">${money(r.net)}</span><span class="cell-sub">KDV dahil ${money(r.gross)}</span></div>`;
            })
            .join('')}</div>
          <p class="cell-sub mt-sm">Liste fiyatı ${money(D.pricing.listPrices.prices[p.code])}${camp ? ` · ${esc(camp.name)} dahil (en az ${camp.minQty} birim)` : ''}</p>`
        )}
      </div>`
    );
  },

  price(code) {
    const p = productOf(code);
    if (!p) return null;
    const f = state.prices;
    const r = priceFor(code, f.segment, f.channel);
    return (
      drawerHead(`Fiyat · ${p.code}`, p.name, badge(`Segment ${f.segment}`, 'neutral') + badge(channelName(f.channel), 'neutral') + (r.camp ? badge('Kampanyada', 'info') : '')) +
      `<div class="drawer-body">
        ${dsec(
          'Fiyatlandırma adımları',
          `<table class="cond-table">
            <tbody>
              ${r.steps
                .map(
                  (s) => `<tr>
                <td><span class="code">${esc(s.cond)}</span></td>
                <td>${esc(s.label)}${s.note ? `<div class="cell-sub">${esc(s.note)}</div>` : ''}</td>
                <td class="num">${s.rate != null ? `%${s.rate}` : ''}</td>
                <td class="num">${money(s.amount)}</td>
              </tr>`
                )
                .join('')}
              <tr class="total"><td></td><td>Net fiyat</td><td></td><td class="num">${money(r.net)}</td></tr>
              <tr><td><span class="code">KDV</span></td><td>Katma değer vergisi</td><td class="num">%${r.vatRate}</td><td class="num">${money(r.vat)}</td></tr>
              <tr class="total"><td></td><td>KDV dahil</td><td></td><td class="num">${money(r.gross)}</td></tr>
            </tbody>
          </table>
          <p class="cell-sub mt-sm">Tutarlar 1 ${esc(unitName(p.unit).toLocaleLowerCase('tr-TR'))} (${esc(p.pack)}) içindir.${r.camp ? ` Kampanya yalnızca ${r.camp.minQty} birim ve üzeri siparişte uygulanır.` : ''}</p>`
        )}
      </div>`
    );
  },

  supplier(id) {
    const s = supplierOf(id);
    if (!s) return null;
    return (
      drawerHead(`Tedarikçi · ${s.id}`, s.name, badge(`Puan ${s.rating}`, s.rating === 'A' ? 'success' : 'info') + badge(s.category, 'neutral')) +
      `<div class="drawer-body">
        ${dsec(
          'Genel bilgiler',
          kv([
            ['Vergi no / daire', `${esc(s.taxNo)} · ${esc(s.taxOffice)}`],
            ['Şehir', esc(s.city)],
            ['Ödeme koşulu', `<span class="code">${esc(s.paymentTerm)}</span> ${esc(termName(s.paymentTerm))}`],
            ['Tedarik süresi', `${s.leadTimeDays} gün`],
            ['Satın alma org.', `<span class="code">${esc(D.organization.purchasingOrg.code)}</span> ${esc(D.organization.purchasingOrg.name)}`],
          ])
        )}
        ${dsec(
          `Tedarik edilen ürünler (${s.products.length})`,
          `<div class="chips">${s.products.map((c) => `<button class="chip" type="button" data-open="product" data-id="${esc(c)}">${esc(productOf(c)?.name || c)}</button>`).join('')}</div>`
        )}
        ${dsec('İlgili kişiler', contactList(s.contacts))}
      </div>`
    );
  },

  user(id) {
    const u = userOf(id);
    if (!u) return null;
    return (
      drawerHead(`Kullanıcı · ${u.username}`, u.name, rolesOfUser(u.id).map((r) => badge(r.name, 'info')).join('') + badge(u.department || '—', 'neutral') + (u.active === false ? badge('Pasif', 'danger') : '')) +
      `<div class="drawer-body">
        ${dsec(
          'Bilgiler',
          kv([
            ['Kullanıcı adı', `<span class="code">${esc(u.username)}</span>`],
            ['Unvan', esc(u.title || u.role || '—')],
            ['Departman', esc(u.department || '—')],
            u.email ? ['E-posta', `<a class="link" href="mailto:${esc(u.email)}">${esc(u.email)}</a>`] : null,
            u.phone ? ['Telefon', esc(u.phone)] : null,
            ['Onay limiti', u.approvalLimit ? money(u.approvalLimit) : '<span class="muted">Yok</span>'],
          ])
        )}
        ${u.responsibilities?.length ? dsec('Sorumluluklar', `<ul class="bullets">${u.responsibilities.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>`) : ''}
        ${dsec('Yetkiler', `<div class="chips">${[...permsOfUser(u.id)].map((p) => `<span class="chip static" title="${esc(p)}">${esc(permOf(p)?.label || p)}</span>`).join('') || '<span class="muted">Yetki yok</span>'}</div>`)}
      </div>`
    );
  },
};

// Şirket kaydının detayını panelde açar; diğer modüller de kullanabilir
// opts.base: orijinal company.json verisiyle göster (Hata Avı), işlem düğmeleri gizlenir
export async function openDetail(kind, id, opts = {}) {
  await loadCompany();
  const html = opts.base ? useBase(() => DETAILS[kind]?.(id)) : DETAILS[kind]?.(id);
  if (html) openDrawer(html, (el) => onDrawerAction(el, kind, id, opts));
}

function nextErpCustomerNo() {
  const nums = [...D.customers.map((c) => c.id), ...(D.prospects || []).map((c) => c.erpNumber)].map(Number).filter(Boolean);
  return String(Math.max(100000, ...nums) + 1);
}

function onDrawerAction(el, kind, id, opts = {}) {
  if (el.dataset.open) return openDetail(el.dataset.open, el.dataset.id, opts);
  if (opts.base) return;
  const act = el.dataset.act;
  const panel = el.closest('.drawer-inner')?.querySelector('[data-md-panel]');
  const c = partnerOf(id);
  if (!c || !panel) return;

  if (act === 'erp-open' && can('MASTERDATA_EDIT')) {
    const no = nextErpCustomerNo();
    panel.innerHTML = `<div class="md-form">
      <strong>ERP'de müşteri aç</strong>
      ${kv([
        ['ERP müşteri no', `<span class="code">${esc(no)}</span> (otomatik)`],
        ['Satış alanı', `<span class="code">${esc(D.organization.salesOrg.code)}/${esc(c.channel)}/${D.organization.divisions.map((d) => d.code).join('-')}</span>`],
        ['Ödeme koşulu', `<span class="code">Z000</span> ${esc(termName('Z000'))}`],
        ['Kredi limiti', `${money(0)} · muhasebe ayrıca belirler`],
      ])}
      <p class="cell-sub">Vergi levhası ve imza sirküleri kontrol edildi varsayılır. Kredi limiti tanımlanana kadar müşteri peşin çalışır.</p>
      <div class="drawer-actions"><button class="btn btn-primary" type="button" data-act="erp-open-ok">${icon('check')}<span>Müşteriyi ERP'de aç</span></button></div>
    </div>`;
  } else if (act === 'erp-open-ok' && can('MASTERDATA_EDIT') && !erpNumberOf(c)) {
    const no = nextErpCustomerNo();
    updateCustomer(id, { prospect: false, erpNumber: no, paymentTerm: 'Z000', creditLimit: 0, erpOpenedBy: currentUser().id, erpOpenedAt: new Date().toISOString() });
    toast(`${c.name} ERP'de ${no} numarasıyla açıldı`);
    openDetail(kind, id);
  } else if (act === 'unblock' && can('CREDIT_RELEASE')) {
    panel.innerHTML = `<div class="md-form">
      <label class="field"><span class="field-label">Blokaj kaldırma gerekçesi <span class="req">*</span></span>
      <textarea class="input textarea" rows="2" data-md-note placeholder="Ör. Vadesi geçmiş tutar tahsil edildi, teminat alındı."></textarea></label>
      <div class="drawer-actions"><button class="btn btn-primary" type="button" data-act="unblock-ok">${icon('shield')}<span>Blokajı kaldır</span></button></div>
    </div>`;
    panel.querySelector('textarea').focus();
  } else if (act === 'unblock-ok' && can('CREDIT_RELEASE')) {
    const note = panel.querySelector('[data-md-note]').value.trim();
    if (!note) return toast('Gerekçe yaz');
    updateCustomer(id, { blocked: false, unblockedBy: currentUser().id, unblockedAt: new Date().toISOString(), unblockNote: note });
    toast(`${c.name}: blokaj kaldırıldı`);
    openDetail(kind, id);
  } else if (act === 'md-edit' && can('MASTERDATA_EDIT')) {
    const o = D.organization;
    const sel = (name, val, opts) => `<select class="select" data-md="${name}">${opts.map(([v, l]) => `<option value="${esc(v)}" ${v === val ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
    panel.innerHTML = `<div class="md-form">
      <div class="form-grid">
        <label class="field"><span class="field-label">Segment</span>${sel('segment', c.segment, ['A', 'B', 'C'].map((s) => [s, `Segment ${s} (−%${D.pricing.segmentDiscounts.rates[s]})`]))}</label>
        <label class="field"><span class="field-label">Ödeme koşulu</span>${sel('paymentTerm', c.paymentTerm, o.paymentTerms.map((t) => [t.code, `${t.code} · ${t.name}`]))}</label>
        <label class="field"><span class="field-label">Teslimat deposu</span>${sel('plant', c.plant, o.warehouses.map((w) => [w.code, `${w.code} · ${w.name}`]))}</label>
      </div>
      <p class="cell-sub">Değişiklik bu tarayıcıda saklanır; fiyat ve kredi hesapları hemen yeni değerle çalışır.</p>
      <div class="drawer-actions"><button class="btn btn-primary" type="button" data-act="md-save">${icon('check')}<span>Kaydet</span></button></div>
    </div>`;
  } else if (act === 'md-save' && can('MASTERDATA_EDIT')) {
    const patch = {};
    panel.querySelectorAll('[data-md]').forEach((s) => {
      if (c[s.dataset.md] !== s.value) patch[s.dataset.md] = s.value;
    });
    if (!Object.keys(patch).length) return toast('Değişiklik yok');
    updateCustomer(id, { ...patch, editedBy: currentUser().id, editedAt: new Date().toISOString() });
    toast(`${c.name}: ana veri güncellendi`);
    openDetail(kind, id);
  }
}

// ---------- görünüm ----------
export async function viewCompany(route, setView) {
  const tabId = route.tab;
  if (!COMPANY_TABS.some((t) => t.id === tabId)) {
    location.replace(href('company', { tab: 'org' }));
    return;
  }

  try {
    await loadCompany();
  } catch (e) {
    console.error(e);
    setView(`<section class="panel card">${emptyState('inbox', 'Şirket verisi yüklenemedi', 'Bağlantını kontrol edip sayfayı yenile.')}</section>`, 'Şirket');
    return;
  }

  const tab = COMPANY_TABS.find((t) => t.id === tabId);
  const c = D.organization.company;

  const tabs = COMPANY_TABS.map(
    (t) => `<a class="tab ${t.id === tab.id ? 'is-active' : ''}" role="tab" aria-selected="${t.id === tab.id}" href="${href('company', { tab: t.id })}">${icon(t.icon)}<span>${t.label}</span></a>`
  ).join('');

  let body;
  if (tab.id === 'org') body = orgBody();
  else body = (tab.id === 'customers' ? customersHeader() : tab.id === 'prices' ? pricesHeader() : '') + toolbar(tab.id) + tableCard(tab.id);

  setView(
    `<div data-company="${tab.id}">
      <header class="page-head">
        <div>
          <p class="eyebrow">Ortak şirket verisi</p>
          <h1>${esc(c.name)}</h1>
          <p class="lead">${esc(c.business)} · ${esc(D.organization.warehouses.map((w) => w.city).filter((v, i, a) => a.indexOf(v) === i).join(', '))}. Tüm öğrenme yollarındaki örnekler bu şirket üzerinden ilerler.</p>
          ${hasMasterDataChanges() ? `<div class="role-banner">${icon('edit')}<span>Bu tarayıcıda ana veri değişikliği var (segment, ödeme koşulu, depo veya blokaj). Hesaplar değişmiş veriyle çalışır.</span><button class="btn btn-ghost" type="button" data-md-reset>${icon('close')}<span>Orijinal veriye dön</span></button></div>` : ''}
        </div>
      </header>
      <nav class="tabs" role="tablist" aria-label="Şirket bölümleri">${tabs}</nav>
      <div class="company-body">${body}</div>
    </div>`,
    `Şirket · ${tab.label}`
  );

  bind(tab.id);
}

function bind(tab) {
  const root = document.querySelector(`[data-company="${tab}"]`);
  if (!root) return;

  root.addEventListener('click', (e) => {
    if (e.target.closest('[data-md-reset]')) {
      resetMasterData({ keepProducts: true });
      toast('Müşteri ana verisi orijinal haline döndü (stok hareketleri korunur)');
      return;
    }
    if (e.target.closest('[data-reset]')) {
      const keep = tab === 'prices' ? { segment: state.prices.segment, channel: state.prices.channel } : {};
      Object.keys(state[tab]).forEach((k) => (state[tab][k] = keep[k] ?? ''));
      root.querySelectorAll('[data-filter]').forEach((el) => (el.value = state[tab][el.dataset.filter]));
      refresh(tab, root);
      return;
    }
    const o = e.target.closest('[data-open]');
    if (o) openDetail(o.dataset.open, o.dataset.id);
  });

  root.addEventListener('keydown', (e) => {
    const row = e.target.closest('tr[data-open]');
    if (row && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      openDetail(row.dataset.open, row.dataset.id);
    }
  });

  root.querySelectorAll('[data-filter]').forEach((el) => {
    el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', () => {
      state[tab][el.dataset.filter] = el.value;
      refresh(tab, root);
    });
  });

  if (LISTS[tab]) refresh(tab, root);
}

function refresh(tab, root) {
  const L = LISTS[tab];
  const f = state[tab];
  const all = L.items();
  const list = all.filter((x) => L.filter(x, f));
  root.querySelector('[data-rows]').innerHTML = list.map((x) => L.row(x, f)).join('');
  root.querySelector('.table-wrap').hidden = list.length === 0;
  root.querySelector('[data-noresult]').hidden = list.length !== 0;
  const filtered = Object.entries(f).some(([k, v]) => v && !(tab === 'prices' && k !== 'q'));
  root.querySelector('[data-count]').innerHTML = filtered
    ? `${all.length} kayıttan <strong>${list.length}</strong> gösteriliyor`
    : `<strong>${all.length}</strong> kayıt`;
}
