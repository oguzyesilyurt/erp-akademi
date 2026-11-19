// Finans & Maliyet (FI/CO) çalışma alanı (s4-fico > Simülasyon, simulation.type = "fi")
// Muhasebe belgeleri mevcut O2C/P2P olaylarından türetilir (Tekdüzen Hesap Planı):
//   teslimat (WA) · satış faturası (RV) · mal girişi (WE) · tedarikçi faturası (RE) · tahsilat (DZ) · ödeme (KZ)
// Türetme deterministiktir: belge numaraları (1000000001…) olay sırasına göre her seferinde aynı çıkar.
import { icon } from './icons.js';
import { stripQuery } from './router.js';
import { progress } from './store.js';
import {
  esc, money2 as money, num, date, datetime, pct1, round2, badge, emptyState, toast, openDrawer, drawerHead, kv, dsec, alertBox,
} from './ui.js';
import { loadRoles, can, actionBtn, currentUser, userLabel, holders, roleById, lockReason } from './auth.js';
import {
  loadCompany, company, partnerOf, productOf, supplierOf, updateCustomer, useBase, priceFor, creditStatus, channelName, termOf,
} from './company.js';
import { orders, getOrder, getDelivery, getInvoice, invoices as erpInvoices, registerDocType, registerFiLookup, openDocRef, flowHtml } from './erp.js';
import { loadMM, mmState, p2pFlowHtml } from './mm.js';
import { resetAllDemo } from './demo-reset.js';

const KEY = 'erp-akademi:fi';
const FIRST_NO = 1000000001;
const DOC_TYPE = {
  SA: 'Genel muhasebe kaydı', WA: 'Mal çıkışı (teslimat)', RV: 'Satış faturası', WE: 'Mal girişi', RE: 'Tedarikçi faturası', DZ: 'Müşteri tahsilatı', KZ: 'Tedarikçi ödemesi',
};
const BUCKETS = [
  { id: 'notdue', label: 'Vadesi gelmemiş' },
  { id: 'b30', label: '0–30 gün' },
  { id: 'b60', label: '31–60 gün' },
  { id: 'b60p', label: '60+ gün' },
];

let FID = null; // s4-fico.json
let tab = 'journal';
let repView = 'tb';
let coView = 'copa';
let copaDim = 'segment';
let arCustomer = '';
let jFilter = '';
let rootRef = null;

const me = () => currentUser();
const today = () => company().asOf;
const cfg = () => FID.sections.simulation;
const sd = () => cfg().seed;
const accName = (code) => cfg().accounts.find((a) => a.code === code)?.name || code;
const sum = (list, f) => list.reduce((a, x) => a + f(x), 0);
function addDays(iso, n) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const dayDiff = (a, b) => Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 864e5);
// Standart birim maliyet: ana tedarikçinin satın alma fiyatı (bilgi kaydı)
const unitCost = (code) => {
  const p = productOf(code);
  return supplierOf(p?.supplier)?.prices?.[code] ?? 0;
};
const pcOf = (code) => cfg().profitCenters.find((x) => x.division === productOf(code)?.division)?.id || 'PC01';

export async function loadFI() {
  if (!FID) {
    const r = await fetch('data/tracks/s4-fico.json', { cache: 'no-cache' });
    FID = await r.json();
  }
  await Promise.all([loadCompany(), loadRoles(), loadMM()]);
  return FID;
}

// ---------- depolama ----------
function read() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (s && s.v === 1) return s;
  } catch {}
  return { v: 1, receipts: [], runs: [], seq: { dz: 0, run: 0 } };
}
function write(s) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {}
}
function markDone() {
  if (progress.isDone('s4-fico', 'simulation')) return;
  progress.setDone('s4-fico', 'simulation', true);
  document.dispatchEvent(new CustomEvent('erp:progress'));
}

// ---------- başlangıç verisi (Kasım faturaları, açılış) ----------
// Kasım faturaları orijinal ana veriyle (useBase) fiyatlanır; v1.1 hataları etkilemez.
function novInvoices() {
  return useBase(() =>
    sd().salesInvoices.map((inv) => {
      const c = partnerOf(inv.customer);
      const lines = inv.lines.map((l) => {
        const r = priceFor(l.code, c.segment, c.channel, l.qty);
        const listTotal = round2(r.list * l.qty);
        const netTotal = round2(r.net * l.qty);
        return { code: l.code, qty: l.qty, list: r.list, net: r.net, listTotal, netTotal, discount: round2(listTotal - netTotal), vat: round2((netTotal * r.vatRate) / 100), cost: round2(unitCost(l.code) * l.qty), pc: pcOf(l.code) };
      });
      const net = round2(sum(lines, (l) => l.netTotal));
      const vat = round2(sum(lines, (l) => l.vat));
      return { ...inv, segment: c.segment, channel: c.channel, region: c.region, customerName: c.name, lines, net, vat, gross: round2(net + vat), dueDate: addDays(inv.date, termOf(c.paymentTerm)?.days || 0) };
    })
  );
}

function baseCustomers() {
  return useBase(() => company().customers.map((c) => ({ id: c.id, name: c.name, openBalance: c.openBalance, overdue: c.overdue, paymentTerm: c.paymentTerm })));
}

// ---------- muhasebe belgeleri (türetilmiş) ----------
let cache = null;
let cacheSig = '';
function signature() {
  let a = '';
  let b = '';
  let c = '';
  try {
    a = localStorage.getItem('erp-akademi:erp') || '';
    b = localStorage.getItem('erp-akademi:mm') || '';
    c = localStorage.getItem(KEY) || '';
  } catch {}
  return `${a.length}:${a.slice(-80)}|${b.length}:${b.slice(-80)}|${c.length}:${c.slice(-80)}`;
}

export function ledger() {
  const sig = signature();
  if (cache && sig === cacheSig) return cache;
  const docs = [];
  const add = (d) => docs.push(d);
  const seed = sd();
  const nov = novInvoices();
  const custs = baseCustomers();
  const mm = mmState();
  const st = read();

  // --- açılış (Ekim sonu) ---
  const histGr = mm.mdocs.filter((d) => d.type === '101' && d.historic);
  const poPrice = (poNo, pos) => mm.pos.find((p) => p.no === poNo)?.lines.find((l) => l.pos === pos)?.price ?? 0;
  const baseStock = useBase(() => round2(sum(company().products, (p) => sum(Object.values(p.stock), (q) => q) * unitCost(p.code))));
  const novCost = round2(sum(nov, (i) => sum(i.lines, (l) => l.cost)));
  const histGrVal = round2(sum(histGr, (d) => sum(d.lines, (l) => l.qty * poPrice(d.poNo, l.pos))));
  const open153 = round2(baseStock + novCost - histGrVal);
  const novByCust = (id) => round2(sum(nov.filter((i) => i.customer === id), (i) => i.gross));
  const open120 = round2(sum(custs, (c) => c.openBalance - novByCust(c.id)));
  const open320 = round2(sum(seed.apItems, (x) => x.amount));
  const drTotal = round2(seed.bank + open120 + open153);
  add({
    key: 'OPEN', group: 0, date: seed.openingDate, ord: 0, type: 'SA', text: 'Açılış kaydı · Ekim sonu bakiyeleri (eğitim amaçlı basitleştirilmiş)', source: null,
    lines: [
      { acc: '102', dr: seed.bank, text: 'Banka bakiyesi' },
      { acc: '120', dr: open120, text: 'Müşteri açık kalemleri (Ekim sonu)' },
      { acc: '153', dr: open153, text: 'Stok değeri (standart maliyetle)' },
      { acc: '320', cr: open320, text: 'Tedarikçi açık kalemleri' },
      { acc: '500', cr: round2(drTotal - open320), text: 'Özkaynak (fark)' },
    ],
  });
  // --- Kasım: teslimat (WA) + fatura (RV) ---
  nov.forEach((i, k) => {
    add({ key: `SWA:${i.id}`, group: 0, date: i.date, ord: 10 + k * 2, type: 'WA', text: `Mal çıkışı · ${i.customerName}`, source: null, ref: i.id, lines: [...pcSplit(i.lines, '621', 'dr', (l) => l.cost), { acc: '153', cr: round2(sum(i.lines, (l) => l.cost)), text: 'Stok çıkışı' }] });
    add({ key: `SRV:${i.id}`, group: 0, date: i.date, ord: 11 + k * 2, type: 'RV', text: `Satış faturası ${i.id} · ${i.customerName}`, source: null, ref: i.id, item: `NOV:${i.id}`, ...rvLines(i.customer, i.customerName, i.lines, i.vat, i.gross) });
  });
  // --- Kasım genel giderleri ---
  seed.expenses.forEach((e, k) => {
    const total = round2(sum(e.lines, (l) => l.amount));
    add({ key: `EXP:${e.id}`, group: 0, date: e.date, ord: 200 + k, type: 'SA', text: e.text, source: null, ref: e.id, lines: [...e.lines.map((l) => ({ acc: l.account, dr: l.amount, cc: l.cc, text: ccName(l.cc) })), { acc: '102', cr: total, text: 'Banka ödemesi' }] });
  });
  // --- mal girişleri (devralınan ve simülasyon) ---
  for (const d of mm.mdocs.filter((x) => x.type === '101')) {
    const val = round2(sum(d.lines, (l) => l.qty * poPrice(d.poNo, l.pos)));
    add({ key: `WE:${d.no}`, group: d.historic ? 0 : 1, date: d.date, ord: 300, at: d.createdAt, type: 'WE', text: `Mal girişi 101 · sipariş ${d.poNo}`, source: `WE:${d.no}`, ref: d.no, lines: [{ acc: '153', dr: val, text: 'Stok girişi (sipariş fiyatıyla)' }, { acc: '329', cr: val, text: 'GR/IR: faturası henüz gelmemiş mal' }] });
  }
  // --- simülasyon: teslimat ve satış faturası ---
  const E = { orders: orders() };
  for (const o of E.orders) {
    if (o.deliveryNo) {
      const d = getDelivery(o.deliveryNo);
      if (d) {
        const lines = d.lines.map((l) => ({ code: l.code, cost: round2(unitCost(l.code) * l.qty), pc: pcOf(l.code) }));
        add({ key: `WA:${d.no}`, group: 1, date: d.date, at: d.createdAt, type: 'WA', text: `Mal çıkışı (601) · teslimat ${d.no}`, source: `WA:${d.no}`, ref: d.no, lines: [...pcSplit(lines, '621', 'dr', (l) => l.cost), { acc: '153', cr: round2(sum(lines, (l) => l.cost)), text: 'Stok çıkışı' }] });
      }
    }
  }
  for (const inv of erpInvoices()) {
    const o = getOrder(inv.orderNo);
    if (!o) continue;
    const lines = o.lines.map((l) => {
      const listTotal = round2((l.list ?? l.net) * l.qty);
      return { code: l.code, listTotal, netTotal: l.netTotal, discount: round2(listTotal - l.netTotal), pc: pcOf(l.code) };
    });
    add({ key: `RV:${inv.no}`, group: 1, date: inv.date, at: inv.createdAt, type: 'RV', text: `Satış faturası ${inv.no} · ${inv.customerName}`, source: `RV:${inv.no}`, ref: inv.no, item: `INV:${inv.no}`, ...rvLines(inv.customer, inv.customerName, lines, inv.vat, inv.gross) });
  }
  // --- tedarikçi faturaları ---
  for (const v of mm.invs) {
    const po = mm.pos.find((p) => p.no === v.poNo);
    const grir = round2(sum(v.lines, (l) => l.qty * l.poPrice));
    const diff = round2(v.net - grir);
    const sup = supplierOf(v.supplier);
    const lines = [{ acc: '329', dr: grir, text: 'GR/IR denkleştirme (sipariş fiyatıyla)' }];
    if (diff > 0) lines.push({ acc: '153', dr: diff, text: 'Fiyat farkı (stok değerine)' });
    if (diff < 0) lines.push({ acc: '153', cr: -diff, text: 'Fiyat farkı (stok değerinden)' });
    lines.push({ acc: '191', dr: v.vat, text: 'İndirilecek KDV' }, { acc: '320', cr: v.gross, text: sup?.name || v.supplier, partner: v.supplier });
    add({ key: `RE:${v.no}`, group: 1, date: v.date, at: v.createdAt, type: 'RE', text: `Tedarikçi faturası ${v.ref} · ${sup?.name || ''}${po ? ` · PO ${po.no}` : ''}`, source: `RE:${v.no}`, ref: v.no, item: `SINV:${v.no}`, lines });
  }
  // --- tahsilatlar ve ödemeler ---
  for (const r of st.receipts) {
    const c = partnerOf(r.customer);
    add({ key: `DZ:${r.id}`, group: 1, date: r.date, at: r.createdAt, type: 'DZ', text: `Tahsilat · ${c?.name || r.customer}${r.note ? ` · ${r.note}` : ''}`, source: r.allocations.find((a) => a.key.startsWith('INV:')) ? `RV:${r.allocations.find((a) => a.key.startsWith('INV:')).key.slice(4)}` : null, ref: r.id, receipt: r.id, lines: [{ acc: '102', dr: r.amount, text: 'Banka' }, { acc: '120', cr: r.amount, text: c?.name || r.customer, partner: r.customer }] });
  }
  for (const run of st.runs) {
    run.payments.forEach((p, k) => {
      const sup = supplierOf(p.supplier);
      const sinv = p.items.find((x) => x.startsWith('SINV:'));
      add({ key: `KZ:${run.id}:${k}`, group: 1, date: run.date, at: run.createdAt, atK: k, type: 'KZ', text: `Ödeme programı ${run.id} · ${sup?.name || p.supplier}`, source: sinv ? `RE:${sinv.slice(5)}` : null, ref: run.id, payment: { run: run.id, k }, lines: [{ acc: '320', dr: p.amount, text: sup?.name || p.supplier, partner: p.supplier }, { acc: '102', cr: p.amount, text: 'Banka' }] });
    });
  }

  // numaralama: önce devralınan kayıtlar (tarih, sıra), sonra simülasyon olayları (oluşma zamanı)
  // aynı anda oluşan olaylarda süreç sırası: mal girişi → tedarikçi faturası → teslimat → satış faturası → tahsilat → ödeme
  const RANK = { WE: 1, RE: 2, WA: 3, RV: 4, DZ: 5, KZ: 6 };
  docs.sort((x, y) => x.group - y.group || (x.group === 0 ? x.date.localeCompare(y.date) || x.ord - y.ord : String(x.at).localeCompare(String(y.at)) || (RANK[x.type] || 9) - (RANK[y.type] || 9) || (x.atK || 0) - (y.atK || 0) || x.key.localeCompare(y.key)));
  docs.forEach((d, i) => {
    d.no = String(FIRST_NO + i);
    d.lines = d.lines.filter((l) => (l.dr || 0) !== 0 || (l.cr || 0) !== 0).map((l) => ({ ...l, dr: round2(l.dr || 0), cr: round2(l.cr || 0) }));
    d.amount = round2(sum(d.lines, (l) => l.dr));
  });
  cache = { docs, nov, custs };
  cacheSig = sig;
  return cache;
}
const ccName = (id) => cfg().costCenters.find((c) => c.id === id)?.name || id;

function pcSplit(lines, acc, side, f) {
  const by = {};
  for (const l of lines) by[l.pc] = round2((by[l.pc] || 0) + f(l));
  return Object.entries(by).map(([pc, v]) => ({ acc, [side]: v, pc, text: cfg().profitCenters.find((p) => p.id === pc)?.name || pc }));
}
function rvLines(customer, name, lines, vat, gross) {
  return {
    lines: [
      { acc: '120', dr: gross, text: name, partner: customer },
      ...pcSplit(lines, '600', 'cr', (l) => l.listTotal),
      ...pcSplit(lines, '611', 'dr', (l) => l.discount),
      { acc: '391', cr: vat, text: 'Hesaplanan KDV' },
    ],
  };
}

export const fiDocs = () => ledger().docs;
export const fiDoc = (no) => fiDocs().find((d) => d.no === no) || null;

// Kaynak belgeye bağlı muhasebe belgeleri (belge akışı için)
function lookup(key) {
  const docs = fiDocs();
  const out = docs.filter((d) => d.source === key && (d.type !== 'DZ' && d.type !== 'KZ'));
  const [k, n] = key.split(':');
  if (k === 'RV') {
    const recs = read().receipts.filter((r) => r.allocations.some((a) => a.key === `INV:${n}`));
    out.push(...docs.filter((d) => d.type === 'DZ' && recs.some((r) => r.id === d.receipt)));
  }
  if (k === 'RE') out.push(...docs.filter((d) => d.type === 'KZ' && read().runs.find((r) => r.id === d.payment.run)?.payments[d.payment.k]?.items.includes(`SINV:${n}`)));
  return out.map((d) => ({ no: d.no, type: d.type, label: d.type === 'DZ' ? 'Tahsilat (muhasebe)' : d.type === 'KZ' ? 'Ödeme (muhasebe)' : 'Muhasebe belgesi', date: d.date, amount: d.amount }));
}

// ---------- alacaklar ----------
export function arItems() {
  const { nov, custs } = ledger();
  const items = [];
  for (const c of custs) {
    const op = sd().customerOpening[c.id] || { overdue: [], restDue: today() };
    op.overdue.forEach((x, i) => items.push({ key: `OP:${c.id}:${i}`, customer: c.id, ref: x.ref, docDate: x.docDate, dueDate: x.dueDate, amount: x.amount, kind: 'Devreden' }));
    const rest = round2(c.openBalance - sum(op.overdue, (x) => x.amount) - sum(nov.filter((i) => i.customer === c.id), (i) => i.gross));
    if (rest > 0) items.push({ key: `OP:${c.id}:rest`, customer: c.id, ref: 'Ekim devreden', docDate: addDays(op.restDue, -(termOf(c.paymentTerm)?.days || 0)), dueDate: op.restDue, amount: rest, kind: 'Devreden' });
  }
  for (const i of nov) items.push({ key: `NOV:${i.id}`, customer: i.customer, ref: i.id, docDate: i.date, dueDate: i.dueDate, amount: i.gross, kind: 'Fatura' });
  for (const i of erpInvoices()) items.push({ key: `INV:${i.no}`, customer: i.customer, ref: i.no, docDate: i.date, dueDate: i.dueDate, amount: i.gross, kind: 'Fatura' });
  const alloc = {};
  for (const r of read().receipts) for (const a of r.allocations) alloc[a.key] = round2((alloc[a.key] || 0) + a.amount);
  const t = today();
  return items.map((x) => {
    const open = round2(x.amount - (alloc[x.key] || 0));
    const days = dayDiff(t, x.dueDate);
    return { ...x, open, paid: round2(alloc[x.key] || 0), days, bucket: days <= 0 ? 'notdue' : days <= 30 ? 'b30' : days <= 60 ? 'b60' : 'b60p' };
  });
}

function aging(items) {
  const b = Object.fromEntries(BUCKETS.map((x) => [x.id, 0]));
  for (const i of items) if (i.open > 0) b[i.bucket] = round2(b[i.bucket] + i.open);
  b.total = round2(sum(BUCKETS, (x) => b[x.id]));
  return b;
}

// Tahsilatı en eski vadeli açık kalemden başlayarak dağıtır
export function allocate(customer, amount) {
  const open = arItems().filter((i) => i.customer === customer && i.open > 0).sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.key.localeCompare(b.key));
  let left = round2(amount);
  const out = [];
  for (const i of open) {
    if (left <= 0) break;
    const a = round2(Math.min(left, i.open));
    out.push({ key: i.key, ref: i.ref, amount: a, full: a === i.open, dueDate: i.dueDate });
    left = round2(left - a);
  }
  return { allocations: out, unapplied: left, openTotal: round2(sum(open, (i) => i.open)) };
}

export function postReceipt({ customer, amount, note = '' }) {
  if (!can('CASH_RECEIPT')) return { error: lockReason('CASH_RECEIPT') };
  const c = partnerOf(customer);
  if (!c) return { error: 'Müşteri seç' };
  if (!(amount > 0)) return { error: 'Tutar sıfırdan büyük olmalı' };
  const a = allocate(customer, amount);
  if (a.unapplied > 0) return { error: `Açık kalem toplamı ${money(a.openTotal)}; fazlası avans olarak bu simülasyonda kaydedilemez` };
  const s = read();
  s.seq.dz = (s.seq.dz || 0) + 1;
  const r = { id: `TH-${String(s.seq.dz).padStart(4, '0')}`, customer, amount: round2(amount), date: today(), allocations: a.allocations.map(({ key, amount: x }) => ({ key, amount: x })), note, by: me().id, createdAt: new Date().toISOString() };
  s.receipts.push(r);
  write(s);
  cache = null;
  // açık bakiye ve vadesi geçmiş tutar ana veride güncellenir → kredi durumu değişir
  const before = creditStatus(c);
  const overdue = round2(sum(arItems().filter((i) => i.customer === customer && i.open > 0 && i.days > 0), (i) => i.open));
  updateCustomer(customer, { openBalance: round2(c.openBalance - amount), overdue }, { silent: true });
  markDone();
  document.dispatchEvent(new CustomEvent('erp:refresh'));
  return { receipt: r, before, after: creditStatus(partnerOf(customer)) };
}

// ---------- borçlar ----------
export function apItems() {
  const mm = mmState();
  const items = sd().apItems.map((x) => ({ key: `AP:${x.ref}`, supplier: x.supplier, ref: x.ref, docDate: x.docDate, dueDate: x.dueDate, amount: x.amount, block: x.block || null, kind: 'Devreden' }));
  for (const v of mm.invs) items.push({ key: `SINV:${v.no}`, supplier: v.supplier, ref: `${v.ref} (${v.no})`, docDate: v.date, dueDate: v.dueDate, amount: v.gross, block: v.status === 'blocked' ? `Fatura doğrulamada ödemeye bloke edildi (R): ${v.blockReasons.join(' · ')}` : null, kind: 'Fatura', sinv: v.no });
  const paid = new Set(read().runs.flatMap((r) => r.payments.flatMap((p) => p.items)));
  return items.map((x) => ({ ...x, paid: paid.has(x.key), days: dayDiff(today(), x.dueDate) }));
}

export function proposal(nextRun) {
  const items = apItems().filter((i) => !i.paid);
  const pay = [];
  const excluded = [];
  for (const i of items) {
    if (i.dueDate >= nextRun) excluded.push({ ...i, reason: `Vadesi ${date(i.dueDate)}; sonraki çalıştırmada (${date(nextRun)}) ödenecek` });
    else if (i.block) excluded.push({ ...i, reason: i.block, blocked: true });
    else pay.push(i);
  }
  const bySup = {};
  for (const i of pay) (bySup[i.supplier] = bySup[i.supplier] || []).push(i);
  return { payments: Object.entries(bySup).map(([supplier, list]) => ({ supplier, items: list, amount: round2(sum(list, (x) => x.amount)) })), excluded };
}

export function runPayments(nextRun) {
  if (!can('PAYMENT_RUN')) return { error: lockReason('PAYMENT_RUN') };
  if (!nextRun || nextRun <= today()) return { error: 'Sonraki çalıştırma tarihi bugünden sonra olmalı' };
  const p = proposal(nextRun);
  if (!p.payments.length) return { error: 'Ödenecek kalem yok' };
  const s = read();
  s.seq.run = (s.seq.run || 0) + 1;
  const run = { id: `F110-${String(s.seq.run).padStart(3, '0')}`, date: today(), nextRun, payments: p.payments.map((x) => ({ supplier: x.supplier, items: x.items.map((i) => i.key), amount: x.amount })), excluded: p.excluded.map((x) => ({ key: x.key, reason: x.reason })), by: me().id, createdAt: new Date().toISOString() };
  s.runs.push(run);
  write(s);
  cache = null;
  markDone();
  document.dispatchEvent(new CustomEvent('erp:refresh'));
  return { run };
}

// ---------- raporlar ----------
export function trialBalance() {
  const acc = {};
  for (const d of fiDocs()) for (const l of d.lines) {
    const a = (acc[l.acc] = acc[l.acc] || { code: l.acc, dr: 0, cr: 0 });
    a.dr = round2(a.dr + l.dr);
    a.cr = round2(a.cr + l.cr);
  }
  return cfg().accounts.filter((a) => acc[a.code]).map((a) => {
    const x = acc[a.code];
    const bal = round2(x.dr - x.cr);
    return { ...a, dr: x.dr, cr: x.cr, balDr: bal > 0 ? bal : 0, balCr: bal < 0 ? -bal : 0, bal };
  });
}

export function incomeStatement(tb = trialBalance()) {
  const b = (code) => tb.find((a) => a.code === code)?.bal || 0;
  const gross = -b('600');
  const ded = b('611');
  const net = round2(gross - ded);
  const cogs = b('621');
  const gp = round2(net - cogs);
  const opex = [{ code: '631', v: b('631') }, { code: '632', v: b('632') }];
  const op = round2(gp - sum(opex, (x) => x.v));
  return { gross, ded, net, cogs, gp, opex, op };
}

export function balanceSheet(tb = trialBalance()) {
  const is = incomeStatement(tb);
  const assets = tb.filter((a) => a.kind === 'asset').map((a) => ({ code: a.code, name: a.name, v: a.bal }));
  const liab = tb.filter((a) => a.kind === 'liability').map((a) => ({ code: a.code, name: a.name, v: -a.bal }));
  const equity = tb.filter((a) => a.kind === 'equity').map((a) => ({ code: a.code, name: a.name, v: -a.bal }));
  equity.push({ code: '590', name: 'Dönem Net Kârı', v: is.op });
  const ta = round2(sum(assets, (x) => x.v));
  const tl = round2(sum(liab, (x) => x.v) + sum(equity, (x) => x.v));
  return { assets, liab, equity, ta, tl, ok: Math.abs(ta - tl) < 0.01 };
}

// ---------- CO ----------
export function copaRecords() {
  const out = [];
  for (const i of ledger().nov) for (const l of i.lines) out.push({ doc: i.id, date: i.date, customer: i.customer, segment: i.segment, channel: i.channel, region: i.region, code: l.code, pc: l.pc, qty: l.qty, revenue: l.listTotal, discount: l.discount, net: l.netTotal, cogs: l.cost });
  for (const inv of erpInvoices()) {
    const o = getOrder(inv.orderNo);
    const c = partnerOf(inv.customer);
    if (!o) continue;
    for (const l of o.lines) {
      const listTotal = round2((l.list ?? l.net) * l.qty);
      out.push({ doc: inv.no, date: inv.date, customer: inv.customer, segment: o.segment, channel: o.channel, region: c?.region || '—', code: l.code, pc: pcOf(l.code), qty: l.qty, revenue: listTotal, discount: round2(listTotal - l.netTotal), net: l.netTotal, cogs: round2(unitCost(l.code) * l.qty) });
    }
  }
  return out;
}

const DIMS = {
  segment: { label: 'Segment', key: (r) => r.segment, name: (k) => `Segment ${k}` },
  channel: { label: 'Kanal', key: (r) => r.channel, name: (k) => channelName(k) },
  region: { label: 'Bölge', key: (r) => r.region, name: (k) => k },
  product: { label: 'Ürün', key: (r) => r.code, name: (k) => `${k} · ${productOf(k)?.name || ''}` },
  pc: { label: 'Kâr merkezi', key: (r) => r.pc, name: (k) => `${k} · ${cfg().profitCenters.find((p) => p.id === k)?.name || ''}` },
};

export function copa(dim) {
  const D = DIMS[dim];
  const by = {};
  for (const r of copaRecords()) {
    const k = D.key(r);
    const x = (by[k] = by[k] || { key: k, name: D.name(k), revenue: 0, discount: 0, net: 0, cogs: 0, qty: 0 });
    x.revenue = round2(x.revenue + r.revenue);
    x.discount = round2(x.discount + r.discount);
    x.net = round2(x.net + r.net);
    x.cogs = round2(x.cogs + r.cogs);
  }
  return Object.values(by).map((x) => ({ ...x, margin: round2(x.net - x.cogs), pct: x.net ? ((x.net - x.cogs) / x.net) * 100 : 0 })).sort((a, b) => b.margin - a.margin);
}

export function costCenters() {
  return cfg().costCenters.map((c) => {
    const actual = round2(sum(fiDocs(), (d) => sum(d.lines.filter((l) => l.cc === c.id), (l) => l.dr - l.cr)));
    return { ...c, actual, variance: round2(actual - c.plan), pct: c.plan ? ((actual - c.plan) / c.plan) * 100 : 0 };
  });
}

// ---------- giriş noktası ----------
export async function renderFI(c) {
  FID = c.data || FID;
  await loadFI();
  const q = c.route?.query || {};
  if (q.tab) tab = q.tab;
  if (q.scenario) {
    const sc = FID.sections.scenarios?.items?.find((x) => x.id === q.scenario);
    if (sc?.simulation?.tab) tab = sc.simulation.tab;
    if (sc?.simulation?.customer) arCustomer = sc.simulation.customer;
  }
  if (q.customer) {
    tab = 'ar';
    arCustomer = q.customer;
  }
  const open = q.fidoc;
  if (Object.keys(q).length) stripQuery();
  return {
    html: `<div class="mm fi" data-fi>${headHtml()}<div data-fi-body></div></div>`,
    bind(container) {
      rootRef = container.querySelector('[data-fi]');
      bindRoot(rootRef);
      drawBody();
      if (open) openFiDoc(open);
    },
  };
}

function roleBox(roleId, perm, what) {
  if (holders(perm).length) return '';
  const r = roleById(roleId);
  return `<div class="role-banner tl-warn">${icon('user')}<span><strong>${esc(r?.name || roleId)} rolünde kullanıcı yok.</strong> ${esc(what)} (${esc(perm)}). Kullanıcı Yönetimi'nden oluştur${can('USER_ADMIN') ? '' : ' (USER_ADMIN gerekir: Key User rolüne geç)'}.</span>
    <a class="btn btn-primary" href="#/users?new=${esc(roleId)}">${icon('users')}<span>Kullanıcı Yönetimi'nden oluştur</span></a></div>`;
}

function headHtml() {
  const L = ledger();
  const overdue = arItems().filter((i) => i.open > 0 && i.days > 0).length;
  const due = proposal(addDays(today(), 7)).payments.length;
  const t = (id, label, ic, n = '', danger = false) =>
    `<button type="button" role="tab" data-tab="${id}" aria-selected="${tab === id}" class="${tab === id ? 'is-active' : ''}">${icon(ic)}<span>${label}</span>${n ? ` <span class="count${danger ? ' danger-count' : ''}">${n}</span>` : ''}</button>`;
  return `
    <div class="c4c-head">
      <div class="c4c-who">
        <span class="c4c-logo fi-logo">${icon('chart')}</span>
        <div><strong>S/4HANA · Finans ve Maliyet</strong><span class="cell-sub">Şirket kodu ${esc(cfg().companyCode)} · ${esc(me()?.name || '—')} · ${L.docs.length} muhasebe belgesi · sistem tarihi ${date(today())}</span></div>
      </div>
      <button class="link small" type="button" data-reset-fi title="Tüm modüllerin işlem verisini sıfırlar (Ayarlar)">Demo verisini sıfırla</button>
    </div>
    <div class="toolbar">
      <div class="seg-ctrl c4c-tabs" role="tablist" aria-label="FI/CO çalışma alanı">
        ${t('journal', 'Muhasebe belgeleri', 'book')}${t('ar', 'Alacaklar', 'users', overdue || '', true)}${t('ap', 'Borçlar', 'wallet', due || '')}${t('reports', 'Raporlar', 'chart')}${t('co', 'Maliyet ve kârlılık', 'layers')}
      </div>
    </div>`;
}

function drawBody() {
  if (!rootRef?.isConnected) return;
  const body = rootRef.querySelector('[data-fi-body]');
  body.innerHTML = viewHtml(tab);
  if (tab === 'ar') updateReceiptPreview(body);
}
function viewHtml(t) {
  return t === 'ar' ? arView() : t === 'ap' ? apView() : t === 'reports' ? reportsView() : t === 'co' ? coView_() : journalView();
}
function refreshAll() {
  if (!rootRef?.isConnected) return;
  const tmp = document.createElement('div');
  tmp.innerHTML = headHtml();
  [...rootRef.children].filter((el) => !el.matches('[data-fi-body]')).forEach((el) => el.remove());
  rootRef.prepend(...tmp.children);
  drawBody();
}

// ---------- muhasebe belgeleri ----------
function journalView() {
  const docs = fiDocs().filter((d) => !jFilter || d.type === jFilter).slice().reverse();
  const types = [...new Set(fiDocs().map((d) => d.type))];
  return `<div class="toolbar">
      <div class="seg-ctrl" role="tablist" aria-label="Belge türü"><button type="button" data-jf="" class="${!jFilter ? 'is-active' : ''}">Tümü</button>${types.map((x) => `<button type="button" data-jf="${x}" class="${jFilter === x ? 'is-active' : ''}" title="${esc(DOC_TYPE[x])}">${x}</button>`).join('')}</div>
    </div>
    <div class="card table-card"><div class="table-wrap"><table class="table tl-table c4c-table">
      <thead><tr><th>Belge</th><th>Tür</th><th>Açıklama</th><th class="hide-sm">Tarih</th><th class="num">Tutar</th></tr></thead>
      <tbody>${docs.map((d) => `<tr data-fidoc="${esc(d.no)}" tabindex="0"><td><span class="code">${esc(d.no)}</span></td><td>${badge(d.type, 'neutral')}<div class="cell-sub hide-md">${esc(DOC_TYPE[d.type])}</div></td><td>${esc(d.text)}</td><td class="hide-sm">${date(d.date)}</td><td class="num">${money(d.amount)}</td></tr>`).join('')}</tbody>
    </table></div>
    <div class="table-foot">Belgeler satış, satın alma ve finans olaylarından otomatik oluşur (SAP'de hesap belirleme: SD için VKOA, MM için OBYC). Hesaplar Tekdüzen Hesap Planı'na göredir; şirkete göre değişebilir.</div></div>`;
}

export function openFiDoc(no) {
  const d = fiDoc(no);
  if (!d) return toast('Muhasebe belgesi bulunamadı');
  const dr = round2(sum(d.lines, (l) => l.dr));
  const cr = round2(sum(d.lines, (l) => l.cr));
  const [k, n] = String(d.source || '').split(':');
  const srcBtn = d.source
    ? k === 'WA' ? ['delivery', n, 'Teslimat'] : k === 'RV' ? ['invoice', n, 'Satış faturası'] : k === 'WE' ? ['mdoc', n, 'Malzeme belgesi'] : k === 'RE' ? ['sinv', n, 'Tedarikçi faturası'] : null
    : null;
  const flow = !d.source ? '' : k === 'WA' || k === 'RV' ? flowHtml({ type: 'fidoc', no, source: d.source }) : p2pFlowHtml({ type: 'fidoc', no, source: d.source });
  const html =
    drawerHead(`Muhasebe belgesi · ${d.no}`, d.text, badge(`${d.type} · ${DOC_TYPE[d.type]}`, 'info') + badge(Math.abs(dr - cr) < 0.01 ? 'Borç = alacak' : 'Denk değil', Math.abs(dr - cr) < 0.01 ? 'success' : 'danger')) +
    `<div class="drawer-body">
      ${dsec('Kayıt satırları', `<div class="table-wrap"><table class="cond-table fi-lines"><thead><tr><th>Hesap</th><th>Açıklama</th><th class="num">Borç</th><th class="num">Alacak</th></tr></thead><tbody>${d.lines
        .map((l) => `<tr><td><span class="code">${esc(l.acc)}</span><div class="cell-sub">${esc(accName(l.acc))}</div></td><td>${esc(l.text || '')}${l.cc ? `<div class="cell-sub">Maliyet merkezi ${esc(l.cc)}</div>` : ''}${l.pc ? `<div class="cell-sub">Kâr merkezi ${esc(l.pc)}</div>` : ''}</td><td class="num">${l.dr ? money(l.dr) : ''}</td><td class="num">${l.cr ? money(l.cr) : ''}</td></tr>`)
        .join('')}<tr class="total"><td colspan="2">Toplam</td><td class="num">${money(dr)}</td><td class="num">${money(cr)}</td></tr></tbody></table></div>`)}
      ${d.type === 'WE' || d.type === 'RE' ? alertBox('info', 'GR/IR ara hesabı', 'SAP\'de mal girişi stok hesabına borç, GR/IR (mal girişi / fatura girişi) ara hesabına alacak yazar; tedarikçi faturası bu ara hesabı kapatır. Tekdüzen Hesap Planı\'nda GR/IR için standart bir hesap yoktur; burada 329 kullanıldı (şirkete göre değişebilir).') : ''}
      ${dsec('Başlık', kv([
        ['Belge türü', `<span class="code">${esc(d.type)}</span> ${esc(DOC_TYPE[d.type])}`],
        ['Kayıt tarihi', date(d.date)],
        ['Şirket kodu', `<span class="code">${esc(cfg().companyCode)}</span>`],
        d.ref ? ['Referans', `<span class="code">${esc(d.ref)}</span>`] : null,
        srcBtn ? ['Kaynak belge', `<button class="link" type="button" data-act="doc" data-doc="${srcBtn[0]}:${esc(srcBtn[1])}">${esc(srcBtn[2])} ${esc(srcBtn[1])}</button>`] : ['Kaynak', d.key.startsWith('S') || d.key === 'OPEN' || d.key.startsWith('EXP') ? 'Devralınan kayıt (Kasım öncesi / dönem içi giderler)' : '—'],
      ]))}
      ${flow ? dsec('Belge akışı', flow) : ''}
    </div>`;
  openDrawer(html, (el) => {
    if (el.dataset.act === 'doc') openDocRef(el.dataset.doc);
  });
}

// ---------- alacaklar ----------
function arView() {
  const items = arItems();
  const cs = [...company().customers, ...(company().prospects || [])].filter((c) => items.some((i) => i.customer === c.id));
  const rows = cs.map((c) => ({ c, a: aging(items.filter((i) => i.customer === c.id)) }));
  const tot = aging(items);
  const sel = arCustomer && partnerOf(arCustomer) ? partnerOf(arCustomer) : null;
  const list = items.filter((i) => (!sel || i.customer === sel.id) && i.open > 0).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  return `<section class="card table-card">
      <div class="table-wrap"><table class="table tl-table c4c-table fi-aging">
        <thead><tr><th>Müşteri</th>${BUCKETS.map((b) => `<th class="num">${b.label}</th>`).join('')}<th class="num">Toplam</th><th>Kredi</th></tr></thead>
        <tbody>${rows.map(({ c, a }) => {
          const st = creditStatus(c);
          return `<tr data-arc="${esc(c.id)}" tabindex="0" class="${sel?.id === c.id ? 'is-sel' : ''}"><td><strong>${esc(c.name)}</strong><div class="cell-sub">${esc(c.id)} · limit ${money(c.creditLimit)}</div></td>${BUCKETS.map((b) => `<td class="num ${b.id !== 'notdue' && a[b.id] ? 'neg' : ''}">${a[b.id] ? money(a[b.id]) : '—'}</td>`).join('')}<td class="num"><strong>${money(a.total)}</strong></td><td>${badge(st.label, st.tone)}</td></tr>`;
        }).join('')}
        <tr class="total"><td>Toplam</td>${BUCKETS.map((b) => `<td class="num">${money(tot[b.id])}</td>`).join('')}<td class="num">${money(tot.total)}</td><td></td></tr></tbody>
      </table></div>
      <div class="table-foot">Yaşlandırma vadeden bu yana geçen güne göredir (FBL5N benzeri). Satıra tıklayınca müşterinin açık kalemleri ve tahsilat formu açılır.</div>
    </section>
    <div class="mm-grid mt-sm">
      <section class="card tl-sec">
        <h3 class="card-title">${icon('book')} Açık kalemler${sel ? ` · ${esc(sel.name)}` : ''}</h3>
        ${sel ? `<button class="link small" type="button" data-arc="">Tüm müşteriler</button>` : ''}
        <div class="table-wrap"><table class="cond-table fi-items"><thead><tr><th>Belge</th><th class="hide-sm">Belge tarihi</th><th>Vade</th><th class="num">Gün</th><th class="num">Açık</th></tr></thead><tbody>${list
          .map((i) => `<tr><td><span class="code">${esc(i.ref)}</span>${sel ? '' : `<div class="cell-sub">${esc(partnerOf(i.customer)?.name || '')}</div>`}${i.paid ? `<div class="cell-sub">kısmi tahsil ${money(i.paid)} / ${money(i.amount)}</div>` : ''}</td><td class="hide-sm">${date(i.docDate)}</td><td>${date(i.dueDate)}</td><td class="num ${i.days > 0 ? 'neg' : ''}">${i.days > 0 ? `+${i.days}` : i.days}</td><td class="num">${money(i.open)}</td></tr>`)
          .join('') || '<tr><td colspan="5" class="muted">Açık kalem yok.</td></tr>'}</tbody></table></div>
      </section>
      <section class="card tl-sec" data-rcform>
        <h3 class="card-title">${icon('wallet')} Tahsilat girişi (F-28)</h3>
        <div class="form-grid">
          <label class="field span-2"><span class="field-label">Müşteri</span><select class="select" data-rc="customer">${cs.map((c) => `<option value="${esc(c.id)}" ${c.id === (sel?.id || '') ? 'selected' : ''}>${esc(c.id)} · ${esc(c.name)}</option>`).join('')}</select></label>
          <label class="field"><span class="field-label">Tutar (₺)</span><input class="input" type="number" min="0" step="100" data-rc="amount" placeholder="Ör. 150000"></label>
          <label class="field"><span class="field-label">Banka / tarih</span><div class="ro"><span class="code">102</span> · ${date(today())}</div></label>
          <label class="field span-2"><span class="field-label">Açıklama</span><input class="input" data-rc="note" maxlength="60" placeholder="Ör. EFT · dekont 4471"></label>
        </div>
        <div data-rc-preview></div>
        <div class="drawer-actions">${actionBtn({ perm: 'CASH_RECEIPT', label: 'Tahsilatı kaydet', iconName: 'check', attrs: 'data-post-rc' })}</div>
      </section>
    </div>
    ${read().receipts.length ? `<section class="tl-sec"><h3 class="list-title">Tahsilatlar</h3><div class="card table-card"><div class="table-wrap"><table class="table tl-table c4c-table"><thead><tr><th>Tahsilat</th><th>Müşteri</th><th class="num">Tutar</th><th class="hide-sm">Denkleştirilen</th><th>Muhasebe</th></tr></thead><tbody>${read().receipts.slice().reverse().map((r) => {
      const d = fiDocs().find((x) => x.receipt === r.id);
      return `<tr><td><span class="code">${esc(r.id)}</span><div class="cell-sub">${esc(userLabel(r.by))}</div></td><td>${esc(partnerOf(r.customer)?.name || r.customer)}</td><td class="num">${money(r.amount)}</td><td class="hide-sm">${r.allocations.map((a) => esc(arItems().find((i) => i.key === a.key)?.ref || a.key)).join(', ')}</td><td>${d ? `<button class="link" type="button" data-fidoc="${esc(d.no)}">${esc(d.no)}</button>` : ''}</td></tr>`;
    }).join('')}</tbody></table></div></div></section>` : ''}`;
}

function updateReceiptPreview(body) {
  const f = body.querySelector('[data-rcform]');
  if (!f) return;
  const cust = f.querySelector('[data-rc="customer"]').value;
  const amount = Number(f.querySelector('[data-rc="amount"]').value) || 0;
  const c = partnerOf(cust);
  const box = f.querySelector('[data-rc-preview]');
  if (!c) return (box.innerHTML = '');
  const a = allocate(cust, amount);
  const after = { ...c, openBalance: round2(c.openBalance - amount) };
  const b0 = creditStatus(c);
  const b1 = creditStatus(after);
  box.innerHTML = `${kv([
    ['Açık kalem toplamı', money(a.openTotal)],
    ['Açık bakiye', `${money(c.openBalance)} → <strong>${money(after.openBalance)}</strong>`],
    ['Kredi durumu', `${badge(b0.label, b0.tone)} → ${badge(b1.label, b1.tone)}${c.creditLimit ? ` <span class="cell-sub">kullanım %${Math.round(b1.ratio * 100)}</span>` : ''}`],
  ])}${amount > 0 ? `<ul class="fi-alloc">${a.allocations.map((x) => `<li><span class="code">${esc(x.ref)}</span> vade ${date(x.dueDate)} · ${money(x.amount)} ${x.full ? badge('Denkleşir', 'success') : badge('Kısmi', 'info')}</li>`).join('')}</ul>` : '<p class="cell-sub">Tahsilat en eski vadeli kalemden başlayarak denkleştirilir.</p>'}${a.unapplied > 0 ? alertBox('danger', 'Tutar açık kalemlerden fazla', `${money(a.unapplied)} fazla; bu simülasyonda avans kaydedilmez.`) : ''}`;
}

// ---------- borçlar ----------
function apView() {
  const items = apItems();
  const nextRun = rootRef?.querySelector?.('[data-nextrun]')?.value || addDays(today(), 7);
  const p = proposal(nextRun);
  const runs = read().runs.slice().reverse();
  const supName = (id) => supplierOf(id)?.name || id;
  return `${roleBox('treasury', 'PAYMENT_RUN', 'Ödeme programını çalıştıracak kimse yok')}
    <div class="mm-grid">
      <section class="card tl-sec">
        <h3 class="card-title">${icon('wallet')} Ödeme programı (F110)</h3>
        <div class="form-grid">
          <label class="field"><span class="field-label">Çalıştırma tarihi</span><div class="ro">${date(today())}</div></label>
          <label class="field"><span class="field-label">Sonraki çalıştırma</span><input class="input" type="date" data-nextrun min="${esc(addDays(today(), 1))}" value="${esc(nextRun)}"></label>
        </div>
        <p class="cell-sub">Vadesi sonraki çalıştırma tarihinden önce gelen kalemler önerilir; ödeme blokajlı kalemler hariç tutulur.</p>
        ${p.payments.length ? `<div class="table-wrap"><table class="cond-table"><thead><tr><th>Tedarikçi / kalem</th><th>Vade</th><th class="num">Tutar</th></tr></thead><tbody>${p.payments
          .map((x) => `<tr class="total"><td colspan="2">${esc(supName(x.supplier))}</td><td class="num">${money(x.amount)}</td></tr>${x.items.map((i) => `<tr><td><span class="code">${esc(i.ref)}</span></td><td class="${i.days > 0 ? 'neg' : ''}">${date(i.dueDate)}</td><td class="num">${money(i.amount)}</td></tr>`).join('')}`)
          .join('')}<tr class="total"><td colspan="2">Ödenecek toplam</td><td class="num">${money(sum(p.payments, (x) => x.amount))}</td></tr></tbody></table></div>` : '<p class="cell-sub">Bu tarih aralığında ödenecek kalem yok.</p>'}
        ${p.excluded.length ? `<h3 class="card-title mt-sm">Hariç tutulanlar</h3><ul class="act-list">${p.excluded.map((x) => `<li class="${x.blocked ? 'is-late' : ''}"><div class="act-row fi-ex"><span class="act-ico">${icon(x.blocked ? 'lock' : 'clock')}</span><span class="act-text"><strong>${esc(supName(x.supplier))} · ${esc(x.ref)} · ${money(x.amount)}</strong><span class="cell-sub">${esc(x.reason)}</span></span>${x.blocked ? badge('Ödeme blokajı', 'danger') : badge('Vadesi gelmedi', 'neutral')}</div></li>`).join('')}</ul>` : ''}
        <div class="drawer-actions">${actionBtn({ perm: 'PAYMENT_RUN', label: 'Ödemeyi çalıştır', iconName: 'send', attrs: 'data-run-pay', reason: can('PAYMENT_RUN') && !p.payments.length ? 'Ödenecek kalem yok' : null })}</div>
      </section>
      <section class="card tl-sec">
        <h3 class="card-title">Tedarikçi kalemleri (FBL1N)</h3>
        <ul class="act-list">${items
          .slice()
          .sort((a, b) => Number(a.paid) - Number(b.paid) || a.dueDate.localeCompare(b.dueDate))
          .map((i) => `<li class="${i.block && !i.paid ? 'is-late' : ''} ${i.paid ? 'is-done' : ''}"><div class="act-row fi-ex"><span class="act-ico">${icon('book')}</span><span class="act-text"><strong>${esc(supName(i.supplier))} · ${esc(i.ref)}</strong><span class="cell-sub">vade ${date(i.dueDate)} · ${money(i.amount)}${i.block && !i.paid ? ` · ${esc(i.block)}` : ''}</span></span>${i.paid ? badge('Ödendi', 'success') : i.block ? badge('Bloke (R)', 'danger') : i.days > 0 ? badge(`Vadesi ${i.days} gün geçti`, 'warning') : badge('Açık', 'info')}${i.sinv ? `<button class="link small" type="button" data-doc="sinv:${esc(i.sinv)}">Fatura</button>` : ''}</div></li>`)
          .join('')}</ul>
      </section>
    </div>
    ${runs.length ? `<section class="tl-sec"><h3 class="list-title">Ödeme çalıştırmaları</h3><div class="card table-card"><div class="table-wrap"><table class="table tl-table c4c-table"><thead><tr><th>Çalıştırma</th><th>Tedarikçi</th><th class="num">Tutar</th><th>Muhasebe</th></tr></thead><tbody>${runs.map((r) => r.payments.map((x, k) => {
      const d = fiDocs().find((y) => y.payment?.run === r.id && y.payment.k === k);
      return `<tr><td><span class="code">${esc(r.id)}</span><div class="cell-sub">${date(r.date)} · ${esc(userLabel(r.by))}</div></td><td>${esc(supName(x.supplier))}<div class="cell-sub">${x.items.length} kalem</div></td><td class="num">${money(x.amount)}</td><td>${d ? `<button class="link" type="button" data-fidoc="${esc(d.no)}">${esc(d.no)}</button>` : ''}</td></tr>`;
    }).join('')).join('')}</tbody></table></div></div></section>` : ''}`;
}

// ---------- raporlar ----------
function reportsView() {
  if (!can('FI_REPORTS')) return `<div class="card">${emptyState('lock', 'Finansal raporları görme yetkin yok', lockReason('FI_REPORTS'))}</div>`;
  const tb = trialBalance();
  const seg = (id, label) => `<button type="button" data-rep="${id}" class="${repView === id ? 'is-active' : ''}">${label}</button>`;
  let body;
  if (repView === 'bs') {
    const b = balanceSheet(tb);
    const col = (title, rows, total) => `<section class="card tl-sec"><h3 class="card-title">${title}</h3><table class="cond-table">${rows.map((r) => `<tr><td><span class="code">${esc(r.code)}</span> ${esc(r.name)}</td><td class="num">${money(r.v)}</td></tr>`).join('')}<tr class="total"><td>Toplam</td><td class="num">${money(total)}</td></tr></table></section>`;
    body = `${b.ok ? alertBox('success', 'Bilanço denk', `Aktif ${money(b.ta)} = Pasif ${money(b.tl)}`) : alertBox('danger', 'Bilanço denk değil', `${money(b.ta)} ≠ ${money(b.tl)}`)}
      <div class="mm-grid fi-bs">${col('Aktif · Dönen varlıklar', b.assets, b.ta)}${col('Pasif · Kısa vadeli yabancı kaynaklar ve özkaynaklar', [...b.liab, ...b.equity], b.tl)}</div>
      <p class="cell-sub">Basit bilanço: yalnızca bu simülasyondaki hesaplar. Dönem net kârı vergi öncesidir.</p>`;
  } else if (repView === 'is') {
    const s = incomeStatement(tb);
    const row = (label, v, cls = '') => `<tr class="${cls}"><td>${label}</td><td class="num">${money(v)}</td></tr>`;
    body = `<section class="card tl-sec"><table class="cond-table fi-is">
      ${row('<span class="code">600</span> Brüt satışlar', s.gross)}
      ${row('<span class="code">611</span> Satış indirimleri (−)', -s.ded)}
      ${row('Net satışlar', s.net, 'total')}
      ${row('<span class="code">621</span> Satışların maliyeti (−)', -s.cogs)}
      ${row('Brüt satış kârı', s.gp, 'total')}
      ${s.opex.map((x) => row(`<span class="code">${x.code}</span> ${esc(accName(x.code))}`, -x.v)).join('')}
      ${row('Faaliyet kârı', s.op, 'total')}
    </table><p class="cell-sub mt-sm">Brüt kâr marjı ${s.net ? pct1((s.gp / s.net) * 100) : '—'} · faaliyet kâr marjı ${s.net ? pct1((s.op / s.net) * 100) : '—'}. Giderler sadeleştirilerek doğrudan 63x hesaplarına yazıldı.</p></section>`;
  } else {
    const t = { dr: round2(sum(tb, (a) => a.dr)), cr: round2(sum(tb, (a) => a.cr)), bd: round2(sum(tb, (a) => a.balDr)), bc: round2(sum(tb, (a) => a.balCr)) };
    body = `<div class="card table-card"><div class="table-wrap"><table class="table tl-table fi-tb">
      <thead><tr><th>Hesap</th><th class="num">Borç</th><th class="num">Alacak</th><th class="num">Borç bakiye</th><th class="num">Alacak bakiye</th></tr></thead>
      <tbody>${tb.map((a) => `<tr><td><span class="code">${esc(a.code)}</span> ${esc(a.name)}</td><td class="num">${money(a.dr)}</td><td class="num">${money(a.cr)}</td><td class="num">${a.balDr ? money(a.balDr) : ''}</td><td class="num">${a.balCr ? money(a.balCr) : ''}</td></tr>`).join('')}
      <tr class="total"><td>Toplam</td><td class="num">${money(t.dr)}</td><td class="num">${money(t.cr)}</td><td class="num">${money(t.bd)}</td><td class="num">${money(t.bc)}</td></tr></tbody></table></div>
      <div class="table-foot">${t.dr === t.cr && t.bd === t.bc ? `${icon('check')} Borç ve alacak toplamları eşit.` : 'Toplamlar eşit değil!'} Mizan tüm muhasebe belgelerinden üretilir (açılış dahil).</div></div>`;
  }
  return `<div class="toolbar"><div class="seg-ctrl" role="tablist" aria-label="Rapor">${seg('tb', 'Mizan')}${seg('bs', 'Bilanço')}${seg('is', 'Gelir tablosu')}</div></div>${body}`;
}

// ---------- CO ----------
function coView_() {
  if (!can('CO_VIEW')) return `${roleBox('controller', 'CO_VIEW', 'Maliyet ve kârlılık raporlarını izleyecek kimse yok')}<div class="card">${emptyState('lock', 'CO raporlarını görme yetkin yok', lockReason('CO_VIEW'))}</div>`;
  const seg = (id, label) => `<button type="button" data-co="${id}" class="${coView === id ? 'is-active' : ''}">${label}</button>`;
  let body;
  if (coView === 'cc') {
    const cc = costCenters();
    body = `<div class="card table-card"><div class="table-wrap"><table class="table tl-table"><thead><tr><th>Maliyet merkezi</th><th class="num">Plan</th><th class="num">Fiili</th><th class="num">Sapma</th><th class="hide-sm">Kullanım</th></tr></thead><tbody>${cc
      .map((c) => `<tr><td><span class="code">${esc(c.id)}</span> <strong>${esc(c.name)}</strong><div class="cell-sub">${esc(c.owner)}</div></td><td class="num">${money(c.plan)}</td><td class="num">${money(c.actual)}</td><td class="num ${c.variance > 0 ? 'neg' : ''}">${c.variance > 0 ? '+' : ''}${money(c.variance)} (${c.pct > 0 ? '+' : ''}${pct1(c.pct)})</td><td class="hide-sm"><div class="fc-bar ${c.actual > c.plan ? 'over' : ''}"><span style="width:${Math.min(100, Math.round((c.actual / c.plan) * 100))}%"></span></div></td></tr>`)
      .join('')}<tr class="total"><td>Toplam</td><td class="num">${money(sum(cc, (c) => c.plan))}</td><td class="num">${money(sum(cc, (c) => c.actual))}</td><td class="num">${money(sum(cc, (c) => c.variance))}</td><td class="hide-sm"></td></tr></tbody></table></div>
      <div class="table-foot">Fiili tutarlar maliyet merkezi atanmış gider satırlarından gelir (Kasım). Plan aylıktır.</div></div>`;
  } else if (coView === 'pc') {
    const rows = copa('pc');
    body = `<div class="card table-card"><div class="table-wrap"><table class="table tl-table"><thead><tr><th>Kâr merkezi</th><th class="num">Net gelir</th><th class="num">SMM</th><th class="num">Brüt kâr</th><th class="num">Marj</th></tr></thead><tbody>${rows
      .map((r) => `<tr><td>${esc(r.name)}</td><td class="num">${money(r.net)}</td><td class="num">${money(r.cogs)}</td><td class="num"><strong>${money(r.margin)}</strong></td><td class="num">${pct1(r.pct)}</td></tr>`)
      .join('')}</tbody></table></div><div class="table-foot">Gelir ve satılan malın maliyeti ürün bölümüne göre kâr merkezine yazılır (01 Gıda → PC01, 02 Temizlik → PC02). Genel giderler maliyet merkezlerinde izlenir, kâr merkezine dağıtılmaz.</div></div>`;
  } else {
    const rows = copa(copaDim);
    const T = { revenue: sum(rows, (r) => r.revenue), discount: sum(rows, (r) => r.discount), net: sum(rows, (r) => r.net), cogs: sum(rows, (r) => r.cogs) };
    const maxM = Math.max(1, ...rows.map((r) => Math.abs(r.margin)));
    body = `<div class="toolbar"><span class="toolbar-count">Kırılım</span><div class="seg-ctrl" role="tablist" aria-label="Kırılım">${Object.entries(DIMS).map(([k, d]) => `<button type="button" data-dim="${k}" class="${copaDim === k ? 'is-active' : ''}">${d.label}</button>`).join('')}</div></div>
      <div class="card table-card"><div class="table-wrap"><table class="table tl-table fi-copa"><thead><tr><th>${esc(DIMS[copaDim].label)}</th><th class="num hide-sm">Brüt gelir</th><th class="num hide-sm">İskonto</th><th class="num">Net gelir</th><th class="num">SMM</th><th class="num">Katkı payı</th><th class="num">Marj</th></tr></thead><tbody>${rows
        .map((r) => `<tr><td>${esc(r.name)}<div class="fc-bar"><span style="width:${Math.round((Math.max(0, r.margin) / maxM) * 100)}%"></span></div></td><td class="num hide-sm">${money(r.revenue)}</td><td class="num hide-sm">−${money(r.discount)}</td><td class="num">${money(r.net)}</td><td class="num">−${money(r.cogs)}</td><td class="num"><strong>${money(r.margin)}</strong></td><td class="num">${pct1(r.pct)}</td></tr>`)
        .join('')}<tr class="total"><td>Toplam</td><td class="num hide-sm">${money(T.revenue)}</td><td class="num hide-sm">−${money(T.discount)}</td><td class="num">${money(T.net)}</td><td class="num">−${money(T.cogs)}</td><td class="num">${money(T.net - T.cogs)}</td><td class="num">${T.net ? pct1(((T.net - T.cogs) / T.net) * 100) : '—'}</td></tr></tbody></table></div>
      <div class="table-foot">Katkı payı = brüt gelir − iskonto (K007 segment + ZKMP kampanya) − satılan malın maliyeti (standart maliyet). Kaynak: Kasım faturaları ve simülasyonda kesilen faturalar (CO-PA benzeri).</div></div>`;
  }
  return `${roleBox('controller', 'CO_VIEW', 'Maliyet ve kârlılık raporlarını izleyecek kimse yok')}<div class="toolbar"><div class="seg-ctrl" role="tablist" aria-label="CO raporu">${seg('copa', 'Kârlılık analizi')}${seg('cc', 'Maliyet merkezleri')}${seg('pc', 'Kâr merkezleri')}</div></div>${body}`;
}

// ---------- olaylar ----------
function bindRoot(root) {
  root.addEventListener('click', (e) => {
    const q = (sel) => e.target.closest(sel);
    let el;
    if ((el = q('[data-tab]'))) {
      tab = el.dataset.tab;
      return refreshAll();
    }
    if ((el = q('[data-reset-fi]'))) {
      if (!el.classList.contains('confirm')) {
        el.classList.add('confirm');
        el.textContent = 'Emin misin? Tüm modüllerin işlem verisi sıfırlanır · tekrar dokun';
        return;
      }
      resetAllDemo();
      return toast('Tüm modüllerin demo verisi başlangıç haline döndü');
    }
    if ((el = q('[data-jf]'))) {
      jFilter = el.dataset.jf;
      return drawBody();
    }
    if ((el = q('[data-rep]'))) {
      repView = el.dataset.rep;
      return drawBody();
    }
    if ((el = q('[data-co]'))) {
      coView = el.dataset.co;
      return drawBody();
    }
    if ((el = q('[data-dim]'))) {
      copaDim = el.dataset.dim;
      return drawBody();
    }
    if ((el = q('[data-arc]'))) {
      arCustomer = el.dataset.arc;
      return drawBody();
    }
    if (q('[data-post-rc]')) {
      const f = root.querySelector('[data-rcform]');
      const v = (k) => f.querySelector(`[data-rc="${k}"]`).value.trim();
      const r = postReceipt({ customer: v('customer'), amount: Number(v('amount')), note: v('note') });
      if (r.error) return toast(r.error);
      arCustomer = r.receipt.customer;
      toast(`Tahsilat ${r.receipt.id} kaydedildi · kredi durumu: ${r.after.label}`);
      return;
    }
    if (q('[data-run-pay]')) {
      const r = runPayments(root.querySelector('[data-nextrun]')?.value);
      if (r.error) return toast(r.error);
      toast(`${r.run.id}: ${r.run.payments.length} tedarikçiye ${money(sum(r.run.payments, (x) => x.amount))} ödendi · ${r.run.excluded.length} kalem hariç`);
      return;
    }
    if ((el = q('[data-fidoc]'))) return openFiDoc(el.dataset.fidoc);
    if ((el = q('[data-doc]'))) return openDocRef(el.dataset.doc);
  });
  root.addEventListener('change', (e) => {
    if (e.target.closest('[data-rcform]')) return updateReceiptPreview(root);
    if (e.target.matches('[data-nextrun]')) return drawBody();
  });
  root.addEventListener('input', (e) => {
    if (e.target.closest('[data-rcform]')) updateReceiptPreview(root);
  });
  root.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const r = e.target.closest('tr[data-fidoc],tr[data-arc]');
    if (!r || e.target.matches('input,select,textarea')) return;
    e.preventDefault();
    r.click();
  });
}

// Kayıt: belge türü + belge akışı bağlantısı
registerDocType('fidoc', (no) => loadFI().then(() => openFiDoc(no)));
registerFiLookup((key) => (FID ? lookup(key) : []));
// Başka bir ekrandan belge akışı açılırsa veri hazır olsun
loadFI().catch(() => {});

export const _test = { viewHtml: (t) => headHtml() + viewHtml(t), openFiDoc, setView: (r, c) => { repView = r || repView; coView = c || coView; } };
