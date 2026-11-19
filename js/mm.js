// Satın Alma & Stok (MM) çalışma alanı (s4-mm > Simülasyon, simulation.type = "mm")
// Stok genel bakış (MMBE), satın alma talebi (ME51N), sipariş (ME21N), serbest bırakma,
// mal girişi (MIGO 101), fatura doğrulama (MIRO, üç yönlü eşleştirme) ve tesisler arası transfer (301).
import { icon } from './icons.js';
import { stripQuery } from './router.js';
import { progress } from './store.js';
import {
  esc, money2 as money, num, date, datetime, norm, round2, badge, emptyState, toast, openDrawer, closeDrawer, drawerHead,
  kv, dsec, alertBox,
} from './ui.js';
import { loadRoles, can, actionBtn, currentUser, userLabel, holders, roleById, lockReason } from './auth.js';
import { loadCompany, company, productOf, supplierOf, updateProduct, stockTotal, termOf, termName, unitName, openDetail } from './company.js';
import { registerDocType, openDocRef, messages, getOrder, openDoc, fiNodesHtml } from './erp.js';
import { resetAllDemo } from './demo-reset.js';

const KEY = 'erp-akademi:mm';
const START = { pr: 10000001, po: 4500000001, mdoc: 5000000001, sinv: 5105600001 };
const PR_STATUS = { pending: { label: 'Onay bekliyor', tone: 'warning' }, released: { label: 'Onaylandı', tone: 'success' }, rejected: { label: 'Reddedildi', tone: 'danger' }, ordered: { label: 'Siparişe dönüştü', tone: 'info' } };
const PO_STATUS = { pending: { label: 'Onay bekliyor', tone: 'warning' }, released: { label: 'Onaylandı', tone: 'success' }, rejected: { label: 'Reddedildi', tone: 'danger' } };
const INV_STATUS = { posted: { label: 'Ödemeye açık', tone: 'success' }, blocked: { label: 'Ödemeye bloke', tone: 'danger' }, released: { label: 'Blokaj kaldırıldı', tone: 'info' } };
const MVT = { 101: 'Mal girişi (sipariş)', 301: 'Tesisler arası transfer' };
const HIST = {
  created: 'Oluşturdu', released: 'Onayladı (serbest bıraktı)', 'auto-released': 'Onay gerekmedi', rejected: 'Reddetti', ordered: 'Siparişe dönüştürdü',
  sent: 'Tedarikçiye gönderdi', gr: 'Mal girişi', invoice: 'Fatura', posted: 'Kaydetti', blocked: 'Ödemeye bloke edildi', unblocked: 'Blokajı kaldırdı',
};

let MMD = null; // s4-mm.json
let tab = 'stock';
let onlyCritical = false;
let q = '';
let grPo = '';
let invPo = '';
let trPrefill = null;
let rootRef = null;

const clone = (o) => JSON.parse(JSON.stringify(o));
const nowIso = () => new Date().toISOString();
const me = () => currentUser();
const today = () => company().asOf;
const rules = () => ({ prReleaseLimit: 50000, poReleaseLimit: 20000, tolerancePct: 2, ...(MMD?.sections?.simulation?.rules || {}) });
const whs = () => company().organization.warehouses;
const whName = (code) => whs().find((w) => w.code === code)?.name || code;
const actor = (by) => (by === 'SYSTEM' ? 'Devralınan kayıt' : userLabel(by));
const sum = (list, f) => list.reduce((a, x) => a + f(x), 0);
function addDays(iso, n) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export async function loadMM() {
  if (!MMD) {
    const r = await fetch('data/tracks/s4-mm.json', { cache: 'no-cache' });
    MMD = await r.json();
  }
  await Promise.all([loadCompany(), loadRoles()]);
  return MMD;
}

// ---------- depolama ----------
function seedState() {
  const sd = clone(MMD?.sections?.simulation?.seed || {});
  const s = { v: 1, prs: sd.prs || [], pos: sd.pos || [], mdocs: sd.matdocs || [], invs: sd.invoices || [], seq: {} };
  const max = (list, k) => Math.max(START[k] - 1, ...list.map((x) => Number(x.no) || 0));
  s.seq = { pr: max(s.prs, 'pr'), po: max(s.pos, 'po'), mdoc: max(s.mdocs, 'mdoc'), sinv: max(s.invs, 'sinv') };
  return s;
}
function read() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (s && s.v === 1) return s;
  } catch {}
  const s = seedState();
  // Yol verisi yüklenmeden (ör. Onay Kutusu sayacı) boş durum kaydedilmez
  if (MMD) write(s);
  return s;
}
function write(s) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {}
}
function nextNo(s, kind) {
  s.seq[kind] = Math.max((s.seq[kind] || 0) + 1, START[kind]);
  return kind === 'pr' ? String(s.seq[kind]).padStart(10, '0') : String(s.seq[kind]);
}
const refresh = () => document.dispatchEvent(new CustomEvent('erp:refresh'));
function markDone() {
  if (progress.isDone('s4-mm', 'simulation')) return;
  progress.setDone('s4-mm', 'simulation', true);
  document.dispatchEvent(new CustomEvent('erp:progress'));
}

// ---------- hesaplar ----------
const getPr = (no, s = read()) => s.prs.find((x) => x.no === no) || null;
const getPo = (no, s = read()) => s.pos.find((x) => x.no === no) || null;
const getMdoc = (no, s = read()) => s.mdocs.find((x) => x.no === no) || null;
const getInv = (no, s = read()) => s.invs.find((x) => x.no === no) || null;
const priceOf = (code, supId) => supplierOf(supId)?.prices?.[code] ?? null;
const suppliersFor = (code) => company().suppliers.filter((x) => x.products.includes(code));
const poNet = (po) => round2(sum(po.lines, (l) => l.qty * l.price));
const grFor = (po, s) => s.mdocs.filter((d) => d.type === '101' && d.poNo === po.no);
const received = (po, pos, s) => sum(grFor(po, s), (d) => sum(d.lines.filter((l) => l.pos === pos), (l) => l.qty));
const invsFor = (po, s) => s.invs.filter((i) => i.poNo === po.no);
const invoiced = (po, pos, s) => sum(invsFor(po, s), (i) => sum(i.lines.filter((l) => l.pos === pos), (l) => l.qty));
const openQty = (po, l, s) => l.qty - received(po, l.pos, s);
const poOpen = (po, s) => po.lines.some((l) => openQty(po, l, s) > 0);
const blockedStock = (p, plant) => p.blockedStock?.[plant] || 0;
// Yolda: tedarikçiye gönderilmiş siparişin henüz teslim alınmamış miktarı
const inTransit = (code, plant, s) => sum(s.pos.filter((po) => po.status === 'released' && po.sentAt && po.plant === plant), (po) => sum(po.lines.filter((l) => l.code === code), (l) => openQty(po, l, s)));
// Açık ihtiyaç kapsamı: açık/onaylı talepler + teslim alınmamış siparişler
const covered = (code, s) =>
  s.prs.some((pr) => pr.code === code && ['pending', 'released'].includes(pr.status)) ||
  s.pos.some((po) => po.status !== 'rejected' && po.lines.some((l) => l.code === code && openQty(po, l, s) > 0));
function suggestion(p, s) {
  const total = stockTotal(p);
  if (total > p.reorderPoint) return null;
  const onOrder = sum(whs(), (w) => sum(s.pos.filter((po) => po.status !== 'rejected' && po.plant === w.code), (po) => sum(po.lines.filter((l) => l.code === p.code), (l) => openQty(po, l, s))));
  const qty = Math.max(p.reorderPoint, Math.ceil((p.reorderPoint * 2 - total - onOrder) / 50) * 50);
  return { qty, plant: whs()[0].code, supplier: suppliersFor(p.code)[0]?.id || p.supplier };
}

// ---------- giriş noktası ----------
export async function renderMM(c) {
  MMD = c.data || MMD;
  await loadMM();
  const qy = c.route?.query || {};
  let openAfter = null;
  if (qy.scenario) {
    const sc = MMD.sections.scenarios.items.find((x) => x.id === qy.scenario);
    if (sc?.simulation?.tab) tab = sc.simulation.tab;
  }
  if (qy.tab) tab = qy.tab;
  for (const t of ['pr', 'po', 'mdoc', 'sinv']) if (qy[t]) openAfter = [t, qy[t]];
  if (Object.keys(qy).length && c.route !== EMBED_ROUTE) stripQuery();
  read();
  return {
    html: `<div class="mm" data-mm>${headHtml()}<div data-mm-body></div></div>`,
    bind(container) {
      rootRef = container.querySelector('[data-mm]');
      bindRoot(rootRef);
      drawBody();
      if (openAfter) openDocRef(`${openAfter[0]}:${openAfter[1]}`);
    },
  };
}
const EMBED_ROUTE = { query: {} };
// Test Laboratuvarı gibi modüllerin gömülü kullanımı için bağlam
export const embedContext = () => (MMD ? { track: { id: 's4-mm' }, content: MMD.sections.simulation, data: MMD, route: EMBED_ROUTE } : null);

function roleBox(roleId, perm, what) {
  if (holders(perm).length) return '';
  const r = roleById(roleId);
  return `<div class="role-banner tl-warn">${icon('user')}<span><strong>${esc(r?.name || roleId)} rolünde kullanıcı yok.</strong> ${esc(what)} (${esc(perm)}). Kullanıcı Yönetimi'nden oluştur${can('USER_ADMIN') ? '' : ' (USER_ADMIN gerekir: Key User rolüne geç)'}.</span>
    <a class="btn btn-primary" href="#/users?new=${esc(roleId)}">${icon('users')}<span>Kullanıcı Yönetimi'nden oluştur</span></a></div>`;
}

function headHtml() {
  const s = read();
  const nPend = mmInbox().length;
  const nCrit = company().products.filter((p) => stockTotal(p) <= p.reorderPoint).length;
  const nBlocked = s.invs.filter((i) => i.status === 'blocked').length;
  const t = (id, label, ic, n = '', danger = false) =>
    `<button type="button" role="tab" data-tab="${id}" aria-selected="${tab === id}" class="${tab === id ? 'is-active' : ''}">${icon(ic)}<span>${label}</span>${n ? ` <span class="count${danger ? ' danger-count' : ''}">${n}</span>` : ''}</button>`;
  return `
    <div class="c4c-head">
      <div class="c4c-who">
        <span class="c4c-logo mm-logo">${icon('box')}</span>
        <div><strong>S/4HANA · Satın Alma ve Stok</strong><span class="cell-sub">${esc(me()?.name || '—')} · sistem tarihi ${date(today())}${nPend ? ` · onayını bekleyen ${nPend} belge` : ''}</span></div>
      </div>
      <button class="link small" type="button" data-reset-mm title="Tüm modüllerin işlem verisini sıfırlar (Ayarlar)">Demo verisini sıfırla</button>
    </div>
    ${roleBox('purchaser', 'PR_CREATE', 'Satın alma talebi ve siparişi oluşturacak kimse yok')}
    ${roleBox('purchasing-manager', 'PR_RELEASE', 'Eşiği aşan talep ve siparişleri onaylayacak kimse yok')}
    <div class="toolbar">
      <div class="seg-ctrl c4c-tabs" role="tablist" aria-label="MM çalışma alanı">
        ${t('stock', 'Stok', 'warehouse', nCrit || '', true)}${t('pr', 'Talepler', 'inbox', s.prs.filter((x) => x.status === 'pending').length || '')}${t('po', 'Siparişler', 'cart', s.pos.filter((x) => x.status === 'pending').length || '')}${t('gr', 'Mal girişi', 'truck')}${t('invoice', 'Fatura', 'book', nBlocked || '', true)}${t('transfer', 'Transfer', 'route')}
      </div>
    </div>`;
}

function drawBody() {
  if (!rootRef?.isConnected) return;
  const body = rootRef.querySelector('[data-mm-body]');
  body.innerHTML = viewHtml(tab, read());
  if (tab === 'invoice') updateMatch(body);
  if (tab === 'transfer') updateTransfer(body);
}
function viewHtml(t, s) {
  return t === 'pr' ? prView(s) : t === 'po' ? poView(s) : t === 'gr' ? grView(s) : t === 'invoice' ? invView(s) : t === 'transfer' ? trView(s) : stockView(s);
}
function refreshAll() {
  if (!rootRef?.isConnected) return;
  const tmp = document.createElement('div');
  tmp.innerHTML = headHtml();
  [...rootRef.children].filter((el) => !el.matches('[data-mm-body]')).forEach((el) => el.remove());
  rootRef.prepend(...tmp.children);
  drawBody();
}

// ---------- stok genel bakış (MMBE) ----------
function stockView(s) {
  const qq = norm(q);
  const list = company().products.filter((p) => (!qq || norm(`${p.code} ${p.name}`).includes(qq)) && (!onlyCritical || stockTotal(p) <= p.reorderPoint));
  const W = whs();
  return `<div class="toolbar">
      <label class="search">${icon('search')}<input type="search" data-mmq value="${esc(q)}" placeholder="Malzeme kodu veya adı" autocomplete="off"></label>
      <label class="chip-check"><input type="checkbox" data-crit ${onlyCritical ? 'checked' : ''}><span>Yalnızca yeniden sipariş noktasının altındakiler</span></label>
    </div>
    <div class="card table-card"><div class="table-wrap"><table class="table tl-table mm-stock">
      <thead><tr><th>Malzeme</th>${W.map((w) => `<th class="num">${esc(w.code)} <span class="hide-md">${esc(w.name.split(' ')[0])}</span></th>`).join('')}<th class="num">Toplam serbest</th><th class="num hide-sm">YSN</th><th>Durum</th></tr></thead>
      <tbody>${list
        .map((p) => {
          const total = stockTotal(p);
          const crit = total <= p.reorderPoint;
          const sug = suggestion(p, s);
          const cov = covered(p.code, s);
          return `<tr class="${crit ? 'is-crit' : ''}" data-stock="${esc(p.code)}" tabindex="0">
            <td><span class="code">${esc(p.code)}</span> <strong>${esc(p.name)}</strong><div class="cell-sub">${esc(unitName(p.unit))} · ${esc(supplierOf(p.supplier)?.name.split(' ')[0] || '')}</div></td>
            ${W.map((w) => {
              const free = p.stock[w.code] ?? 0;
              const bl = blockedStock(p, w.code);
              const tr = inTransit(p.code, w.code, s);
              return `<td class="num"><strong class="${free === 0 ? 'neg' : ''}">${num(free)}</strong>${bl || tr ? `<div class="cell-sub">${bl ? `bloke ${num(bl)}` : ''}${bl && tr ? ' · ' : ''}${tr ? `yolda ${num(tr)}` : ''}</div>` : ''}</td>`;
            }).join('')}
            <td class="num"><strong class="${crit ? 'neg' : ''}">${num(total)}</strong></td>
            <td class="num hide-sm">${num(p.reorderPoint)}</td>
            <td>${crit
              ? cov
                ? badge('Talep / sipariş açık', 'info')
                : `<div class="mm-sug">${badge('YSN altında', 'danger')}${actionBtn({ perm: 'PR_CREATE', label: `Talep oluştur · ${num(sug.qty)}`, iconName: 'inbox', cls: 'btn-primary btn-sm', attrs: `data-suggest="${esc(p.code)}"` })}</div>`
              : badge('Yeterli', 'success')}</td>
          </tr>`;
        })
        .join('') || `<tr><td colspan="${W.length + 4}" class="muted">Eşleşen malzeme yok.</td></tr>`}</tbody>
    </table></div>
    <div class="table-foot">Serbest: satılabilir stok · bloke: kullanılamaz (kalite/hasar) · yolda: tedarikçiye gönderilmiş siparişin teslim alınmamış miktarı · YSN: yeniden sipariş noktası (toplam serbest stok için).</div></div>`;
}

function openStock(code) {
  const p = productOf(code);
  if (!p) return;
  const s = read();
  const sug = suggestion(p, s);
  const pos = s.pos.filter((po) => po.lines.some((l) => l.code === code));
  const docs = s.mdocs.filter((d) => d.lines.some((l) => l.code === code)).slice(-6).reverse();
  const html =
    drawerHead(`Stok · ${p.code}`, p.name, stockTotal(p) <= p.reorderPoint ? badge('Yeniden sipariş noktasının altında', 'danger') : badge('Yeterli', 'success')) +
    `<div class="drawer-body">
      ${dsec('Tesis bazında stok', `<table class="cond-table"><thead><tr><th>Tesis</th><th class="num">Serbest</th><th class="num">Bloke</th><th class="num">Yolda</th></tr></thead><tbody>${whs()
        .map((w) => `<tr><td><span class="code">${esc(w.code)}</span> ${esc(w.name)}</td><td class="num"><strong>${num(p.stock[w.code] ?? 0)}</strong></td><td class="num">${num(blockedStock(p, w.code))}</td><td class="num">${num(inTransit(code, w.code, s))}</td></tr>`)
        .join('')}<tr class="total"><td>Toplam</td><td class="num">${num(stockTotal(p))}</td><td class="num">${num(sum(whs(), (w) => blockedStock(p, w.code)))}</td><td class="num">${num(sum(whs(), (w) => inTransit(code, w.code, s)))}</td></tr></tbody></table>
        ${kv([['Yeniden sipariş noktası', `${num(p.reorderPoint)} ${esc(p.unit)}`], ['Tedarikçi', esc(supplierOf(p.supplier)?.name || '—')], ['Satın alma fiyatı', `${money(priceOf(code, p.supplier) || 0)} / ${esc(p.unit)} · teslim ${supplierOf(p.supplier)?.leadTimeDays} gün`]])}`)}
      ${sug && !covered(code, s) ? `<div class="drawer-actions">${actionBtn({ perm: 'PR_CREATE', label: `Talep oluştur · ${num(sug.qty)} ${esc(p.unit)}`, iconName: 'inbox', attrs: `data-act="suggest" data-code="${esc(code)}"` })}</div>` : ''}
      ${dsec('Siparişler', pos.length ? `<ul class="act-list">${pos.map((po) => `<li><button class="act-row" type="button" data-act="doc" data-doc="po:${esc(po.no)}"><span class="act-ico">${icon('cart')}</span><span class="act-text"><strong>${esc(po.no)}</strong><span class="cell-sub">${esc(supplierOf(po.supplier)?.name || '')} · ${esc(po.plant)} · açık ${num(sum(po.lines.filter((l) => l.code === code), (l) => openQty(po, l, s)))}</span></span>${badge(PO_STATUS[po.status].label, PO_STATUS[po.status].tone)}</button></li>`).join('')}</ul>` : '<p class="cell-sub">Sipariş yok.</p>')}
      ${dsec('Son stok hareketleri', docs.length ? mdocList(docs) : '<p class="cell-sub">Hareket yok.</p>')}
      <button class="btn btn-ghost" type="button" data-open="product" data-id="${esc(code)}">${icon('box')}<span>Ürün kaydı</span></button>
    </div>`;
  openDrawer(html, (el) => {
    if (el.dataset.open) return openDetail(el.dataset.open, el.dataset.id);
    if (el.dataset.act === 'doc') return openDocRef(el.dataset.doc);
    if (el.dataset.act === 'suggest') return openPrForm({ code });
  });
}

function mdocList(docs) {
  return `<ul class="act-list">${docs
    .map((d) => `<li><button class="act-row" type="button" data-act="doc" data-doc="mdoc:${esc(d.no)}"><span class="act-ico">${icon(d.type === '301' ? 'route' : 'truck')}</span><span class="act-text"><strong>${esc(d.no)} · ${esc(d.type)}</strong><span class="cell-sub">${esc(MVT[d.type])} · ${date(d.date)} · ${d.lines.map((l) => `${esc(l.code)} ${l.sign === -1 ? '−' : '+'}${num(l.qty)} (${esc(l.plant)})`).join(', ')}</span></span></button></li>`)
    .join('')}</ul>`;
}

// ---------- satın alma talebi ----------
export function createPR(v) {
  if (!can('PR_CREATE')) return { error: lockReason('PR_CREATE') };
  const p = productOf(v.code);
  if (!p) return { error: 'Malzeme seç' };
  if (!(v.qty > 0)) return { error: 'Miktar sıfırdan büyük olmalı' };
  if (!whs().some((w) => w.code === v.plant)) return { error: 'Tesis seç' };
  if (!v.needDate || v.needDate < today()) return { error: 'İstenen tarih bugünden önce olamaz' };
  const sup = supplierOf(v.supplier);
  if (!sup?.products.includes(v.code)) return { error: 'Önerilen tedarikçi bu malzemeyi tedarik etmiyor' };
  const s = read();
  const at = nowIso();
  const price = priceOf(v.code, sup.id);
  const value = round2(price * v.qty);
  const needsRelease = value > rules().prReleaseLimit;
  const pr = { no: nextNo(s, 'pr'), code: v.code, qty: Number(v.qty), plant: v.plant, needDate: v.needDate, supplier: sup.id, price, value, status: needsRelease ? 'pending' : 'released', note: v.note || '', createdBy: me().id, createdAt: at, history: [{ at, by: me().id, action: 'created', note: `${p.name} ${num(v.qty)} ${p.unit} · ${money(value)}` }] };
  if (!needsRelease) pr.history.push({ at, by: me().id, action: 'auto-released', note: `Tutar ${money(rules().prReleaseLimit)} eşiğinin altında` });
  s.prs.push(pr);
  write(s);
  return { pr };
}

function openPrForm(prefill = {}) {
  if (!can('PR_CREATE')) return toast(lockReason('PR_CREATE'));
  const s = read();
  const p0 = productOf(prefill.code) || company().products[0];
  const sug = suggestion(p0, s);
  const v = { code: p0.code, qty: sug?.qty || p0.reorderPoint, plant: sug?.plant || whs()[0].code, supplier: suppliersFor(p0.code)[0]?.id, ...prefill };
  const lead = (sup) => supplierOf(sup)?.leadTimeDays || 7;
  const html =
    drawerHead('Satın alma talebi · ME51N', 'Yeni talep', badge(`Onay eşiği ${money(rules().prReleaseLimit)}`, 'neutral')) +
    `<div class="drawer-body iam-form" data-prform>
      ${sug && prefill.code ? alertBox('info', 'Yeniden sipariş önerisi', `Toplam serbest stok ${num(stockTotal(p0))} ≤ yeniden sipariş noktası ${num(p0.reorderPoint)}. Öneri: ${num(sug.qty)} ${esc(p0.unit)} (2 × YSN − mevcut − açık sipariş, 50'ye yuvarlı).`) : ''}
      <div class="form-grid">
        <label class="field span-2"><span class="field-label">Malzeme <span class="req">*</span></span><select class="select" data-p="code">${company().products.map((p) => `<option value="${esc(p.code)}" ${p.code === v.code ? 'selected' : ''}>${esc(p.code)} · ${esc(p.name)}</option>`).join('')}</select></label>
        <label class="field"><span class="field-label">Miktar <span class="req">*</span></span><input class="input" type="number" min="1" step="10" data-p="qty" value="${esc(v.qty)}"></label>
        <label class="field"><span class="field-label">Tesis <span class="req">*</span></span><select class="select" data-p="plant">${whs().map((w) => `<option value="${esc(w.code)}" ${w.code === v.plant ? 'selected' : ''}>${esc(w.code)} · ${esc(w.name)}</option>`).join('')}</select></label>
        <label class="field"><span class="field-label">İstenen tarih <span class="req">*</span></span><input class="input" type="date" data-p="needDate" min="${esc(today())}" value="${esc(v.needDate || addDays(today(), lead(v.supplier) + 2))}"></label>
        <label class="field"><span class="field-label">Önerilen tedarikçi</span><select class="select" data-p="supplier"></select></label>
        <label class="field span-2"><span class="field-label">Not</span><input class="input" data-p="note" maxlength="80"></label>
      </div>
      <div data-pr-preview></div>
      <div class="drawer-actions"><button class="btn btn-primary" type="button" data-act="pr-save">${icon('check')}<span>Talebi kaydet</span></button><button class="btn btn-ghost" type="button" data-close>Vazgeç</button></div>
    </div>`;
  openDrawer(html, (el) => {
    if (el.dataset.act !== 'pr-save') return;
    const f = el.closest('[data-prform]');
    const val = (k) => f.querySelector(`[data-p="${k}"]`).value.trim();
    const r = createPR({ code: val('code'), qty: Number(val('qty')), plant: val('plant'), needDate: val('needDate'), supplier: val('supplier'), note: val('note') });
    if (r.error) return toast(r.error);
    toast(`Talep ${r.pr.no} kaydedildi${r.pr.status === 'pending' ? ' · onaya düştü' : ''}`);
    tab = 'pr';
    openPr(r.pr.no);
    refreshAll();
  });
  const f = document.querySelector('.drawer-root [data-prform]');
  if (!f) return;
  const fill = (keepSup) => {
    const code = f.querySelector('[data-p="code"]').value;
    const sel = f.querySelector('[data-p="supplier"]');
    const cur = keepSup ? sel.value || v.supplier : '';
    sel.innerHTML = suppliersFor(code).map((x) => `<option value="${esc(x.id)}" ${x.id === cur ? 'selected' : ''}>${esc(x.name)} · ${money(priceOf(code, x.id))} · ${x.leadTimeDays} gün</option>`).join('');
  };
  const preview = () => {
    const code = f.querySelector('[data-p="code"]').value;
    const qty = Number(f.querySelector('[data-p="qty"]').value) || 0;
    const sup = f.querySelector('[data-p="supplier"]').value;
    const value = round2((priceOf(code, sup) || 0) * qty);
    const need = f.querySelector('[data-p="needDate"]').value;
    const earliest = addDays(today(), lead(sup));
    f.querySelector('[data-pr-preview]').innerHTML = `${kv([['Tahmini değer', `<strong>${money(value)}</strong> (${money(priceOf(code, sup) || 0)} × ${num(qty)})`], ['Onay', value > rules().prReleaseLimit ? `<span class="neg">Gerekli: ${money(rules().prReleaseLimit)} eşiği aşıldı (PR_RELEASE)</span>` : 'Gerekmez']])}${need && need < earliest ? alertBox('warning', 'İstenen tarih tedarik süresinden önce', `Tedarikçinin teslim süresiyle en erken ${date(earliest)}.`) : ''}`;
  };
  fill(true);
  preview();
  f.addEventListener('change', (e) => {
    if (e.target.dataset.p === 'code') fill(false);
    preview();
  });
  f.addEventListener('input', preview);
}

function prView(s) {
  const list = s.prs.slice().reverse();
  return `<div class="toolbar"><span class="toolbar-count">${list.length} talep · ${money(rules().prReleaseLimit)} üstü onay gerektirir</span><span class="c4c-spacer"></span>${actionBtn({ perm: 'PR_CREATE', label: 'Yeni talep', iconName: 'inbox', attrs: 'data-new-pr' })}</div>
    ${list.length ? `<div class="card table-card"><div class="table-wrap"><table class="table tl-table c4c-table">
      <thead><tr><th>Talep</th><th>Malzeme</th><th class="num">Miktar</th><th class="hide-sm">Tesis</th><th class="hide-md">İstenen</th><th class="num hide-sm">Değer</th><th>Durum</th></tr></thead>
      <tbody>${list.map((pr) => `<tr data-doc="pr:${esc(pr.no)}" tabindex="0"><td><span class="code">${esc(pr.no)}</span><div class="cell-sub">${esc(actor(pr.createdBy))}</div></td><td>${esc(productOf(pr.code)?.name || pr.code)}</td><td class="num">${num(pr.qty)} ${esc(productOf(pr.code)?.unit || '')}</td><td class="hide-sm">${esc(pr.plant)}</td><td class="hide-md">${date(pr.needDate)}</td><td class="num hide-sm">${money(pr.value ?? pr.price * pr.qty)}</td><td>${badge(PR_STATUS[pr.status].label, PR_STATUS[pr.status].tone)}${pr.poNo ? `<div class="cell-sub">PO ${esc(pr.poNo)}</div>` : ''}</td></tr>`).join('')}</tbody>
    </table></div></div>` : `<div class="card">${emptyState('inbox', 'Talep yok', 'Stok sekmesindeki önerilerden veya "Yeni talep" ile talep aç.')}</div>`}`;
}

function decideBox(kind, doc) {
  const perm = kind === 'pr' ? 'PR_RELEASE' : 'PO_RELEASE';
  if (doc.status !== 'pending') return '';
  const own = doc.createdBy === me()?.id;
  const sod = own ? 'Görevler ayrılığı: kendi oluşturduğun belgeyi onaylayamazsın.' : null;
  return `<div class="decide">
    <div class="decide-head">${icon('stamp')}<strong>${kind === 'pr' ? 'Talep onayı' : 'Sipariş onayı'}</strong><span class="cell-sub">Gerekli yetki: <span class="code">${perm}</span></span></div>
    ${can(perm) && !own ? '<label class="field"><span class="field-label">Not / gerekçe <span class="cell-sub inline">reddederken zorunlu</span></span><textarea class="input textarea" rows="2" data-note></textarea></label>' : ''}
    <div class="decide-actions">
      ${actionBtn({ perm, label: 'Onayla', iconName: 'check', attrs: `data-act="release"`, reason: sod })}
      ${actionBtn({ perm, label: 'Reddet', iconName: 'close', cls: 'btn-ghost danger', attrs: `data-act="reject"`, reason: sod })}
    </div>
  </div>`;
}

function historyHtml(h) {
  return `<ol class="timeline">${[...h].reverse().map((x) => `<li><span class="tl-dot tone-${['released', 'auto-released', 'posted', 'unblocked'].includes(x.action) ? 'success' : ['rejected', 'blocked'].includes(x.action) ? 'danger' : 'info'}">${icon(x.action === 'rejected' || x.action === 'blocked' ? 'close' : 'check')}</span><div class="tl-body"><div><strong>${esc(actor(x.by))}</strong> <span>${esc(HIST[x.action] || x.action)}</span></div><span class="cell-sub">${datetime(x.at)}</span>${x.note ? `<p class="tl-note">${esc(x.note)}</p>` : ''}</div></li>`).join('')}</ol>`;
}

function openPr(no) {
  const s = read();
  const pr = getPr(no, s);
  if (!pr) return toast('Talep bulunamadı');
  const p = productOf(pr.code);
  const html =
    drawerHead(`Satın alma talebi · ${pr.no}`, `${p?.name || pr.code} · ${num(pr.qty)} ${p?.unit || ''}`, badge(PR_STATUS[pr.status].label, PR_STATUS[pr.status].tone)) +
    `<div class="drawer-body">
      ${pr.status === 'rejected' ? alertBox('danger', 'Reddedildi', esc(pr.history.filter((h) => h.action === 'rejected').pop()?.note || '')) : ''}
      ${decideBox('pr', pr)}
      ${pr.status === 'released' && !pr.poNo ? `<div class="drawer-actions">${actionBtn({ perm: 'PO_CREATE', label: 'Siparişe dönüştür', iconName: 'cart', attrs: 'data-act="to-po"' })}</div>` : ''}
      ${dsec('Belge akışı', p2pFlowHtml({ type: 'pr', no }))}
      ${dsec('Talep', kv([
        ['Malzeme', `<span class="code">${esc(pr.code)}</span> ${esc(p?.name || '')}`],
        ['Miktar', `${num(pr.qty)} ${esc(p?.unit || '')}`],
        ['Tesis', `<span class="code">${esc(pr.plant)}</span> ${esc(whName(pr.plant))}`],
        ['İstenen tarih', date(pr.needDate)],
        ['Önerilen tedarikçi', esc(supplierOf(pr.supplier)?.name || '—')],
        ['Değerleme', `${money(pr.price)} × ${num(pr.qty)} = <strong>${money(pr.value ?? pr.price * pr.qty)}</strong>`],
        ['Oluşturan', esc(actor(pr.createdBy))],
        pr.note ? ['Not', esc(pr.note)] : null,
      ]))}
      ${dsec('Geçmiş', historyHtml(pr.history))}
    </div>`;
  openDrawer(html, (el) => docAction('pr', no, el));
}

export function releaseDoc(kind, no, approve, note = '') {
  const perm = kind === 'pr' ? 'PR_RELEASE' : 'PO_RELEASE';
  const s = read();
  const d = kind === 'pr' ? getPr(no, s) : getPo(no, s);
  if (!d || d.status !== 'pending') return { error: 'Belge onay beklemiyor' };
  if (!can(perm)) return { error: lockReason(perm) };
  if (d.createdBy === me().id) return { error: 'Görevler ayrılığı: kendi belgeni onaylayamazsın' };
  if (!approve && !note) return { error: 'Reddetmek için gerekçe yaz' };
  d.status = approve ? 'released' : 'rejected';
  d.releasedBy = me().id;
  d.releasedAt = nowIso();
  d.history.push({ at: d.releasedAt, by: me().id, action: approve ? 'released' : 'rejected', note });
  write(s);
  refresh();
  return { doc: d };
}

export function createPO(prNo) {
  if (!can('PO_CREATE')) return { error: lockReason('PO_CREATE') };
  const s = read();
  const pr = getPr(prNo, s);
  if (!pr || pr.status !== 'released') return { error: 'Yalnızca onaylı talep siparişe dönüştürülür' };
  if (pr.poNo) return { error: 'Talep zaten siparişe dönüştürülmüş' };
  const sup = supplierOf(pr.supplier);
  const at = nowIso();
  const price = priceOf(pr.code, sup.id);
  const po = {
    no: nextNo(s, 'po'), prNo: pr.no, supplier: sup.id, plant: pr.plant, date: today(), deliveryDate: addDays(today(), sup.leadTimeDays),
    lines: [{ pos: 10, code: pr.code, qty: pr.qty, price }], status: 'pending', createdBy: me().id, createdAt: at,
    history: [{ at, by: me().id, action: 'created', note: `Talep ${pr.no} referanslı · ${money(price)} bilgi kaydı fiyatı · teslim ${sup.leadTimeDays} gün` }],
  };
  const net = poNet(po);
  if (net <= rules().poReleaseLimit) {
    po.status = 'released';
    po.history.push({ at, by: me().id, action: 'auto-released', note: `Tutar ${money(rules().poReleaseLimit)} eşiğinin altında` });
  }
  pr.status = 'ordered';
  pr.poNo = po.no;
  pr.history.push({ at, by: me().id, action: 'ordered', note: `Sipariş ${po.no}` });
  s.pos.push(po);
  write(s);
  refresh();
  return { po };
}

// ---------- satın alma siparişi ----------
function poView(s) {
  const list = s.pos.slice().reverse();
  return `<div class="toolbar"><span class="toolbar-count">${list.length} sipariş · ${money(rules().poReleaseLimit)} üstü Satın Alma Müdürü onayı gerektirir</span></div>
    ${list.length ? `<div class="card table-card"><div class="table-wrap"><table class="table tl-table c4c-table">
      <thead><tr><th>Sipariş</th><th>Tedarikçi</th><th class="hide-sm">Malzeme</th><th class="num">Net</th><th class="hide-md">Teslim</th><th>Durum</th></tr></thead>
      <tbody>${list.map((po) => `<tr data-doc="po:${esc(po.no)}" tabindex="0"><td><span class="code">${esc(po.no)}</span><div class="cell-sub">${date(po.date)}</div></td><td>${esc(supplierOf(po.supplier)?.name || '')}</td><td class="hide-sm">${po.lines.map((l) => `${esc(productOf(l.code)?.name || l.code)} × ${num(l.qty)}`).join(', ')}</td><td class="num">${money(poNet(po))}</td><td class="hide-md">${date(po.deliveryDate)} · ${esc(po.plant)}</td><td><div class="badges tight">${poBadges(po, s)}</div></td></tr>`).join('')}</tbody>
    </table></div></div>` : `<div class="card">${emptyState('cart', 'Sipariş yok', 'Onaylı bir talepten "Siparişe dönüştür" ile sipariş oluştur.')}</div>`}`;
}

function poBadges(po, s) {
  const out = [badge(PO_STATUS[po.status].label, PO_STATUS[po.status].tone)];
  if (po.status === 'released') out.push(po.sentAt ? badge('Gönderildi', 'neutral') : badge('Gönderilmedi', 'warning'));
  const rec = sum(po.lines, (l) => received(po, l.pos, s));
  const tot = sum(po.lines, (l) => l.qty);
  if (rec) out.push(badge(rec >= tot ? 'Teslim alındı' : `Kısmi GR ${num(rec)}/${num(tot)}`, rec >= tot ? 'success' : 'info'));
  const inv = invsFor(po, s);
  if (inv.some((i) => i.status === 'blocked')) out.push(badge('Fatura bloke', 'danger'));
  return out.join('');
}

function openPo(no, view = 'detail') {
  const s = read();
  const po = getPo(no, s);
  if (!po) return toast('Sipariş bulunamadı');
  if (view === 'print') return openPoPrint(po);
  const sup = supplierOf(po.supplier);
  const grOpen = po.status === 'released' && po.sentAt && poOpen(po, s);
  const grReady = po.lines.some((l) => received(po, l.pos, s) > invoiced(po, l.pos, s));
  const html =
    drawerHead(`Satın alma siparişi · ${po.no}`, sup?.name || po.supplier, poBadges(po, s)) +
    `<div class="drawer-body">
      ${po.status === 'rejected' ? alertBox('danger', 'Reddedildi', esc(po.history.filter((h) => h.action === 'rejected').pop()?.note || '')) : ''}
      ${decideBox('po', po)}
      <div class="drawer-actions">
        <button class="btn btn-ghost" type="button" data-act="print">${icon('book')}<span>Yazdır / gönder görünümü</span></button>
        ${po.status === 'released' && !po.sentAt ? actionBtn({ perm: 'PO_CREATE', label: 'Tedarikçiye gönder', iconName: 'send', attrs: 'data-act="send"' }) : ''}
        ${grOpen ? actionBtn({ perm: 'GR_POST', label: 'Mal girişi (101)', iconName: 'truck', attrs: 'data-act="go-gr"' }) : ''}
        ${grReady ? actionBtn({ perm: 'INVOICE_VERIFY', label: 'Fatura gir (MIRO)', iconName: 'book', attrs: 'data-act="go-inv"' }) : ''}
      </div>
      ${po.status === 'released' && !po.sentAt ? '<p class="cell-sub">Gönderilmemiş siparişe mal girişi yapılamaz.</p>' : ''}
      ${dsec('Belge akışı', p2pFlowHtml({ type: 'po', no }))}
      ${dsec('Kalemler', `<div class="table-wrap"><table class="cond-table"><thead><tr><th>Kalem</th><th>Malzeme</th><th class="num">Sipariş</th><th class="num">GR</th><th class="num">Fatura</th><th class="num">Fiyat</th></tr></thead><tbody>${po.lines
        .map((l) => `<tr><td><span class="code">${l.pos}</span></td><td>${esc(productOf(l.code)?.name || l.code)}<div class="cell-sub">${esc(l.code)}</div></td><td class="num">${num(l.qty)}</td><td class="num">${num(received(po, l.pos, s))}</td><td class="num">${num(invoiced(po, l.pos, s))}</td><td class="num">${money(l.price)}</td></tr>`)
        .join('')}</tbody></table></div>`)}
      ${dsec('Başlık', kv([
        ['Talep', po.prNo ? `<button class="link" type="button" data-act="doc" data-doc="pr:${esc(po.prNo)}">${esc(po.prNo)}</button>` : '—'],
        ['Tedarikçi', `<button class="link" type="button" data-open="supplier" data-id="${esc(po.supplier)}">${esc(sup?.name || po.supplier)}</button>`],
        ['Teslimat tesisi', `<span class="code">${esc(po.plant)}</span> ${esc(whName(po.plant))}`],
        ['Teslim tarihi', date(po.deliveryDate)],
        ['Ödeme koşulu', `<span class="code">${esc(sup?.paymentTerm || '')}</span> ${esc(termName(sup?.paymentTerm))}`],
        ['Net tutar', `<strong>${money(poNet(po))}</strong>`],
        ['Oluşturan', esc(actor(po.createdBy))],
        po.sentAt ? ['Gönderim', datetime(po.sentAt)] : null,
      ]))}
      ${dsec('Geçmiş', historyHtml(po.history))}
    </div>`;
  openDrawer(html, (el) => docAction('po', no, el));
}

function openPoPrint(po) {
  const D = company().organization;
  const sup = supplierOf(po.supplier);
  const wh = whs().find((w) => w.code === po.plant);
  const lines = po.lines.map((l) => {
    const p = productOf(l.code);
    const net = round2(l.qty * l.price);
    return { l, p, net, vat: round2((net * (p?.vatRate || 0)) / 100) };
  });
  const net = sum(lines, (x) => x.net);
  const vat = round2(sum(lines, (x) => x.vat));
  const html =
    drawerHead(`Çıktı · ${po.no}`, 'Satın alma siparişi', badge(PO_STATUS[po.status].label, PO_STATUS[po.status].tone) + (po.sentAt ? badge('Gönderildi', 'neutral') : '')) +
    `<div class="drawer-body">
      ${po.status !== 'released' ? alertBox('warning', 'Onaylanmamış sipariş', 'Onaylanmadan (serbest bırakılmadan) tedarikçiye gönderilemez; çıktı TASLAK filigranlıdır.') : ''}
      <article class="po-doc${po.status !== 'released' ? ' is-draft' : ''}">
        <header class="po-doc-head">
          <div><strong>${esc(D.company.name)}</strong><span>${esc(D.company.address)}</span><span>VKN ${esc(D.company.taxNo)} · ${esc(D.company.taxOffice)} VD</span></div>
          <div class="po-doc-title"><span>SATIN ALMA SİPARİŞİ</span><strong>${esc(po.no)}</strong><span>${date(po.date)}</span></div>
        </header>
        <div class="po-doc-parties">
          <div><span class="po-lbl">Tedarikçi</span><strong>${esc(sup?.name || '')}</strong><span>${esc(sup?.city || '')}</span><span>Tedarikçi no ${esc(po.supplier)}</span></div>
          <div><span class="po-lbl">Teslimat adresi</span><strong>${esc(po.plant)} · ${esc(wh?.name || '')}</strong><span>${esc(wh?.address || '')}</span><span>Teslim tarihi ${date(po.deliveryDate)}</span></div>
        </div>
        <table class="po-doc-lines"><thead><tr><th>Kalem</th><th>Malzeme</th><th class="num">Miktar</th><th class="num">Birim fiyat</th><th class="num">Tutar</th></tr></thead><tbody>${lines
          .map((x) => `<tr><td>${x.l.pos}</td><td>${esc(x.p?.name || x.l.code)}<br><small>${esc(x.l.code)} · ${esc(x.p?.pack || '')}</small></td><td class="num">${num(x.l.qty)} ${esc(x.p?.unit || '')}</td><td class="num">${money(x.l.price)}</td><td class="num">${money(x.net)}</td></tr>`)
          .join('')}</tbody>
          <tfoot><tr><td colspan="4">Net</td><td class="num">${money(net)}</td></tr><tr><td colspan="4">KDV</td><td class="num">${money(vat)}</td></tr><tr class="po-total"><td colspan="4">Toplam</td><td class="num">${money(net + vat)}</td></tr></tfoot></table>
        <p class="po-doc-terms">Ödeme koşulu: ${esc(sup?.paymentTerm || '')} ${esc(termName(sup?.paymentTerm))}. Faturada sipariş numarası (${esc(po.no)}) belirtilmelidir. Sipariş fiyatından farklı faturalar ödeme öncesi kontrole takılır.</p>
        <footer class="po-doc-sign"><span>Onaylayan: ${esc(po.releasedBy ? actor(po.releasedBy) : po.history.some((h) => h.action === 'auto-released') ? 'Onay gerekmedi' : '—')}</span><span>Hazırlayan: ${esc(actor(po.createdBy))}</span></footer>
      </article>
      <div class="drawer-actions">
        <button class="btn btn-ghost" type="button" data-act="window-print">${icon('book')}<span>Yazdır</span></button>
        ${po.status === 'released' && !po.sentAt ? actionBtn({ perm: 'PO_CREATE', label: `Tedarikçiye gönder (${esc(sup?.contacts?.[1]?.email || sup?.contacts?.[0]?.email || 'e-posta')})`, iconName: 'send', attrs: 'data-act="send"' }) : ''}
        <button class="btn btn-ghost" type="button" data-act="doc" data-doc="po:${esc(po.no)}">${icon('back')}<span>Siparişe dön</span></button>
      </div>
    </div>`;
  openDrawer(html, (el) => docAction('po', po.no, el));
}

export function sendPO(no) {
  if (!can('PO_CREATE')) return { error: lockReason('PO_CREATE') };
  const s = read();
  const po = getPo(no, s);
  if (!po || po.status !== 'released') return { error: 'Onaylanmamış sipariş gönderilemez' };
  if (po.sentAt) return { error: 'Sipariş zaten gönderildi' };
  const sup = supplierOf(po.supplier);
  po.sentAt = nowIso();
  po.history.push({ at: po.sentAt, by: me().id, action: 'sent', note: `E-posta · ${sup?.contacts?.[1]?.email || sup?.contacts?.[0]?.email || ''}` });
  write(s);
  refresh();
  return { po };
}

// ---------- mal girişi (MIGO 101) ----------
export function postGR(poNo, qtys, note = '') {
  if (!can('GR_POST')) return { error: lockReason('GR_POST') };
  const s = read();
  const po = getPo(poNo, s);
  if (!po || po.status !== 'released') return { error: 'Onaylı sipariş seç' };
  if (!po.sentAt) return { error: 'Sipariş tedarikçiye gönderilmemiş' };
  const lines = [];
  for (const l of po.lines) {
    const qty = Number(qtys[l.pos] || 0);
    if (!qty) continue;
    if (qty < 0) return { error: 'Miktar negatif olamaz' };
    const open = openQty(po, l, s);
    if (qty > open) return { error: `Kalem ${l.pos}: açık miktar ${num(open)}; fazlası teslim alınamaz` };
    lines.push({ pos: l.pos, code: l.code, qty, plant: po.plant });
  }
  if (!lines.length) return { error: 'En az bir kalem için miktar gir' };
  const at = nowIso();
  for (const ln of lines) {
    const p = productOf(ln.code);
    ln.before = p.stock[ln.plant] ?? 0;
    ln.after = ln.before + ln.qty;
    updateProduct(ln.code, { stock: { ...p.stock, [ln.plant]: ln.after } }, { silent: true });
  }
  const d = { no: nextNo(s, 'mdoc'), type: '101', date: today(), poNo, lines, note, createdBy: me().id, createdAt: at };
  s.mdocs.push(d);
  const partial = poOpen(po, s);
  po.history.push({ at, by: me().id, action: 'gr', note: `Malzeme belgesi ${d.no} · ${lines.map((l) => `${l.code} ${num(l.qty)}`).join(', ')}${partial ? ' · kısmi teslimat, sipariş açık' : ' · sipariş tamamen teslim alındı'}` });
  write(s);
  markDone();
  refresh();
  return { mdoc: d, partial };
}

function grView(s) {
  const open = s.pos.filter((po) => po.status === 'released' && po.sentAt && poOpen(po, s));
  const po = open.find((x) => x.no === grPo) || open[0];
  const recent = s.mdocs.filter((d) => d.type === '101').slice(-8).reverse();
  return `<div class="mm-grid">
    <section class="card tl-sec">
      <h3 class="card-title">${icon('truck')} Mal girişi · hareket türü 101</h3>
      ${open.length ? `<label class="field"><span class="field-label">Satın alma siparişi</span><select class="select" data-grpo>${open.map((x) => `<option value="${esc(x.no)}" ${x.no === po.no ? 'selected' : ''}>${esc(x.no)} · ${esc(supplierOf(x.supplier)?.name.split(' ')[0] || '')} · ${esc(x.plant)}</option>`).join('')}</select></label>
        <div class="table-wrap"><table class="cond-table mt-sm"><thead><tr><th>Kalem</th><th>Malzeme</th><th class="num">Sipariş</th><th class="num">Alınan</th><th class="num">Açık</th><th class="num">Giriş</th></tr></thead><tbody>${po.lines
          .map((l) => {
            const op = openQty(po, l, s);
            return `<tr><td><span class="code">${l.pos}</span></td><td>${esc(productOf(l.code)?.name || l.code)}</td><td class="num">${num(l.qty)}</td><td class="num">${num(received(po, l.pos, s))}</td><td class="num"><strong>${num(op)}</strong></td><td class="num"><input class="input mm-qty" type="number" min="0" max="${op}" step="1" data-grqty="${l.pos}" value="${op}" ${op ? '' : 'disabled'} aria-label="Giriş miktarı"></td></tr>`;
          })
          .join('')}</tbody></table></div>
        <label class="field mt-sm"><span class="field-label">İrsaliye no / not</span><input class="input" data-grnote maxlength="60" placeholder="Ör. İrsaliye PK-55821"></label>
        <p class="cell-sub">Tesis ${esc(po.plant)} ${esc(whName(po.plant))} · teslim tarihi ${date(po.deliveryDate)}. Açık miktardan azı girilirse sipariş açık kalır (kısmi teslimat).</p>
        <div class="drawer-actions">${actionBtn({ perm: 'GR_POST', label: 'Mal girişini kaydet', iconName: 'check', attrs: `data-post-gr="${esc(po.no)}"` })}<button class="btn btn-ghost" type="button" data-doc="po:${esc(po.no)}">${icon('cart')}<span>Siparişi aç</span></button></div>`
        : emptyState('truck', 'Teslim alınacak sipariş yok', 'Onaylanmış ve tedarikçiye gönderilmiş, açık miktarı olan siparişler burada listelenir.')}
    </section>
    <section class="card tl-sec"><h3 class="card-title">Son mal girişleri</h3>${recent.length ? mdocList(recent) : '<p class="cell-sub">Henüz yok.</p>'}</section>
  </div>`;
}

// ---------- fatura doğrulama (MIRO) ----------
// lines: [{ pos, qty, price }]
export function matchInvoice(po, lines, s = read()) {
  const tol = rules().tolerancePct;
  const rows = lines.map((x) => {
    const l = po.lines.find((y) => y.pos === x.pos);
    const grOpen = received(po, l.pos, s) - invoiced(po, l.pos, s);
    const pricePct = l.price ? ((x.price - l.price) / l.price) * 100 : 0;
    const reasons = [];
    if (Math.abs(pricePct) > tol + 1e-9) reasons.push(`Fiyat farkı ${pricePct > 0 ? '+' : ''}${pricePct.toFixed(1).replace('.', ',')}% (tolerans %${tol})`);
    if (x.qty > grOpen) reasons.push(`Miktar farkı: faturalanan ${num(x.qty)}, teslim alınıp faturalanmamış ${num(grOpen)}`);
    return { ...x, code: l.code, poPrice: l.price, grOpen, pricePct, reasons, net: round2(x.qty * x.price) };
  });
  return { rows, reasons: rows.flatMap((r) => r.reasons.map((t) => `Kalem ${r.pos}: ${t}`)) };
}

export function postInvoice(poNo, { ref, invDate, lines }) {
  if (!can('INVOICE_VERIFY')) return { error: lockReason('INVOICE_VERIFY') };
  const s = read();
  const po = getPo(poNo, s);
  if (!po || po.status !== 'released') return { error: 'Onaylı sipariş seç' };
  if (!ref) return { error: 'Tedarikçi fatura numarası zorunlu' };
  const ls = (lines || []).filter((l) => l.qty > 0);
  if (!ls.length) return { error: 'En az bir kalem için miktar gir' };
  if (ls.some((l) => !(l.price > 0))) return { error: 'Birim fiyat sıfırdan büyük olmalı' };
  if (s.invs.some((i) => i.supplier === po.supplier && i.ref === ref)) return { error: `Mükerrer fatura: ${ref} bu tedarikçi için zaten kayıtlı` };
  const m = matchInvoice(po, ls, s);
  const sup = supplierOf(po.supplier);
  const at = nowIso();
  const net = round2(sum(m.rows, (r) => r.net));
  const vat = round2(sum(m.rows, (r) => (r.net * (productOf(r.code)?.vatRate || 0)) / 100));
  const date_ = invDate || today();
  const inv = {
    no: nextNo(s, 'sinv'), poNo, supplier: po.supplier, ref, date: date_, dueDate: addDays(date_, termOf(sup.paymentTerm)?.days || 0),
    lines: m.rows.map((r) => ({ pos: r.pos, code: r.code, qty: r.qty, price: r.price, poPrice: r.poPrice, grOpen: r.grOpen, pricePct: round2(r.pricePct), net: r.net })),
    net, vat, gross: round2(net + vat), status: m.reasons.length ? 'blocked' : 'posted', blockReasons: m.reasons, createdBy: me().id, createdAt: at,
    history: [{ at, by: me().id, action: 'posted', note: `Tedarikçi faturası ${ref} · ${money(net + vat)}` }],
  };
  if (m.reasons.length) inv.history.push({ at, by: 'SYSTEM', action: 'blocked', note: m.reasons.join(' · ') });
  s.invs.push(inv);
  po.history.push({ at, by: me().id, action: 'invoice', note: `Fatura ${inv.no} (${ref})${m.reasons.length ? ' · ödemeye bloke' : ''}` });
  write(s);
  markDone();
  refresh();
  return { invoice: inv };
}

export function unblockInvoice(no, reason) {
  if (!can('INVOICE_VERIFY')) return { error: lockReason('INVOICE_VERIFY') };
  if (!reason?.trim()) return { error: 'Blokajı kaldırmak için gerekçe yaz' };
  const s = read();
  const inv = getInv(no, s);
  if (!inv || inv.status !== 'blocked') return { error: 'Fatura bloke değil' };
  const at = nowIso();
  Object.assign(inv, { status: 'released', unblockedBy: me().id, unblockedAt: at, unblockReason: reason.trim() });
  inv.history.push({ at, by: me().id, action: 'unblocked', note: reason.trim() });
  write(s);
  refresh();
  return { invoice: inv };
}

function invView(s) {
  const pos = s.pos.filter((po) => po.status === 'released' && grFor(po, s).length);
  const po = pos.find((x) => x.no === invPo) || pos.find((x) => x.lines.some((l) => received(x, l.pos, s) > invoiced(x, l.pos, s))) || pos[0];
  const list = s.invs.slice().reverse();
  return `<div class="mm-grid">
    <section class="card tl-sec" data-invform>
      <h3 class="card-title">${icon('book')} Tedarikçi faturası · üç yönlü eşleştirme</h3>
      ${po ? `<div class="form-grid">
          <label class="field span-2"><span class="field-label">Satın alma siparişi</span><select class="select" data-invpo>${pos.map((x) => `<option value="${esc(x.no)}" ${x.no === po.no ? 'selected' : ''}>${esc(x.no)} · ${esc(supplierOf(x.supplier)?.name.split(' ')[0] || '')}</option>`).join('')}</select></label>
          <label class="field"><span class="field-label">Tedarikçi fatura no <span class="req">*</span></span><input class="input" data-invref maxlength="30" placeholder="Ör. MB-2026-1188"></label>
          <label class="field"><span class="field-label">Fatura tarihi</span><input class="input" type="date" data-invdate value="${esc(today())}"></label>
        </div>
        <div class="table-wrap"><table class="cond-table mt-sm mm-match"><thead><tr><th>Kalem</th><th class="num">PO fiyatı</th><th class="num">GR (faturalanmamış)</th><th class="num">Fatura miktarı</th><th class="num">Fatura fiyatı</th><th>Eşleşme</th></tr></thead><tbody>${po.lines
          .map((l) => {
            const go = received(po, l.pos, s) - invoiced(po, l.pos, s);
            return `<tr data-mline="${l.pos}"><td><span class="code">${l.pos}</span> ${esc(productOf(l.code)?.name || l.code)}</td><td class="num">${money(l.price)}</td><td class="num">${num(go)}</td><td class="num"><input class="input mm-qty" type="number" min="0" step="1" data-iqty value="${go}" aria-label="Fatura miktarı"></td><td class="num"><input class="input mm-qty mm-price" type="number" min="0" step="0.01" data-iprice value="${l.price}" aria-label="Fatura birim fiyatı"></td><td data-mres></td></tr>`;
          })
          .join('')}</tbody></table></div>
        <div data-match-sum></div>
        <div class="drawer-actions">${actionBtn({ perm: 'INVOICE_VERIFY', label: 'Faturayı kaydet', iconName: 'check', attrs: `data-post-inv="${esc(po.no)}"` })}</div>`
        : emptyState('book', 'Faturalanacak sipariş yok', 'Mal girişi yapılmış siparişler burada listelenir.')}
    </section>
    <section class="card tl-sec"><h3 class="card-title">Tedarikçi faturaları</h3>${list.length ? `<ul class="act-list">${list.map((i) => `<li class="${i.status === 'blocked' ? 'is-late' : ''}"><button class="act-row" type="button" data-doc="sinv:${esc(i.no)}"><span class="act-ico">${icon('book')}</span><span class="act-text"><strong>${esc(i.no)} · ${esc(i.ref)}</strong><span class="cell-sub">${esc(supplierOf(i.supplier)?.name.split(' ')[0] || '')} · PO ${esc(i.poNo)} · ${money(i.gross)} · vade ${date(i.dueDate)}</span></span>${badge(INV_STATUS[i.status].label, INV_STATUS[i.status].tone)}</button></li>`).join('')}</ul>` : '<p class="cell-sub">Henüz fatura yok.</p>'}</section>
  </div>`;
}

function readInvLines(form) {
  return [...form.querySelectorAll('[data-mline]')].map((tr) => ({ pos: Number(tr.dataset.mline), qty: Number(tr.querySelector('[data-iqty]').value) || 0, price: Number(tr.querySelector('[data-iprice]').value) || 0 }));
}

function updateMatch(body) {
  const form = body.querySelector('[data-invform]');
  const sel = form?.querySelector('[data-invpo]');
  if (!sel) return;
  const s = read();
  const po = getPo(sel.value, s);
  const m = matchInvoice(po, readInvLines(form).filter((l) => l.qty > 0), s);
  form.querySelectorAll('[data-mline]').forEach((tr) => {
    const r = m.rows.find((x) => x.pos === Number(tr.dataset.mline));
    tr.querySelector('[data-mres]').innerHTML = !r ? '<span class="cell-sub">—</span>' : r.reasons.length ? `<span class="neg">${esc(r.reasons.join(' · '))}</span>` : `<span class="ok-text">${icon('check')} Eşleşti${r.pricePct ? ` (${r.pricePct > 0 ? '+' : ''}${r.pricePct.toFixed(1).replace('.', ',')}%)` : ''}</span>`;
  });
  const net = sum(m.rows, (r) => r.net);
  form.querySelector('[data-match-sum]').innerHTML = m.rows.length
    ? m.reasons.length
      ? alertBox('danger', `Ödemeye bloke edilecek · net ${money(net)}`, esc(m.reasons.join(' · ')))
      : alertBox('success', `Ödemeye açık kaydedilecek · net ${money(net)}`, 'Fiyat ve miktar sipariş ve mal girişiyle tolerans içinde eşleşiyor.')
    : '';
}

function openInv(no) {
  const s = read();
  const inv = getInv(no, s);
  if (!inv) return toast('Fatura bulunamadı');
  const sup = supplierOf(inv.supplier);
  const html =
    drawerHead(`Tedarikçi faturası · ${inv.no}`, `${sup?.name || ''} · ${inv.ref}`, badge(INV_STATUS[inv.status].label, INV_STATUS[inv.status].tone) + badge(`Vade ${date(inv.dueDate)}`, 'neutral')) +
    `<div class="drawer-body">
      ${inv.status === 'blocked' ? alertBox('danger', 'Ödemeye bloke', esc(inv.blockReasons.join(' · '))) : ''}
      ${inv.status === 'released' ? alertBox('info', 'Blokaj kaldırıldı', `${esc(actor(inv.unblockedBy))} · ${datetime(inv.unblockedAt)} · “${esc(inv.unblockReason)}”`) : ''}
      ${inv.status === 'blocked' ? `<div class="md-form">${can('INVOICE_VERIFY') ? '<label class="field"><span class="field-label">Blokaj kaldırma gerekçesi <span class="req">*</span></span><textarea class="input textarea" rows="2" data-ub-note placeholder="Ör. Tedarikçinin fiyat artışı yazılı teyitli; bilgi kaydı güncellenecek."></textarea></label>' : ''}
        <div class="drawer-actions">${actionBtn({ perm: 'INVOICE_VERIFY', label: 'Blokajı kaldır', iconName: 'shield', attrs: 'data-act="unblock"' })}</div></div>` : ''}
      ${dsec('Üç yönlü eşleştirme', `<div class="table-wrap"><table class="cond-table"><thead><tr><th>Kalem</th><th class="num">PO fiyatı</th><th class="num">Fatura fiyatı</th><th class="num">Fark</th><th class="num">GR açık</th><th class="num">Fatura miktarı</th></tr></thead><tbody>${inv.lines
        .map((l) => `<tr><td><span class="code">${l.pos}</span> ${esc(productOf(l.code)?.name || l.code)}</td><td class="num">${money(l.poPrice)}</td><td class="num">${money(l.price)}</td><td class="num ${Math.abs(l.pricePct) > rules().tolerancePct ? 'neg' : ''}">${l.pricePct > 0 ? '+' : ''}${String(l.pricePct).replace('.', ',')}%</td><td class="num">${num(l.grOpen)}</td><td class="num ${l.qty > l.grOpen ? 'neg' : ''}">${num(l.qty)}</td></tr>`)
        .join('')}</tbody></table></div><p class="cell-sub">Tolerans: fiyatta ±%${rules().tolerancePct}; miktar teslim alınıp faturalanmamış miktarı aşamaz.</p>`)}
      ${dsec('Belge akışı', p2pFlowHtml({ type: 'sinv', no }))}
      ${dsec('Başlık', kv([
        ['Sipariş', `<button class="link" type="button" data-act="doc" data-doc="po:${esc(inv.poNo)}">${esc(inv.poNo)}</button>`],
        ['Tedarikçi fatura no', `<span class="code">${esc(inv.ref)}</span>`],
        ['Fatura tarihi', date(inv.date)],
        ['Vade', `${date(inv.dueDate)} · ${esc(sup?.paymentTerm || '')} ${esc(termName(sup?.paymentTerm))}`],
        ['Net / KDV / toplam', `${money(inv.net)} · ${money(inv.vat)} · <strong>${money(inv.gross)}</strong>`],
        ['Kaydeden', esc(actor(inv.createdBy))],
      ]))}
      ${dsec('Geçmiş', historyHtml(inv.history))}
    </div>`;
  openDrawer(html, (el) => docAction('sinv', no, el));
}

// ---------- tesisler arası transfer (301) ----------
export function postTransfer({ code, from, to, qty, note = '' }) {
  if (!can('GR_POST')) return { error: lockReason('GR_POST') };
  const p = productOf(code);
  if (!p) return { error: 'Malzeme seç' };
  if (!from || !to || from === to) return { error: 'Çıkış ve giriş tesisi farklı olmalı' };
  if (!(qty > 0)) return { error: 'Miktar sıfırdan büyük olmalı' };
  const avail = p.stock[from] ?? 0;
  if (qty > avail) return { error: `${from} tesisinde serbest stok ${num(avail)}; fazlası transfer edilemez` };
  const s = read();
  const at = nowIso();
  const lines = [
    { pos: 1, code, qty, plant: from, sign: -1, before: avail, after: avail - qty },
    { pos: 2, code, qty, plant: to, sign: 1, before: p.stock[to] ?? 0, after: (p.stock[to] ?? 0) + qty },
  ];
  updateProduct(code, { stock: { ...p.stock, [from]: avail - qty, [to]: (p.stock[to] ?? 0) + qty } }, { silent: true });
  const d = { no: nextNo(s, 'mdoc'), type: '301', date: today(), lines, note, createdBy: me().id, createdAt: at };
  s.mdocs.push(d);
  write(s);
  markDone();
  refresh();
  return { mdoc: d };
}

// ERP aktarımında stok hatası alan satış siparişleri
export function stockWaitingOrders() {
  return messages()
    .filter((m) => m.status === 'error' && (m.errorKinds || []).includes('stock'))
    .map((m) => getOrder(m.orderNo))
    .filter(Boolean)
    .map((o) => ({ o, short: o.lines.map((l) => ({ ...l, avail: productOf(l.code)?.stock?.[o.plant] ?? 0 })).filter((l) => l.avail < l.qty) }));
}

function trView(s) {
  const waiting = stockWaitingOrders();
  const pre = trPrefill || {};
  const recent = s.mdocs.filter((d) => d.type === '301').slice(-8).reverse();
  const W = whs();
  return `<div class="mm-grid">
    <section class="card tl-sec" data-trform>
      <h3 class="card-title">${icon('route')} Tesisler arası transfer · hareket türü 301</h3>
      <div class="form-grid">
        <label class="field span-2"><span class="field-label">Malzeme</span><select class="select" data-t="code">${company().products.map((p) => `<option value="${esc(p.code)}" ${p.code === (pre.code || 'GD-1002') ? 'selected' : ''}>${esc(p.code)} · ${esc(p.name)}</option>`).join('')}</select></label>
        <label class="field"><span class="field-label">Çıkış tesisi</span><select class="select" data-t="from">${W.map((w) => `<option value="${esc(w.code)}" ${w.code === (pre.from || W[0].code) ? 'selected' : ''}>${esc(w.code)} · ${esc(w.name)}</option>`).join('')}</select></label>
        <label class="field"><span class="field-label">Giriş tesisi</span><select class="select" data-t="to">${W.map((w) => `<option value="${esc(w.code)}" ${w.code === (pre.to || W[1]?.code) ? 'selected' : ''}>${esc(w.code)} · ${esc(w.name)}</option>`).join('')}</select></label>
        <label class="field"><span class="field-label">Miktar</span><input class="input" type="number" min="1" step="1" data-t="qty" value="${esc(pre.qty || 20)}"></label>
        <label class="field"><span class="field-label">Not</span><input class="input" data-t="note" maxlength="60"></label>
      </div>
      <div data-tr-preview></div>
      <p class="cell-sub">301 stoğu tek adımda çıkış tesisinden düşer, giriş tesisine ekler. Tesis içinde depo yerleri arası transfer 311'dir; iki adımlı (yolda stoklu) tesis transferi 303/305 ile yapılır.</p>
      <div class="drawer-actions">${actionBtn({ perm: 'GR_POST', label: 'Transferi kaydet', iconName: 'check', attrs: 'data-post-tr' })}</div>
    </section>
    <section class="card tl-sec">
      <h3 class="card-title">${icon('alert')} Stok bekleyen satış siparişleri</h3>
      ${waiting.length ? `<ul class="act-list">${waiting.map(({ o, short }) => `<li class="is-late"><div class="act-row mm-wait"><span class="act-ico">${icon('cart')}</span><span class="act-text"><strong>Sipariş ${esc(o.no)} · ${esc(o.customerName)}</strong><span class="cell-sub">Tesis ${esc(o.plant)} · ${short.map((l) => `${esc(l.code)}: istenen ${num(l.qty)}, mevcut ${num(l.avail)}`).join('; ')}</span></span>
        <span class="mm-wait-btns"><button class="btn btn-ghost btn-sm" type="button" data-fill='${esc(JSON.stringify({ code: short[0].code, to: o.plant, from: W.find((w) => w.code !== o.plant)?.code, qty: short[0].qty - short[0].avail }))}'>Forma doldur</button><button class="link small" type="button" data-order="${esc(o.no)}">Siparişi aç</button></span></div></li>`).join('')}</ul>
        <p class="cell-sub">Transferden sonra Aktarım Monitörü'nde mesajı yeniden işle (Key User).</p>` : '<p class="cell-sub">ERP aktarımında stok hatası alan sipariş yok.</p>'}
      <h3 class="card-title mt-sm">Son transferler</h3>${recent.length ? mdocList(recent) : '<p class="cell-sub">Henüz yok.</p>'}
    </section>
  </div>`;
}

function updateTransfer(body) {
  const f = body.querySelector('[data-trform]');
  if (!f) return;
  const v = (k) => f.querySelector(`[data-t="${k}"]`).value;
  const p = productOf(v('code'));
  const qty = Number(v('qty')) || 0;
  const from = v('from');
  const to = v('to');
  const af = (p.stock[from] ?? 0) - qty;
  f.querySelector('[data-tr-preview]').innerHTML = `<table class="cond-table mt-sm"><thead><tr><th>Tesis</th><th class="num">Şimdi</th><th class="num">Transfer sonrası</th></tr></thead><tbody>
    <tr><td><span class="code">${esc(from)}</span> ${esc(whName(from))}</td><td class="num">${num(p.stock[from] ?? 0)}</td><td class="num ${af < 0 ? 'neg' : ''}">${num(af)}</td></tr>
    <tr><td><span class="code">${esc(to)}</span> ${esc(whName(to))}</td><td class="num">${num(p.stock[to] ?? 0)}</td><td class="num">${from === to ? '—' : num((p.stock[to] ?? 0) + qty)}</td></tr></tbody></table>
    ${from === to ? alertBox('warning', 'Aynı tesis', 'Çıkış ve giriş tesisi farklı olmalı.') : af < 0 ? alertBox('danger', 'Yetersiz stok', `${esc(from)} tesisinde ${num(p.stock[from] ?? 0)} ${esc(p.unit)} var.`) : af < p.reorderPoint && af >= 0 && from === whs()[0].code ? alertBox('info', 'Dikkat', `Transfer sonrası ${esc(from)} stoğu ${num(af)}; yeniden sipariş noktası ${num(p.reorderPoint)} (toplam stok üzerinden izlenir).`) : ''}`;
}

function openMdoc(no) {
  const s = read();
  const d = getMdoc(no, s);
  if (!d) return toast('Malzeme belgesi bulunamadı');
  const html =
    drawerHead(`Malzeme belgesi · ${d.no}`, MVT[d.type], badge(`Hareket türü ${d.type}`, 'info') + (d.historic ? badge('Devralınan', 'neutral') : '')) +
    `<div class="drawer-body">
      ${d.poNo ? dsec('Belge akışı', p2pFlowHtml({ type: 'mdoc', no })) : ''}
      ${dsec('Kalemler', `<div class="table-wrap"><table class="cond-table"><thead><tr><th>Malzeme</th><th>Tesis</th><th class="num">Miktar</th><th class="num">Stok</th></tr></thead><tbody>${d.lines
        .map((l) => `<tr><td>${esc(productOf(l.code)?.name || l.code)}<div class="cell-sub">${esc(l.code)}</div></td><td><span class="code">${esc(l.plant)}</span> ${esc(whName(l.plant))}</td><td class="num ${l.sign === -1 ? 'neg' : ''}">${l.sign === -1 ? '−' : '+'}${num(l.qty)}</td><td class="num">${l.before != null ? `${num(l.before)} → <strong>${num(l.after)}</strong>` : '—'}</td></tr>`)
        .join('')}</tbody></table></div>`)}
      ${dsec('Başlık', kv([
        ['Belge tarihi', date(d.date)],
        d.poNo ? ['Sipariş', `<button class="link" type="button" data-act="doc" data-doc="po:${esc(d.poNo)}">${esc(d.poNo)}</button>`] : null,
        ['Kaydeden', esc(actor(d.createdBy))],
        d.note ? ['Not', esc(d.note)] : null,
      ]))}
    </div>`;
  openDrawer(html, (el) => docAction('mdoc', no, el));
}

// ---------- belge akışı ----------
export function p2pFlowHtml(anchor) {
  const s = read();
  let po = null;
  let pr = null;
  if (anchor.type === 'pr') {
    pr = getPr(anchor.no, s);
    po = pr?.poNo ? getPo(pr.poNo, s) : null;
  } else {
    if (anchor.type === 'fidoc') {
      const [k, n] = String(anchor.source || '').split(':');
      anchor = { ...anchor, mdocNo: k === 'WE' ? n : null, invNo: k === 'RE' ? n : null };
    }
    po = anchor.type === 'po' ? getPo(anchor.no, s)
      : anchor.type === 'mdoc' ? getPo(getMdoc(anchor.no, s)?.poNo, s)
      : anchor.type === 'fidoc' ? getPo(anchor.mdocNo ? getMdoc(anchor.mdocNo, s)?.poNo : getInv(anchor.invNo, s)?.poNo, s)
      : getPo(getInv(anchor.no, s)?.poNo, s);
    pr = po?.prNo ? getPr(po.prNo, s) : null;
  }
  const node = (type, no, lvl, label, ic, status, meta) => {
    const isCur = anchor.type === type && anchor.no === no;
    if (!no) return `<li class="df-node is-empty" style="--lvl:${lvl}"><span class="df-ico">${icon(ic)}</span><div class="df-body"><span class="df-type">${esc(label)}</span><span class="cell-sub">Henüz oluşturulmadı</span></div></li>`;
    return `<li class="df-node${isCur ? ' is-current' : ''}" style="--lvl:${lvl}"><button class="df-btn" type="button" data-act="doc" data-doc="${type}:${esc(no)}" ${isCur ? 'aria-current="true"' : ''}><span class="df-ico">${icon(ic)}</span><span class="df-body"><span class="df-top"><span class="df-type">${esc(label)}</span><span class="code">${esc(no)}</span><span class="flow-sys is-erp">MM</span></span><span class="df-meta">${status}<span class="cell-sub">${meta}</span></span></span></button></li>`;
  };
  const grs = po ? grFor(po, s) : [];
  const invs = po ? invsFor(po, s) : [];
  return `<ol class="docflow">
    ${node('pr', pr?.no, 0, 'Satın alma talebi', 'inbox', pr ? badge(PR_STATUS[pr.status].label, PR_STATUS[pr.status].tone) : '', pr ? `${num(pr.qty)} ${esc(productOf(pr.code)?.unit || '')} · ${money(pr.value ?? pr.price * pr.qty)}` : '')}
    ${node('po', po?.no, 1, 'Satın alma siparişi', 'cart', po ? badge(PO_STATUS[po.status].label, PO_STATUS[po.status].tone) : '', po ? `${date(po.date)} · ${money(poNet(po))}` : '')}
    ${po ? (grs.length ? grs.map((d) => node('mdoc', d.no, 2, 'Mal girişi (101)', 'truck', badge(`${num(sum(d.lines, (l) => l.qty))}`, 'success'), `${date(d.date)} · ${esc(d.lines[0]?.plant || '')}`) + fiNodesHtml(`WE:${d.no}`, 3, anchor)).join('') : node('mdoc', null, 2, 'Mal girişi (101)', 'truck')) : ''}
    ${po ? (invs.length ? invs.map((i) => node('sinv', i.no, 3, 'Tedarikçi faturası', 'book', badge(INV_STATUS[i.status].label, INV_STATUS[i.status].tone), `${esc(i.ref)} · ${money(i.gross)}`) + fiNodesHtml(`RE:${i.no}`, 4, anchor)).join('') : node('sinv', null, 3, 'Tedarikçi faturası', 'book')) : ''}
  </ol>`;
}

// ---------- belge panelleri: ortak işlemler ----------
function docAction(kind, no, el) {
  const act = el.dataset.act;
  if (el.dataset.open) return openDetail(el.dataset.open, el.dataset.id);
  if (act === 'doc') return openDocRef(el.dataset.doc);
  if (act === 'window-print') return window.print();
  const root = el.closest('.drawer-inner');
  const note = root?.querySelector('[data-note]')?.value.trim() || '';
  if (act === 'release' || act === 'reject') {
    const r = releaseDoc(kind, no, act === 'release', note);
    if (r.error) {
      if (act === 'reject') root?.querySelector('[data-note]')?.focus();
      return toast(r.error);
    }
    toast(`${no} ${act === 'release' ? 'onaylandı' : 'reddedildi'}`);
    return openDocRef(`${kind}:${no}`);
  }
  if (act === 'to-po') {
    const r = createPO(no);
    if (r.error) return toast(r.error);
    toast(`Sipariş ${r.po.no} oluşturuldu${r.po.status === 'pending' ? ' · onaya düştü' : ''}`);
    return openPo(r.po.no);
  }
  if (act === 'print') return openPo(no, 'print');
  if (act === 'send') {
    const r = sendPO(no);
    if (r.error) return toast(r.error);
    toast(`${no} tedarikçiye gönderildi`);
    return openPo(no);
  }
  if (act === 'go-gr' || act === 'go-inv') {
    closeDrawer(true);
    if (act === 'go-gr') grPo = no;
    else invPo = no;
    tab = act === 'go-gr' ? 'gr' : 'invoice';
    if (rootRef?.isConnected) refreshAll();
    else location.hash = `#/track/s4-mm/simulation?tab=${tab}`;
    return;
  }
  if (act === 'unblock') {
    const r = unblockInvoice(no, root?.querySelector('[data-ub-note]')?.value || '');
    if (r.error) return toast(r.error);
    toast(`${no}: blokaj kaldırıldı`);
    return openInv(no);
  }
}

// FI modülü için salt okunur durum
export const mmState = () => read();
export const mmPoNet = (po) => poNet(po);

// ---------- onay kutusu ----------
export function mmInbox(user = currentUser()) {
  let s;
  try {
    s = read();
  } catch {
    return [];
  }
  const out = [];
  if (can('PR_RELEASE')) for (const pr of s.prs) if (pr.status === 'pending' && pr.createdBy !== user?.id) out.push({ kind: 'pr', no: pr.no, value: pr.value ?? pr.price * pr.qty, title: `${productOf(pr.code)?.name || pr.code} · ${num(pr.qty)}`, by: pr.createdBy, at: pr.createdAt, reason: `Talep tutarı ${money(rules().prReleaseLimit)} eşiğini aşıyor` });
  if (can('PO_RELEASE')) for (const po of s.pos) if (po.status === 'pending' && po.createdBy !== user?.id) out.push({ kind: 'po', no: po.no, value: poNet(po), title: supplierOf(po.supplier)?.name || po.supplier, by: po.createdBy, at: po.createdAt, reason: `Sipariş tutarı ${money(rules().poReleaseLimit)} eşiğini aşıyor` });
  return out;
}

// ---------- sıfırlama ----------
export function resetMM() {
  const s = read();
  // Simülasyonda kaydedilen stok hareketlerini geri al
  for (const d of [...s.mdocs].reverse()) {
    if (d.historic) continue;
    for (const l of d.lines) {
      const p = productOf(l.code);
      if (!p) continue;
      const delta = (l.sign === -1 ? -1 : 1) * l.qty;
      // Sonradan yapılan satış çıkışları stoğu düşürmüş olabilir: negatife inmez
      updateProduct(l.code, { stock: { ...p.stock, [l.plant]: Math.max(0, (p.stock[l.plant] ?? 0) - delta) } }, { silent: true });
    }
  }
  try {
    localStorage.removeItem(KEY);
  } catch {}
  grPo = invPo = '';
  trPrefill = null;
  refresh();
}

// ---------- olaylar ----------
function bindRoot(root) {
  root.addEventListener('click', (e) => {
    const qs = (sel) => e.target.closest(sel);
    let el;
    if ((el = qs('[data-tab]'))) {
      tab = el.dataset.tab;
      return refreshAll();
    }
    if ((el = qs('[data-reset-mm]'))) {
      if (!el.classList.contains('confirm')) {
        el.classList.add('confirm');
        el.textContent = 'Emin misin? Tüm modüllerin işlem verisi (belgeler, stok, bakiye, onaylar, defect kayıtları) sıfırlanır · tekrar dokun';
        return;
      }
      resetAllDemo();
      return toast('Tüm modüllerin demo verisi başlangıç haline döndü');
    }
    if ((el = qs('[data-suggest]'))) return openPrForm({ code: el.dataset.suggest });
    if (qs('[data-new-pr]')) return openPrForm({});
    if ((el = qs('[data-post-gr]'))) {
      const qtys = Object.fromEntries([...root.querySelectorAll('[data-grqty]')].map((i) => [i.dataset.grqty, Number(i.value) || 0]));
      const r = postGR(el.dataset.postGr, qtys, root.querySelector('[data-grnote]')?.value.trim() || '');
      if (r.error) return toast(r.error);
      toast(`Malzeme belgesi ${r.mdoc.no} · stok arttı${r.partial ? ' · kısmi teslimat, sipariş açık' : ''}`);
      return refreshAll();
    }
    if ((el = qs('[data-post-inv]'))) {
      const f = root.querySelector('[data-invform]');
      const r = postInvoice(el.dataset.postInv, { ref: f.querySelector('[data-invref]').value.trim(), invDate: f.querySelector('[data-invdate]').value, lines: readInvLines(f) });
      if (r.error) return toast(r.error);
      toast(`Fatura ${r.invoice.no} ${r.invoice.status === 'blocked' ? 'kaydedildi · ödemeye bloke' : 'kaydedildi · ödemeye açık'}`);
      refreshAll();
      return openInv(r.invoice.no);
    }
    if (qs('[data-post-tr]')) {
      const f = root.querySelector('[data-trform]');
      const v = (k) => f.querySelector(`[data-t="${k}"]`).value;
      const r = postTransfer({ code: v('code'), from: v('from'), to: v('to'), qty: Number(v('qty')), note: v('note').trim() });
      if (r.error) return toast(r.error);
      trPrefill = null;
      toast(`Transfer ${r.mdoc.no} (301) kaydedildi`);
      return refreshAll();
    }
    if ((el = qs('[data-fill]'))) {
      trPrefill = JSON.parse(el.dataset.fill);
      return drawBody();
    }
    if ((el = qs('[data-order]'))) return openDoc('order', el.dataset.order);
    if (e.target.closest('input,select,label')) return;
    if ((el = qs('[data-doc]'))) return openDocRef(el.dataset.doc);
    if ((el = qs('[data-stock]'))) return openStock(el.dataset.stock);
  });
  root.addEventListener('change', (e) => {
    const t = e.target;
    if (t.matches('[data-crit]')) {
      onlyCritical = t.checked;
      return drawBody();
    }
    if (t.matches('[data-grpo]')) {
      grPo = t.value;
      return drawBody();
    }
    if (t.matches('[data-invpo]')) {
      invPo = t.value;
      return drawBody();
    }
    if (t.closest('[data-invform]')) return updateMatch(root);
    if (t.closest('[data-trform]')) return updateTransfer(root);
  });
  root.addEventListener('input', (e) => {
    const t = e.target;
    if (t.matches('[data-mmq]')) {
      q = t.value;
      const pos = t.selectionStart;
      drawBody();
      const inp = root.querySelector('[data-mmq]');
      inp?.focus();
      inp?.setSelectionRange(pos, pos);
      return;
    }
    if (t.closest('[data-invform]')) return updateMatch(root);
    if (t.closest('[data-trform]')) return updateTransfer(root);
  });
  root.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const r = e.target.closest('tr[data-doc],tr[data-stock]');
    if (!r || e.target.matches('input,select,textarea')) return;
    e.preventDefault();
    r.click();
  });
}

// Belge türlerini ERP belge yönlendiricisine kaydet (derin bağlantı: ?open=po:4500000001)
const lazy = (fn) => (no) => loadMM().then(() => fn(no));
registerDocType('pr', lazy(openPr));
registerDocType('po', lazy(openPo));
registerDocType('mdoc', lazy(openMdoc));
registerDocType('sinv', lazy(openInv));

export const _test = { read, getPo, getPr, getInv, suggestion, inTransit, covered, viewHtml: (t) => headHtml() + viewHtml(t, read()), openPr, openPo, openMdoc, openInv, openStock, openPoPrint: (no) => openPo(no, 'print'), setData: (d) => (MMD = d) };
