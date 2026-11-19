// SAP C4C (Sales Cloud) çalışma alanı (sap-c4c > Simülasyon, simulation.type = "c4c")
// Huni (Kanban + tahmin), lead yönetimi (BANT, dönüştürme), Hesap 360, aktiviteler, kampanyalar.
// Teklif adımı mevcut teklif simülasyonuna, sipariş adımı ERP aktarımına bağlanır.
import { icon } from './icons.js';
import { stripQuery } from './router.js';
import { progress } from './store.js';
import {
  esc, money, num, date, datetime, pct, norm, badge, emptyState, toast, openDrawer, closeDrawer, drawerHead,
  kv, dsec, alertBox, progressBar,
} from './ui.js';
import { loadRoles, can, actionBtn, currentUser, userById, holders, roleById, lockReason } from './auth.js';
import {
  loadCompany, company, partnerOf, creditStatus, channelName, termName, contactList, updateCustomer, addProspect,
  removeProspects, crmProspectIds, openDetail, erpNumberOf, segBadge, productOf,
} from './company.js';
import { all as allQuotes, visible as visibleQuotes, statusBadge as quoteBadge, openQuote } from './quotes.js';
import { orderForQuote, visibleOrders, orderBadges, openDoc, invoices as erpInvoices } from './erp.js';
import { applyPreset } from './sim-quote.js';
import { resetAllDemo } from './demo-reset.js';

const KEY = 'erp-akademi:c4c';
const SCORE = { hot: { label: 'Sıcak', tone: 'danger' }, warm: { label: 'Ilık', tone: 'warning' }, cold: { label: 'Soğuk', tone: 'info' } };
const LSTATUS = { open: { label: 'Açık', tone: 'info' }, converted: { label: 'Dönüştürüldü', tone: 'success' }, rejected: { label: 'Reddedildi', tone: 'neutral' } };
const BANT = [
  { k: 'budget', label: 'Bütçe (Budget)', text: 'Müşterinin bu alım için ayrılmış veya onaylanabilir bütçesi var.' },
  { k: 'authority', label: 'Yetki (Authority)', text: 'Görüşülen kişi karar verici ya da karar vericiye doğrudan erişimi var.' },
  { k: 'need', label: 'İhtiyaç (Need)', text: 'Ürünlerimizle karşılanabilecek somut bir ihtiyaç tanımlandı.' },
  { k: 'timeline', label: 'Zaman (Timeline)', text: 'Satın alma için belirli bir zaman planı var (ör. bu çeyrek).' },
];
const ACT_TYPE = { visit: { label: 'Ziyaret', icon: 'building' }, call: { label: 'Telefon', icon: 'phone' }, task: { label: 'Görev', icon: 'check' } };
const CSTATUS = { planned: { label: 'Planlandı', tone: 'neutral' }, active: { label: 'Aktif', tone: 'info' }, completed: { label: 'Tamamlandı', tone: 'success' } };
const HIST = {
  created: 'Fırsatı oluşturdu', converted: 'Lead\'den dönüştürdü', stage: 'Aşamayı değiştirdi', updated: 'Güncelledi', 'quote-linked': 'Teklif bağlandı',
  'quote-approved': 'Teklif onaylandı', 'quote-rejected': 'Teklif reddedildi', order: 'Sipariş oluştu', won: 'Kazanıldı', lost: 'Kaybedildi',
};
const OPEN_STAGES = ['discovery', 'needs', 'quote', 'negotiation'];

let ctx = null;
let B2B = null;
let tab = 'pipeline'; // pipeline | leads | accounts | activities | campaigns
let pipeView = 'board'; // board | forecast
let ownerFilter = '';
let leadFilter = 'open';
let accQuery = '';
let accountId = null;
let accTab = 'summary';
let weekOffset = 0;
let rootRef = null;

const clone = (o) => JSON.parse(JSON.stringify(o));
const nowIso = () => new Date().toISOString();
const me = () => currentUser();
const today = () => company().asOf;
const cfg = () => ctx.content;
const stages = () => cfg().stages;
const stageOf = (id) => stages().find((s) => s.id === id) || { id, label: id, probability: 0 };
const isOpen = (o) => OPEN_STAGES.includes(o.stage);
const userName = (id) => userById(id)?.name || id || '—';
const accName = (id) => partnerOf(id)?.name || id;
const team = () => can('FORECAST_VIEW_TEAM');

function parseDay(iso) {
  const [y, m, d] = String(iso).split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}
function addDays(iso, n) {
  return new Date(parseDay(iso) + n * 864e5).toISOString().slice(0, 10);
}
const dayDiff = (a, b) => Math.round((parseDay(a) - parseDay(b)) / 864e5); // a - b
const monthKey = (iso) => String(iso).slice(0, 7);
const monthLabel = (key) => {
  const [y, m] = key.split('-').map(Number);
  return new Intl.DateTimeFormat('tr-TR', { month: 'long', year: 'numeric' }).format(new Date(y, m - 1, 1));
};
const dayLabel = (iso) => new Intl.DateTimeFormat('tr-TR', { weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(parseDay(iso)));

// ---------- depolama ----------
function seedState() {
  const sd = clone(cfg().seed || {});
  const s = { v: 1, leads: sd.leads || [], opps: sd.opportunities || [], acts: sd.activities || [], camps: sd.campaigns || [], seq: {} };
  for (const o of s.opps) {
    o.history = o.history || [{ at: o.createdAt, by: o.owner, action: o.lead ? 'converted' : 'created', note: o.lead ? `${o.lead}` : '' }];
    if (o.stage === 'won' || o.stage === 'lost') o.history.push({ at: o.closedAt || o.createdAt, by: o.owner, action: o.stage, note: o.stage === 'lost' ? o.lossReason : o.winReason || '' });
  }
  const max = (list, p) => Math.max(0, ...list.map((x) => Number(String(x.id).replace(p, '')) || 0));
  s.seq = { lead: max(s.leads, 'LEAD-'), opp: max(s.opps, 'OPP-'), act: max(s.acts, 'ACT-'), camp: max(s.camps, 'CMP-') };
  return s;
}
function read() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (s && s.v === 1) return s;
  } catch {}
  const s = seedState();
  write(s);
  return s;
}
function write(s) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {}
}
function nextId(s, kind, prefix) {
  s.seq[kind] = (s.seq[kind] || 0) + 1;
  return `${prefix}-${String(s.seq[kind]).padStart(4, '0')}`;
}

// Teklif ve sipariş durumunu fırsata yansıtır (idempotent): onaylanan teklif tutarı günceller ve
// fırsatı Pazarlık'a taşır; tekliften sipariş oluşunca fırsat Kazanıldı olur.
function sync(s) {
  let changed = false;
  const qs = allQuotes().filter((q) => q.opportunity);
  for (const o of s.opps) {
    const mine = qs.filter((q) => q.opportunity === o.id && q.customer === o.account).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    if (!mine.length) continue;
    o.sync = o.sync || { linked: [], approved: [], rejected: [], order: null };
    const log = (at, by, action, note) => o.history.push({ at, by, action, note });
    for (const q of mine) {
      if (!o.sync.linked.includes(q.no)) {
        o.sync.linked.push(q.no);
        o.quoteNo = q.no;
        log(q.createdAt, q.createdBy, 'quote-linked', `Teklif ${q.no} · net ${money(q.totals.net)}`);
        changed = true;
      }
      if (q.status === 'approved' && !o.sync.approved.includes(q.no)) {
        o.sync.approved.push(q.no);
        const h = [...q.history].reverse().find((x) => x.action === 'approved' || x.action === 'auto-approved');
        o.amount = Math.round(q.totals.net * 100) / 100;
        if (['discovery', 'needs', 'quote'].includes(o.stage)) {
          o.stage = 'negotiation';
          o.probability = stageOf('negotiation').probability;
        }
        log(h?.at || nowIso(), h?.by || q.createdBy, 'quote-approved', `Teklif ${q.no} onaylandı; beklenen tutar ${money(o.amount)}${o.stage === 'negotiation' ? ', aşama Pazarlık' : ''}`);
        changed = true;
      }
      if (q.status === 'rejected' && !o.sync.rejected.includes(q.no)) {
        o.sync.rejected.push(q.no);
        const h = [...q.history].reverse().find((x) => x.action === 'rejected');
        log(h?.at || nowIso(), h?.by || q.createdBy, 'quote-rejected', `Teklif ${q.no}: ${h?.note || ''}`);
        changed = true;
      }
      const ord = orderForQuote(q.no);
      if (ord && !o.sync.order) {
        o.sync.order = ord.no;
        o.orderNo = ord.no;
        if (isOpen(o)) {
          o.stage = 'won';
          o.probability = 100;
          o.closedAt = ord.createdAt;
          o.winReason = o.winReason || 'Teklif siparişe dönüştü';
          markDone();
        }
        log(ord.createdAt, ord.createdBy, 'order', `Sipariş ${ord.no} · fırsat Kazanıldı`);
        changed = true;
      }
    }
  }
  return changed;
}

function state() {
  const s = read();
  if (sync(s)) write(s);
  return s;
}

function markDone() {
  if (progress.isDone('sap-c4c', 'simulation')) return;
  progress.setDone('sap-c4c', 'simulation', true);
  document.dispatchEvent(new CustomEvent('erp:progress'));
}

// ---------- görünürlük ve kurallar ----------
const visibleOpps = (s) => (team() ? s.opps : s.opps.filter((o) => o.owner === me()?.id));
const visibleActs = (s) => (team() ? s.acts : s.acts.filter((a) => a.owner === me()?.id));
const canEditOpp = (o) => can('OPP_MANAGE') && (o.owner === me()?.id || team());
const editReason = (o) => (can('OPP_MANAGE') && !canEditOpp(o) ? `Bu fırsatın sorumlusu ${userName(o.owner)}; yalnızca sorumlu veya ekip görünümü olan müdür değiştirebilir.` : null);
const weighted = (o) => (o.amount || 0) * (o.probability || 0) / 100;
const sum = (list, f) => list.reduce((a, x) => a + f(x), 0);
const bantCount = (l) => BANT.filter((b) => l.bant?.[b.k]).length;

function riskOf(o, s) {
  if (!isOpen(o)) return [];
  const r = [];
  const t = today();
  const left = dayDiff(o.closeDate, t);
  if (left < 0) r.push(`Kapanış tarihi ${-left} gün önce geçti`);
  else if (left <= 21 && ['discovery', 'needs'].includes(o.stage)) r.push(`Kapanışa ${left} gün var, aşama hâlâ ${stageOf(o.stage).label}`);
  const acts = s.acts.filter((a) => a.opportunity === o.id);
  const late = acts.filter((a) => a.status === 'open' && a.date < t);
  if (late.length) r.push(`${late.length} gecikmiş aktivite`);
  if (!acts.some((a) => Math.abs(dayDiff(a.date, t)) <= 14)) r.push('Son 14 günde aktivite yok');
  const c = partnerOf(o.account);
  if (c) {
    const cs = creditStatus(c);
    if (cs.key === 'blocked') r.push('Müşteri bloke');
    else if (cs.key === 'over') r.push('Kredi limiti aşıldı');
    else if (cs.key === 'risk') r.push(`Kredi kullanımı ${pct(cs.ratio * 100)}`);
    if (c.overdue > 0) r.push(`Vadesi geçmiş bakiye ${money(c.overdue)}`);
  }
  return r;
}

// ---------- giriş noktası ----------
export async function renderC4C(c) {
  ctx = c;
  await Promise.all([loadCompany(), loadRoles(), loadB2B()]);
  const q = c.route.query || {};
  let openAfter = null;
  if (q.scenario) {
    const sc = c.data?.sections?.scenarios?.items?.find((x) => x.id === q.scenario);
    if (sc?.simulation?.tab) tab = sc.simulation.tab;
    if (sc?.simulation?.view) pipeView = sc.simulation.view;
    if (sc?.simulation?.opp) openAfter = ['opp', sc.simulation.opp];
  }
  if (q.tab) tab = q.tab;
  if (q.account && partnerOf(q.account)) {
    tab = 'accounts';
    accountId = q.account;
    accTab = 'summary';
  }
  if (q.opp) {
    tab = 'pipeline';
    openAfter = ['opp', q.opp];
  }
  if (q.lead) {
    tab = 'leads';
    openAfter = ['lead', q.lead];
  }
  if (Object.keys(q).length) stripQuery();
  state();
  return {
    html: `<div class="c4c" data-c4c>${headHtml()}<div data-c4c-body></div></div>`,
    bind(container) {
      rootRef = container.querySelector('[data-c4c]');
      bindRoot(rootRef);
      drawBody();
      if (openAfter?.[0] === 'opp') openOpp(openAfter[1]);
      if (openAfter?.[0] === 'lead') openLead(openAfter[1]);
    },
  };
}

async function loadB2B() {
  if (!B2B) {
    const r = await fetch('data/tracks/b2b-crm.json', { cache: 'no-cache' });
    B2B = await r.json();
  }
  return B2B;
}
const quoteSimCtx = () => (B2B ? { track: { id: 'b2b-crm' }, content: B2B.sections.simulation, data: B2B, route: { query: {} } } : null);

function headHtml() {
  const s = state();
  const u = me();
  const openLeads = s.leads.filter((l) => l.status === 'open').length;
  const late = visibleActs(s).filter((a) => a.status === 'open' && a.date < today()).length;
  const t = (id, label, ic, n = '', danger = false) =>
    `<button type="button" role="tab" data-tab="${id}" aria-selected="${tab === id}" class="${tab === id ? 'is-active' : ''}">${icon(ic)}<span>${label}</span>${n ? ` <span class="count${danger ? ' danger-count' : ''}">${n}</span>` : ''}</button>`;
  return `
    <div class="c4c-head">
      <div class="c4c-who">
        <span class="c4c-logo">${icon('cloud')}</span>
        <div><strong>Sales Cloud</strong><span class="cell-sub">${esc(u?.name || '—')} · ${team() ? 'ekip görünümü' : 'kendi görünümün'} · sistem tarihi ${date(today())}</span></div>
      </div>
      <button class="link small" type="button" data-reset-demo>Demo verisini sıfırla</button>
    </div>
    <div class="toolbar">
      <div class="seg-ctrl c4c-tabs" role="tablist" aria-label="C4C çalışma alanı">
        ${t('pipeline', 'Huni', 'chart')}${t('leads', 'Leadler', 'target', openLeads || '')}${t('accounts', 'Hesaplar', 'building')}${t('activities', 'Aktiviteler', 'calendar', late || '', true)}${t('campaigns', 'Kampanyalar', 'send')}
      </div>
    </div>`;
}

function drawBody() {
  if (!rootRef?.isConnected) return;
  const body = rootRef.querySelector('[data-c4c-body]');
  const s = state();
  if (tab === 'leads') body.innerHTML = leadsView(s);
  else if (tab === 'accounts') body.innerHTML = accountId && partnerOf(accountId) ? account360(s) : accountsView(s);
  else if (tab === 'activities') body.innerHTML = activitiesView(s);
  else if (tab === 'campaigns') body.innerHTML = campaignsView(s);
  else body.innerHTML = pipeView === 'forecast' ? forecastView(s) : boardView(s);
}

function refreshAll() {
  if (!rootRef?.isConnected) return;
  const tmp = document.createElement('div');
  tmp.innerHTML = headHtml();
  [...rootRef.children].filter((el) => !el.matches('[data-c4c-body]')).forEach((el) => el.remove());
  rootRef.prepend(...tmp.children);
  drawBody();
}

// ---------- huni: Kanban ----------
function pipeToolbar(s) {
  const owners = [...new Set(s.opps.map((o) => o.owner))];
  return `<div class="toolbar">
    <div class="seg-ctrl" role="tablist" aria-label="Huni görünümü">
      <button type="button" data-pview="board" class="${pipeView === 'board' ? 'is-active' : ''}">${icon('grid')}<span>Kanban</span></button>
      <button type="button" data-pview="forecast" class="${pipeView === 'forecast' ? 'is-active' : ''}">${icon('chart')}<span>Tahmin</span></button>
    </div>
    ${team() ? `<select class="select c4c-owner" data-owner aria-label="Sorumlu"><option value="">Tüm ekip</option>${owners.map((id) => `<option value="${esc(id)}" ${id === ownerFilter ? 'selected' : ''}>${esc(userName(id))}</option>`).join('')}</select>` : `<span class="toolbar-count">Yalnızca sorumlusu olduğun fırsatlar</span>`}
    <span class="c4c-spacer"></span>
    ${actionBtn({ perm: 'OPP_MANAGE', label: 'Yeni fırsat', iconName: 'tag', attrs: 'data-new-opp' })}
  </div>`;
}
const pipeOpps = (s) => visibleOpps(s).filter((o) => !ownerFilter || !team() || o.owner === ownerFilter);

function boardView(s) {
  const list = pipeOpps(s);
  const cols = stages()
    .map((st) => {
      const items = list.filter((o) => o.stage === st.id).sort((a, b) => a.closeDate.localeCompare(b.closeDate));
      return `<section class="kb-col kbc-${st.id}" data-col="${esc(st.id)}" aria-label="${esc(st.label)}">
        <header class="kb-head"><strong>${esc(st.label)}</strong><span class="cell-sub">%${st.probability} · ${items.length}</span><span class="kb-sum">${money(sum(items, (o) => o.amount))}</span></header>
        <div class="kb-list">${items.map((o) => oppCard(o, s)).join('') || '<p class="kb-empty">Fırsat yok</p>'}</div>
      </section>`;
    })
    .join('');
  return `${pipeToolbar(s)}
    <p class="cell-sub c4c-hint">${icon('help')} <span class="only-fine">Kartı sürükleyip başka aşamaya bırak.</span><span class="only-coarse">Sütunlar arasında yatay kaydır; kartın altındaki menüden aşamayı değiştir.</span> Kaybedildi'ye taşımak kayıp nedeni ister.</p>
    <div class="kb" data-kb>${cols}</div>`;
}

function oppCard(o, s) {
  const risk = riskOf(o, s);
  const late = isOpen(o) && o.closeDate < today();
  const editable = canEditOpp(o);
  return `<article class="kb-card${risk.length ? ' is-risk' : ''}" data-opp="${esc(o.id)}" ${editable ? 'draggable="true"' : ''} tabindex="0">
    <div class="kb-top"><span class="code">${esc(o.id)}</span>${risk.length ? `<span class="kb-risk" title="${esc(risk.join(' · '))}">${icon('alert')}</span>` : ''}${o.quoteNo ? `<span class="kb-quote" title="Teklif ${esc(o.quoteNo)}">${icon('tag')}</span>` : ''}</div>
    <strong class="kb-title">${esc(o.name)}</strong>
    <span class="cell-sub">${esc(accName(o.account))}</span>
    <div class="kb-meta"><span class="kb-amt">${money(o.amount)}</span><span class="${late ? 'neg' : 'cell-sub'}">${date(o.closeDate)}</span></div>
    <div class="kb-foot">${team() ? `<span class="cell-sub">${esc(userName(o.owner))}</span>` : ''}${isOpen(o) ? `<span class="cell-sub">%${o.probability}</span>` : ''}
      ${editable ? `<select class="select kb-move" data-move="${esc(o.id)}" aria-label="Aşama değiştir: ${esc(o.name)}"><option value="">Aşama değiştir…</option>${stages().filter((st) => st.id !== o.stage).map((st) => `<option value="${esc(st.id)}">${esc(st.label)}</option>`).join('')}</select>` : ''}
    </div>
  </article>`;
}

function moveStage(id, stageId) {
  const s = state();
  const o = s.opps.find((x) => x.id === id);
  if (!o || o.stage === stageId) return;
  if (!canEditOpp(o)) return toast(editReason(o) || lockReason('OPP_MANAGE'));
  if (stageId === 'lost') return openOpp(id, { stage: 'lost' });
  const from = stageOf(o.stage).label;
  o.stage = stageId;
  o.probability = stageOf(stageId).probability;
  if (stageId === 'won') {
    o.closedAt = nowIso();
    o.history.push({ at: nowIso(), by: me().id, action: 'won', note: `${from} → Kazanıldı` });
    markDone();
  } else {
    delete o.closedAt;
    o.history.push({ at: nowIso(), by: me().id, action: 'stage', note: `${from} → ${stageOf(stageId).label} (%${o.probability})` });
  }
  write(s);
  toast(`${o.id}: ${stageOf(stageId).label}${stageId === 'quote' ? ' · fırsatı açıp teklif oluşturabilirsin' : ''}`);
  refreshAll();
}

// ---------- huni: tahmin ----------
function forecastView(s) {
  const list = pipeOpps(s);
  const open = list.filter(isOpen);
  const won = list.filter((o) => o.stage === 'won');
  const lost = list.filter((o) => o.stage === 'lost');
  const t = today();
  const winRate = won.length + lost.length ? Math.round((won.length / (won.length + lost.length)) * 100) : null;

  const groups = new Map();
  for (const o of open) {
    const k = o.closeDate < t ? 'past' : monthKey(o.closeDate);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(o);
  }
  const keys = [...groups.keys()].sort((a, b) => (a === 'past' ? -1 : b === 'past' ? 1 : a.localeCompare(b)));
  const maxW = Math.max(1, ...keys.map((k) => sum(groups.get(k), weighted)));
  const monthRows = keys
    .map((k) => {
      const g = groups.get(k);
      const w = sum(g, weighted);
      return `<tr class="${k === 'past' ? 'is-past' : ''}">
        <td><strong>${k === 'past' ? 'Kapanış tarihi geçmiş' : esc(monthLabel(k))}</strong><div class="trace-cells mt-xs">${g.map((o) => `<button class="chip" type="button" data-opp="${esc(o.id)}">${esc(accName(o.account).split(' ')[0])} · ${money(o.amount)} × %${o.probability}</button>`).join('')}</div></td>
        <td class="num">${g.length}</td>
        <td class="num hide-sm">${money(sum(g, (o) => o.amount))}</td>
        <td class="num"><strong>${money(w)}</strong><div class="fc-bar"><span style="width:${Math.round((w / maxW) * 100)}%"></span></div></td>
      </tr>`;
    })
    .join('');

  const owners = [...new Set(list.map((o) => o.owner))];
  const ownerRows = owners
    .map((id) => {
      const mine = list.filter((o) => o.owner === id);
      const op = mine.filter(isOpen);
      return `<tr><td>${esc(userName(id))}</td><td class="num">${op.length}</td><td class="num hide-sm">${money(sum(op, (o) => o.amount))}</td><td class="num"><strong>${money(sum(op, weighted))}</strong></td><td class="num">${money(sum(mine.filter((o) => o.stage === 'won'), (o) => o.amount))}</td></tr>`;
    })
    .join('');

  const risky = open.map((o) => ({ o, r: riskOf(o, s) })).filter((x) => x.r.length).sort((a, b) => weighted(b.o) - weighted(a.o));
  const reasons = new Map();
  for (const o of lost) {
    const k = o.lossReason || 'Belirtilmedi';
    const v = reasons.get(k) || { n: 0, amt: 0 };
    v.n++;
    v.amt += o.amount || 0;
    reasons.set(k, v);
  }
  const stageBar = OPEN_STAGES.map((id) => ({ id, w: sum(open.filter((o) => o.stage === id), weighted) }));
  const totalW = sum(stageBar, (x) => x.w) || 1;

  return `${pipeToolbar(s)}
    <div class="tl-panel">
      <div class="kpis">
        <div class="kpi card"><span class="stat-label">Açık huni</span><span class="kpi-value">${money(sum(open, (o) => o.amount))}</span><span class="cell-sub">${open.length} açık fırsat</span></div>
        <div class="kpi card"><span class="stat-label">Ağırlıklı tahmin</span><span class="kpi-value">${money(sum(open, weighted))}</span><span class="cell-sub">tutar × olasılık</span></div>
        <div class="kpi card"><span class="stat-label">Kazanılan</span><span class="kpi-value ok">${money(sum(won, (o) => o.amount))}</span><span class="cell-sub">${won.length} fırsat</span></div>
        <div class="kpi card"><span class="stat-label">Kazanma oranı</span><span class="kpi-value">${winRate == null ? '—' : `%${winRate}`}</span><span class="cell-sub">${won.length} kazanıldı · ${lost.length} kaybedildi</span></div>
      </div>
      <section class="card tl-sec">
        <h3 class="card-title">Aşamaya göre ağırlıklı tutar</h3>
        <div class="stackbar">${stageBar.map((x) => (x.w ? `<span class="fc-${x.id}" style="flex:${x.w}" title="${esc(stageOf(x.id).label)}: ${esc(money(x.w))}"></span>` : '')).join('')}</div>
        <div class="legend">${stageBar.map((x) => `<span><i class="fc-${x.id}"></i>${esc(stageOf(x.id).label)} ${money(x.w)} · ${pct((x.w / totalW) * 100)}</span>`).join('')}</div>
      </section>
      <section class="card table-card">
        <div class="table-wrap"><table class="table tl-table">
          <thead><tr><th>Kapanış ayı</th><th class="num">Fırsat</th><th class="num hide-sm">Tutar</th><th class="num">Ağırlıklı</th></tr></thead>
          <tbody>${monthRows || `<tr><td colspan="4" class="muted">Açık fırsat yok.</td></tr>`}</tbody>
        </table></div>
        <div class="table-foot">Kapanış tarihi geçmiş açık fırsatlar tahmini şişirir: tarihi güncelle veya fırsatı kapat.</div>
      </section>
      ${team() ? `<section class="card table-card"><div class="table-wrap"><table class="table tl-table">
          <thead><tr><th>Temsilci</th><th class="num">Açık</th><th class="num hide-sm">Huni</th><th class="num">Ağırlıklı</th><th class="num">Kazanılan</th></tr></thead>
          <tbody>${ownerRows}</tbody></table></div><div class="table-foot">Ekip görünümü (FORECAST_VIEW_TEAM).</div></section>` : ''}
      <section class="card tl-sec">
        <h3 class="card-title">${icon('alert')} Riskli fırsatlar</h3>
        ${risky.length ? `<ul class="risk-list">${risky.map(({ o, r }) => `<li><button class="risk-item" type="button" data-opp="${esc(o.id)}"><span class="risk-main"><span class="code">${esc(o.id)}</span> <strong>${esc(o.name)}</strong><span class="cell-sub">${esc(accName(o.account))} · ${esc(stageOf(o.stage).label)} · ${money(o.amount)} × %${o.probability} · kapanış ${date(o.closeDate)}</span></span><span class="chips">${r.map((x) => `<span class="chip static warn">${esc(x)}</span>`).join('')}</span></button></li>`).join('')}</ul>` : '<p class="cell-sub">Riskli açık fırsat yok.</p>'}
      </section>
      <section class="card tl-sec">
        <h3 class="card-title">Kayıp nedenleri</h3>
        ${reasons.size ? `<ul class="exit-list">${[...reasons.entries()].sort((a, b) => b[1].amt - a[1].amt).map(([k, v]) => `<li><span class="mark bad">${icon('close')}</span><span><strong>${esc(k)}</strong> · ${v.n} fırsat · ${money(v.amt)}</span></li>`).join('')}</ul>
          <div class="chips mt-sm">${lost.map((o) => `<button class="chip" type="button" data-opp="${esc(o.id)}">${esc(o.id)} · ${esc(o.competitor || 'rakip yok')}</button>`).join('')}</div>` : '<p class="cell-sub">Kaybedilen fırsat yok.</p>'}
      </section>
    </div>`;
}

// ---------- fırsat paneli ----------
function stepperHtml(o) {
  const order = ['discovery', 'needs', 'quote', 'negotiation', o.stage === 'lost' ? 'lost' : 'won'];
  const idx = order.indexOf(o.stage);
  return `<ol class="lc">${order.map((k, i) => `<li class="${i < idx ? 'done' : i === idx ? 'cur' : ''}${k === 'lost' && i === idx ? ' lost' : ''}">${esc(stageOf(k).label)}</li>`).join('')}</ol>`;
}

function oppForm(o, opts = {}) {
  const st = opts.stage || o.stage;
  const c = partnerOf(o.account);
  const isNew = !o.id;
  const D = company();
  const accounts = [...D.customers, ...(D.prospects || [])];
  const owners = holders('OPP_MANAGE');
  const R = cfg().lossReasons;
  return `<div class="iam-form opp-form" data-opp-form>
    ${opts.stage === 'lost' ? alertBox('warning', 'Kaybedildi olarak kapatılıyor', 'Kayıp nedeni zorunlu. Rakibi ve açıklamayı yaz; bu veri kayıp analizinde kullanılır.') : ''}
    <div class="form-grid">
      <label class="field span-2"><span class="field-label">Fırsat adı <span class="req">*</span></span><input class="input" data-o="name" value="${esc(o.name || '')}" maxlength="80"></label>
      ${isNew
        ? `<label class="field span-2"><span class="field-label">Hesap <span class="req">*</span></span><select class="select" data-o="account"><option value="">Hesap seç…</option>${accounts.map((a) => `<option value="${esc(a.id)}" ${a.id === o.account ? 'selected' : ''}>${esc(a.id)} · ${esc(a.name)}</option>`).join('')}</select></label>`
        : ''}
      <label class="field"><span class="field-label">Aşama</span><select class="select" data-o="stage">${stages().map((x) => `<option value="${esc(x.id)}" ${x.id === st ? 'selected' : ''}>${esc(x.label)} (%${x.probability})</option>`).join('')}</select></label>
      <label class="field"><span class="field-label">Olasılık (%)</span><input class="input" type="number" min="0" max="100" step="5" data-o="probability" value="${esc(st === o.stage ? o.probability ?? stageOf(st).probability : stageOf(st).probability)}"></label>
      <label class="field"><span class="field-label">Beklenen tutar (₺) <span class="req">*</span></span><input class="input" type="number" min="0" step="100" data-o="amount" value="${esc(o.amount ?? '')}"></label>
      <label class="field"><span class="field-label">Kapanış tarihi <span class="req">*</span></span><input class="input" type="date" data-o="closeDate" value="${esc(o.closeDate || '')}"></label>
      <label class="field"><span class="field-label">İlgili kişi</span><select class="select" data-o="contact"><option value="">—</option>${(c?.contacts || []).map((k) => `<option ${k.name === o.contact ? 'selected' : ''}>${esc(k.name)}</option>`).join('')}</select></label>
      <label class="field"><span class="field-label">Rakip</span><input class="input" data-o="competitor" value="${esc(o.competitor || '')}" maxlength="60" placeholder="Ör. Ege Toptan"></label>
      ${team() ? `<label class="field"><span class="field-label">Sorumlu</span><select class="select" data-o="owner">${owners.map((u) => `<option value="${esc(u.id)}" ${u.id === (o.owner || me().id) ? 'selected' : ''}>${esc(u.name)}</option>`).join('')}</select></label>` : ''}
    </div>
    <div class="form-grid" data-lost-fields ${st === 'lost' ? '' : 'hidden'}>
      <label class="field"><span class="field-label">Kayıp nedeni <span class="req">*</span></span><select class="select" data-o="lossReason"><option value="">Seç…</option>${R.map((x) => `<option ${x === o.lossReason ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></label>
      <label class="field span-2"><span class="field-label">Açıklama</span><textarea class="input textarea" rows="2" data-o="lossNote" placeholder="Rakip ne verdi, biz neyi veremedik?">${esc(o.lossNote || '')}</textarea></label>
    </div>
    <div class="form-grid" data-won-fields ${st === 'won' ? '' : 'hidden'}>
      <label class="field span-2"><span class="field-label">Kazanma nedeni</span><input class="input" data-o="winReason" value="${esc(o.winReason || '')}" maxlength="100"></label>
    </div>
    <div class="drawer-actions">
      <button class="btn btn-primary" type="button" data-act="opp-save">${icon('check')}<span>${isNew ? 'Fırsatı oluştur' : 'Kaydet'}</span></button>
      ${opts.stage ? '<button class="btn btn-ghost" type="button" data-close>Vazgeç</button>' : ''}
    </div>
  </div>`;
}

function bindOppForm(form) {
  if (!form) return;
  form.addEventListener('change', (e) => {
    const f = e.target.dataset.o;
    if (f === 'stage') {
      form.querySelector('[data-o="probability"]').value = stageOf(e.target.value).probability;
      form.querySelector('[data-lost-fields]').hidden = e.target.value !== 'lost';
      form.querySelector('[data-won-fields]').hidden = e.target.value !== 'won';
    }
    if (f === 'account') {
      const c = partnerOf(e.target.value);
      form.querySelector('[data-o="contact"]').innerHTML = `<option value="">—</option>${(c?.contacts || []).map((k) => `<option>${esc(k.name)}</option>`).join('')}`;
    }
  });
}

function readOppForm(form) {
  const v = (k) => form.querySelector(`[data-o="${k}"]`)?.value.trim() ?? '';
  return {
    name: v('name'), account: v('account'), stage: v('stage'), probability: Number(v('probability')), amount: Number(v('amount')), closeDate: v('closeDate'),
    contact: v('contact'), competitor: v('competitor'), owner: v('owner'), lossReason: v('lossReason'), lossNote: v('lossNote'), winReason: v('winReason'),
  };
}

function validateOpp(v, isNew) {
  if (!v.name) return 'Fırsat adı zorunlu';
  if (isNew && !v.account) return 'Hesap seç';
  if (!(v.amount > 0)) return 'Beklenen tutar sıfırdan büyük olmalı';
  if (!v.closeDate) return 'Kapanış tarihi zorunlu';
  if (!(v.probability >= 0 && v.probability <= 100)) return 'Olasılık 0–100 arasında olmalı';
  if (v.stage === 'lost' && !v.lossReason) return 'Kayıp nedeni zorunlu';
  return null;
}

function saveOpp(id, form) {
  const v = readOppForm(form);
  const err = validateOpp(v, !id);
  if (err) {
    form.querySelector(v.stage === 'lost' && !v.lossReason ? '[data-o="lossReason"]' : '[data-o="name"]')?.focus();
    return toast(err);
  }
  const s = state();
  const at = nowIso();
  let o;
  if (!id) {
    if (!can('OPP_MANAGE')) return toast(lockReason('OPP_MANAGE'));
    o = { id: nextId(s, 'opp', 'OPP'), account: v.account, owner: v.owner || me().id, source: 'Manuel', items: [], createdAt: at, history: [] };
    o.history.push({ at, by: me().id, action: 'created', note: '' });
    s.opps.push(o);
  } else {
    o = s.opps.find((x) => x.id === id);
    if (!o || !canEditOpp(o)) return toast(editReason(o) || lockReason('OPP_MANAGE'));
  }
  const prevStage = o.stage;
  const changes = [];
  const track = (k, label, fmt = (x) => x) => {
    if (id && o[k] !== v[k] && !(o[k] == null && !v[k])) changes.push(`${label}: ${fmt(o[k]) || '—'} → ${fmt(v[k]) || '—'}`);
  };
  track('probability', 'Olasılık', (x) => (x == null ? '' : `%${x}`));
  track('amount', 'Tutar', (x) => (x == null ? '' : money(x)));
  track('closeDate', 'Kapanış', (x) => (x ? date(x) : ''));
  track('competitor', 'Rakip');
  track('owner', 'Sorumlu', userName);
  Object.assign(o, { name: v.name, stage: v.stage, probability: v.probability, amount: v.amount, closeDate: v.closeDate, contact: v.contact, competitor: v.competitor });
  if (team() && v.owner) o.owner = v.owner;
  if (v.stage === 'lost') Object.assign(o, { lossReason: v.lossReason, lossNote: v.lossNote });
  if (v.stage === 'won') o.winReason = v.winReason;
  if (id && prevStage !== v.stage) {
    const closing = v.stage === 'won' || v.stage === 'lost';
    if (closing) o.closedAt = at;
    else delete o.closedAt;
    o.history.push({ at, by: me().id, action: closing ? v.stage : 'stage', note: `${stageOf(prevStage).label} → ${stageOf(v.stage).label}${v.stage === 'lost' ? ` · ${v.lossReason}${v.competitor ? ` · rakip ${v.competitor}` : ''}` : ''}` });
    if (v.stage === 'won') markDone();
  } else if (!id && (v.stage === 'won' || v.stage === 'lost')) o.closedAt = at;
  if (changes.length) o.history.push({ at, by: me().id, action: 'updated', note: changes.join(' · ') });
  write(s);
  toast(id ? `${o.id} kaydedildi` : `${o.id} oluşturuldu`);
  openOpp(o.id);
  refreshAll();
}

function quoteSection(o, s) {
  const linked = o.sync?.linked?.length ? allQuotes().filter((q) => o.sync.linked.includes(q.no)) : [];
  const rows = linked
    .map((q) => {
      const ord = orderForQuote(q.no);
      return `<li><button class="link" type="button" data-act="quote" data-no="${esc(q.no)}"><span class="code">${esc(q.no)}</span></button> ${quoteBadge(q)} <span class="cell-sub">net ${money(q.totals.net)}</span>${ord ? ` · <button class="link" type="button" data-act="order" data-no="${esc(ord.no)}">Sipariş ${esc(ord.no)}</button>` : q.status === 'approved' ? ' · <span class="cell-sub">siparişe dönüştürülebilir</span>' : ''}</li>`;
    })
    .join('');
  const canQuote = ['quote', 'negotiation'].includes(o.stage);
  const items = (o.items || []).map((i) => `${i.code} ${i.qty}`).join('\n');
  const editable = canEditOpp(o) && isOpen(o);
  return dsec(
    'Teklif',
    `${rows ? `<ul class="opp-quotes">${rows}</ul>` : `<p class="cell-sub">${canQuote ? 'Bu fırsata bağlı teklif yok.' : 'Teklif aşamasına geçince fırsattan teklif oluşturabilirsin.'}</p>`}
    ${isOpen(o) ? `<label class="field"><span class="field-label">Teklif kalemleri (her satır: KOD MİKTAR)</span><textarea class="input textarea" rows="3" data-items ${editable ? '' : 'disabled'} placeholder="TM-2001 20">${esc(items)}</textarea></label>
    <div class="drawer-actions">
      ${editable ? `<button class="btn btn-ghost" type="button" data-act="items-save">${icon('check')}<span>Kalemleri kaydet</span></button>` : ''}
      ${actionBtn({ perm: 'QUOTE_CREATE', label: 'Teklif oluştur', iconName: 'tag', attrs: 'data-act="make-quote"', reason: can('QUOTE_CREATE') && !canQuote ? 'Önce fırsatı Teklif aşamasına taşı.' : null })}
    </div>
    <p class="cell-sub">Teklif simülasyonu bu fırsata bağlı açılır. Teklif onaylanınca beklenen tutar teklif net tutarına güncellenir ve fırsat Pazarlık'a geçer; tekliften sipariş oluşunca fırsat Kazanıldı olur.</p>` : ''}`
  );
}

function parseItems(txt) {
  return String(txt)
    .split('\n')
    .map((l) => l.match(/^\s*([A-Za-z]{2}-\d{4})\s*[x×*]?\s*(\d+)/))
    .filter(Boolean)
    .map((m) => ({ code: m[1].toUpperCase(), qty: Number(m[2]) }))
    .filter((i) => productOf(i.code) && i.qty > 0);
}

function actsList(list) {
  if (!list.length) return '<p class="cell-sub">Aktivite yok.</p>';
  const t = today();
  return `<ul class="act-list">${[...list]
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((a) => {
      const late = a.status === 'open' && a.date < t;
      return `<li class="${late ? 'is-late' : ''} ${a.status === 'done' ? 'is-done' : ''}"><button class="act-row" type="button" data-act="activity" data-id="${esc(a.id)}">
        <span class="act-ico t-${a.type}">${icon(ACT_TYPE[a.type].icon)}</span>
        <span class="act-text"><strong>${esc(a.subject)}</strong><span class="cell-sub">${esc(ACT_TYPE[a.type].label)} · ${date(a.date)}${a.time ? ` ${esc(a.time)}` : ''} · ${esc(userName(a.owner))}</span></span>
        ${late ? badge('Gecikmiş', 'danger') : a.status === 'done' ? badge('Tamamlandı', 'success') : badge('Planlandı', 'neutral')}
      </button></li>`;
    })
    .join('')}</ul>`;
}

function openOpp(id, opts = {}) {
  const s = state();
  const o = s.opps.find((x) => x.id === id);
  if (!o) return toast('Fırsat bulunamadı');
  // Ekip görünümü olmayan kullanıcı başkasının fırsatını salt okunur görür (canEditOpp)
  const risk = riskOf(o, s);
  const c = partnerOf(o.account);
  const editable = canEditOpp(o);
  const camp = o.campaign ? s.camps.find((x) => x.id === o.campaign) : null;
  const html =
    drawerHead(`Fırsat · ${o.id}`, o.name, badge(stageOf(o.stage).label, o.stage === 'won' ? 'success' : o.stage === 'lost' ? 'danger' : 'info') + (isOpen(o) ? badge(`%${o.probability}`, 'neutral') : '') + (risk.length ? badge('Riskli', 'warning') : '')) +
    `<div class="drawer-body">
      ${stepperHtml(o)}
      ${o.stage === 'lost' && !opts.stage ? alertBox('danger', `Kaybedildi · ${esc(o.lossReason || 'neden yok')}`, `${o.competitor ? `Rakip: <strong>${esc(o.competitor)}</strong>. ` : ''}${esc(o.lossNote || '')}`) : ''}
      ${o.stage === 'won' ? alertBox('success', 'Kazanıldı', `${esc(o.winReason || '')}${o.orderNo ? ` · Sipariş <span class="code">${esc(o.orderNo)}</span>` : ''}${o.closedAt ? ` · ${datetime(o.closedAt)}` : ''}`) : ''}
      ${risk.length ? alertBox('warning', 'Risk sinyalleri', esc(risk.join(' · '))) : ''}
      ${dsec('Özet', kv([
        ['Hesap', `<button class="link" type="button" data-act="account" data-id="${esc(o.account)}">${esc(accName(o.account))}</button>${c?.prospect ? ` ${badge('Aday', 'info')}` : ''}`],
        ['Beklenen tutar', `<strong>${money(o.amount)}</strong>${isOpen(o) ? ` · ağırlıklı ${money(weighted(o))}` : ''}`],
        ['Kapanış tarihi', `<span class="${isOpen(o) && o.closeDate < today() ? 'neg' : ''}">${date(o.closeDate)}</span>`],
        ['Sorumlu', esc(userName(o.owner))],
        ['Kaynak', `${esc(o.source || '—')}${camp ? ` · ${esc(camp.name)}` : ''}${o.lead ? ` · <button class="link" type="button" data-act="lead" data-id="${esc(o.lead)}">${esc(o.lead)}</button>` : ''}`],
      ]))}
      ${editable && (!opts.stage || opts.stage === 'lost') ? dsec(opts.stage === 'lost' ? 'Kaybedildi olarak kapat' : 'Düzenle', oppForm(o, opts)) : !editable ? `<p class="lock-note">${icon('lock')}<span>${esc(editReason(o) || lockReason('OPP_MANAGE'))}</span></p>` : ''}
      ${opts.stage ? '' : quoteSection(o, s)}
      ${opts.stage ? '' : dsec('Aktiviteler', `${actsList(s.acts.filter((a) => a.opportunity === o.id))}<div class="drawer-actions">${actionBtn({ perm: 'OPP_MANAGE', label: 'Aktivite ekle', iconName: 'calendar', cls: 'btn-ghost', attrs: 'data-act="new-act"' })}</div>`)}
      ${opts.stage ? '' : dsec('Geçmiş', `<ol class="timeline">${[...o.history].reverse().map((h) => `<li><span class="tl-dot tone-${h.action === 'won' || h.action === 'quote-approved' || h.action === 'order' ? 'success' : h.action === 'lost' || h.action === 'quote-rejected' ? 'danger' : 'info'}">${icon(h.action === 'won' || h.action === 'order' ? 'check' : h.action.startsWith('quote') ? 'tag' : 'clock')}</span><div class="tl-body"><div><strong>${esc(userName(h.by))}</strong> <span>${esc(HIST[h.action] || h.action)}</span></div><span class="cell-sub">${datetime(h.at)}</span>${h.note ? `<p class="tl-note">${esc(h.note)}</p>` : ''}</div></li>`).join('')}</ol>`)}
    </div>`;
  openDrawer(html, (el) => oppAction(id, el));
  bindOppForm(document.querySelector('.drawer-root [data-opp-form]'));
  if (opts.stage === 'lost') setTimeout(() => document.querySelector('.drawer-root [data-o="lossReason"]')?.focus(), 50);
}

function oppAction(id, el) {
  const act = el.dataset.act;
  const root = el.closest('.drawer-inner');
  if (act === 'opp-save') return saveOpp(id, root.querySelector('[data-opp-form]'));
  if (act === 'account') return goAccount(el.dataset.id);
  if (act === 'lead') return openLead(el.dataset.id);
  if (act === 'quote') return openQuote(el.dataset.no);
  if (act === 'order') return openDoc('order', el.dataset.no);
  if (act === 'activity') return openAct(el.dataset.id);
  if (act === 'new-act') {
    const o = state().opps.find((x) => x.id === id);
    return openActForm(null, { account: o.account, opportunity: o.id });
  }
  const s = state();
  const o = s.opps.find((x) => x.id === id);
  if (!o) return;
  if (act === 'items-save') {
    if (!canEditOpp(o)) return toast(lockReason('OPP_MANAGE'));
    o.items = parseItems(root.querySelector('[data-items]').value);
    write(s);
    toast(`${o.items.length} kalem kaydedildi`);
    return openOpp(id);
  }
  if (act === 'make-quote') {
    if (!can('QUOTE_CREATE')) return toast(lockReason('QUOTE_CREATE'));
    const ta = root.querySelector('[data-items]');
    if (ta && canEditOpp(o)) {
      o.items = parseItems(ta.value);
      write(s);
    }
    const sc = quoteSimCtx();
    if (!sc) return toast('Teklif simülasyonu yüklenemedi');
    applyPreset({ customer: o.account, contact: o.contact, reference: o.id, items: o.items || [], opportunity: { id: o.id, name: o.name } }, sc);
    closeDrawer(true);
    location.hash = '#/track/b2b-crm/simulation';
  }
}

function newOpp(prefill = {}) {
  if (!can('OPP_MANAGE')) return toast(lockReason('OPP_MANAGE'));
  const o = { name: '', account: '', stage: 'discovery', probability: 10, amount: '', closeDate: addDays(today(), 60), contact: '', competitor: '', owner: me().id, ...prefill };
  openDrawer(drawerHead('Yeni fırsat', 'Fırsat oluştur') + `<div class="drawer-body">${oppForm(o)}</div>`, (el) => {
    if (el.dataset.act === 'opp-save') saveOpp(null, el.closest('[data-opp-form]'));
  });
  bindOppForm(document.querySelector('.drawer-root [data-opp-form]'));
}

// ---------- leadler ----------
function leadsView(s) {
  const counts = { open: 0, converted: 0, rejected: 0 };
  s.leads.forEach((l) => counts[l.status]++);
  const list = s.leads.filter((l) => leadFilter === 'all' || l.status === leadFilter).slice().reverse();
  const f = (id, label, n) => `<button type="button" data-lfilter="${id}" class="${leadFilter === id ? 'is-active' : ''}">${label} <span class="count muted-count">${n}</span></button>`;
  return `<div class="toolbar">
      <div class="seg-ctrl" role="tablist" aria-label="Lead filtresi">${f('open', 'Açık', counts.open)}${f('converted', 'Dönüştürülen', counts.converted)}${f('rejected', 'Reddedilen', counts.rejected)}${f('all', 'Tümü', s.leads.length)}</div>
      <span class="c4c-spacer"></span>
      ${actionBtn({ perm: 'LEAD_CREATE', label: 'Yeni lead', iconName: 'target', attrs: 'data-new-lead' })}
    </div>
    ${list.length
      ? `<div class="card table-card"><div class="table-wrap"><table class="table tl-table c4c-table">
        <thead><tr><th>Lead</th><th class="hide-sm">Kaynak</th><th>Sıcaklık</th><th>BANT</th><th class="num hide-md">Tahmini değer</th><th>Durum</th></tr></thead>
        <tbody>${list
          .map((l) => {
            const n = bantCount(l);
            const camp = l.campaign ? s.camps.find((c) => c.id === l.campaign) : null;
            return `<tr data-lead="${esc(l.id)}" tabindex="0">
              <td><span class="code">${esc(l.id)}</span> <strong>${esc(l.company)}</strong>${l.account ? ` ${badge('Mevcut hesap', 'neutral')}` : ''}<div class="cell-sub">${esc(l.contact?.name || '—')}${l.contact?.role ? ` · ${esc(l.contact.role)}` : ''} · ${esc(l.region || '')}</div></td>
              <td class="hide-sm">${esc(l.source)}${camp ? `<div class="cell-sub">${esc(camp.name)}</div>` : ''}</td>
              <td>${badge(SCORE[l.score]?.label || l.score, SCORE[l.score]?.tone)}</td>
              <td><span class="bant-mini" aria-label="BANT ${n}/4">${BANT.map((b) => `<i class="${l.bant?.[b.k] ? 'on' : ''}" title="${esc(b.label)}"></i>`).join('')}</span><span class="cell-sub"> ${n}/4</span></td>
              <td class="num hide-md">${money(l.value || 0)}</td>
              <td>${badge(LSTATUS[l.status].label, LSTATUS[l.status].tone)}</td>
            </tr>`;
          })
          .join('')}</tbody></table></div>
        <div class="table-foot">Nitelikli lead (BANT 4/4) tek tıkla hesap + ilgili kişi + fırsata dönüşür; niteliksiz lead gerekçeyle reddedilir.</div></div>`
      : `<div class="card">${emptyState('target', 'Bu filtrede lead yok', 'Fuar, web, kampanya veya referanstan gelen ilgiyi lead olarak aç.')}</div>`}`;
}

function openLead(id, panel = '') {
  const s = state();
  const l = s.leads.find((x) => x.id === id);
  if (!l) return toast('Lead bulunamadı');
  const open = l.status === 'open';
  const canQ = can('LEAD_QUALIFY');
  const n = bantCount(l);
  const missing = BANT.filter((b) => !l.bant?.[b.k]).map((b) => b.label.split(' ')[0]);
  const camp = l.campaign ? s.camps.find((c) => c.id === l.campaign) : null;
  const acc = l.account ? partnerOf(l.account) : null;
  const opp = l.opportunity ? s.opps.find((o) => o.id === l.opportunity) : null;
  const convertReason = canQ && n < 4 ? `BANT tamamlanmadı (${n}/4) · eksik: ${missing.join(', ')}` : canQ && acc?.blocked ? 'Hesap bloke: bloke müşteriye fırsat açılamaz.' : null;
  const html =
    drawerHead(`Lead · ${l.id}`, l.company, badge(LSTATUS[l.status].label, LSTATUS[l.status].tone) + badge(SCORE[l.score]?.label || '', SCORE[l.score]?.tone) + badge(l.source, 'neutral')) +
    `<div class="drawer-body" data-lead-form>
      ${l.status === 'converted' ? alertBox('success', 'Dönüştürüldü', `${opp ? `Fırsat <button class="link" type="button" data-act="opp" data-id="${esc(opp.id)}">${esc(opp.id)} ${esc(opp.name)}</button> · ` : ''}${l.account ? `hesap <button class="link" type="button" data-act="account" data-id="${esc(l.account)}">${esc(accName(l.account))}</button>` : ''}${l.closedAt ? ` · ${datetime(l.closedAt)}` : ''}`) : ''}
      ${l.status === 'rejected' ? alertBox('info', `Reddedildi · ${esc(l.rejectReason || '')}`, esc(l.rejectNote || '')) : ''}
      ${acc?.blocked && open ? alertBox('danger', 'Hesap bloke', esc(acc.blockReason || '')) : ''}
      ${dsec('Lead', kv([
        ['Şirket', `${esc(l.company)}${acc ? ` · <button class="link" type="button" data-act="account" data-id="${esc(acc.id)}">Hesap 360</button>` : ` ${badge('Yeni şirket', 'info')}`}`],
        ['İlgili kişi', `${esc(l.contact?.name || '—')}${l.contact?.role ? ` · ${esc(l.contact.role)}` : ''}${l.contact?.phone ? `<div class="cell-sub">${esc(l.contact.phone)}${l.contact.email ? ` · ${esc(l.contact.email)}` : ''}</div>` : ''}`],
        ['Kaynak', `${esc(l.source)}${camp ? ` · ${esc(camp.name)}` : ''}`],
        ['Bölge / kanal', `${esc(l.region || '—')} · ${esc(channelName(l.channel || '10'))} · tahmini segment ${esc(l.segment || '—')}`],
        ['Tahmini değer', money(l.value || 0)],
        ['Sorumlu', esc(userName(l.owner))],
        l.note ? ['Not', esc(l.note)] : null,
      ]))}
      ${dsec(`BANT nitelendirme · ${n}/4`, `<div class="bant">${BANT.map((b) => `<label class="role-opt"><input type="checkbox" data-bant="${b.k}" ${l.bant?.[b.k] ? 'checked' : ''} ${open && canQ ? '' : 'disabled'}><span><strong>${esc(b.label)}</strong><span class="cell-sub">${esc(b.text)}</span></span></label>`).join('')}</div>
        ${open ? `<label class="field mt-sm"><span class="field-label">Sıcaklık</span><select class="select" data-score ${canQ ? '' : 'disabled'}>${Object.entries(SCORE).map(([k, v]) => `<option value="${k}" ${k === l.score ? 'selected' : ''}>${v.label}</option>`).join('')}</select></label>` : ''}
        ${open && !canQ ? `<p class="lock-note">${icon('lock')}<span>${esc(lockReason('LEAD_QUALIFY'))}</span></p>` : ''}`)}
      ${open ? `<div class="drawer-actions">
        ${actionBtn({ perm: 'LEAD_QUALIFY', label: 'Nitelikli · dönüştür', iconName: 'check', attrs: 'data-act="convert"', reason: convertReason })}
        ${actionBtn({ perm: 'LEAD_QUALIFY', label: 'Reddet', iconName: 'close', cls: 'btn-ghost danger', attrs: 'data-act="reject"' })}
      </div>
      <div data-lead-panel>${panel === 'convert' && !convertReason && canQ ? convertPanel(l) : panel === 'reject' && canQ ? rejectPanel() : ''}</div>` : ''}
    </div>`;
  openDrawer(html, (el) => leadAction(id, el));
  const form = document.querySelector('.drawer-root [data-lead-form]');
  form?.addEventListener('change', (e) => {
    const t = e.target;
    if (t.dataset.bant || t.dataset.score != null) {
      if (!can('LEAD_QUALIFY')) return;
      const s2 = state();
      const x = s2.leads.find((y) => y.id === id);
      if (!x || x.status !== 'open') return;
      if (t.dataset.bant) x.bant = { ...(x.bant || {}), [t.dataset.bant]: t.checked };
      else x.score = t.value;
      write(s2);
      openLead(id);
      refreshAll();
    }
  });
}

function convertPanel(l) {
  const acc = l.account ? partnerOf(l.account) : null;
  const D = company();
  const regions = [...new Set([...D.customers.map((c) => c.region), l.region].filter(Boolean))];
  const owners = holders('OPP_MANAGE');
  const contactKnown = acc?.contacts?.some((k) => k.name === l.contact?.name);
  return `<div class="md-form" data-convert>
    <strong>Hesap + ilgili kişi + fırsat oluştur</strong>
    ${acc
      ? `<p class="cell-sub">Hesap mevcut: <strong>${esc(acc.name)}</strong> (${esc(acc.id)}). ${l.contact?.name && !contactKnown ? `İlgili kişi <strong>${esc(l.contact.name)}</strong> hesaba eklenecek.` : 'İlgili kişi hesapta kayıtlı.'}</p>`
      : `<div class="form-grid">
          <label class="field span-2"><span class="field-label">Yeni hesap adı <span class="req">*</span></span><input class="input" data-c="accName" value="${esc(l.company)}"></label>
          <label class="field"><span class="field-label">Bölge</span><select class="select" data-c="region">${regions.map((r) => `<option ${r === l.region ? 'selected' : ''}>${esc(r)}</option>`).join('')}</select></label>
          <label class="field"><span class="field-label">Kanal</span><select class="select" data-c="channel">${D.organization.distributionChannels.map((c) => `<option value="${esc(c.code)}" ${c.code === (l.channel || '10') ? 'selected' : ''}>${esc(c.code)} · ${esc(c.name)}</option>`).join('')}</select></label>
          <label class="field"><span class="field-label">Segment</span><select class="select" data-c="segment">${['A', 'B', 'C'].map((x) => `<option ${x === (l.segment || 'C') ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
        </div>
        <p class="cell-sub">Aday hesap olarak açılır (peşin, kredi limiti yok). Sipariş ERP'ye aktarılmadan önce Key User hesabı ERP'de açmalı.</p>`}
    <div class="form-grid">
      <label class="field span-2"><span class="field-label">Fırsat adı <span class="req">*</span></span><input class="input" data-c="oppName" value="${esc(l.campaign ? `${l.company.split(' ')[0]} · kampanya fırsatı` : `${l.company.split(' ')[0]} · ilk sipariş`)}"></label>
      <label class="field"><span class="field-label">Beklenen tutar (₺) <span class="req">*</span></span><input class="input" type="number" min="0" step="100" data-c="amount" value="${esc(l.value || '')}"></label>
      <label class="field"><span class="field-label">Kapanış tarihi <span class="req">*</span></span><input class="input" type="date" data-c="closeDate" value="${esc(addDays(today(), 30))}"></label>
      <label class="field"><span class="field-label">Aşama</span><select class="select" data-c="stage">${['discovery', 'needs'].map((x) => `<option value="${x}" ${x === 'needs' ? 'selected' : ''}>${esc(stageOf(x).label)} (%${stageOf(x).probability})</option>`).join('')}</select></label>
      <label class="field"><span class="field-label">Fırsat sorumlusu</span><select class="select" data-c="owner">${owners.map((u) => `<option value="${esc(u.id)}" ${u.id === (owners.some((x) => x.id === me().id) ? me().id : l.owner) ? 'selected' : ''}>${esc(u.name)}</option>`).join('')}</select></label>
    </div>
    <div class="drawer-actions"><button class="btn btn-primary" type="button" data-act="convert-ok">${icon('check')}<span>Hesap + kişi + fırsat oluştur</span></button></div>
  </div>`;
}

function rejectPanel() {
  return `<div class="md-form" data-reject>
    <label class="field"><span class="field-label">Ret gerekçesi <span class="req">*</span></span><select class="select" data-r="reason"><option value="">Seç…</option>${cfg().rejectReasons.map((r) => `<option>${esc(r)}</option>`).join('')}</select></label>
    <label class="field"><span class="field-label">Açıklama</span><textarea class="input textarea" rows="2" data-r="note" placeholder="Ör. Şubat'ta yeniden aranacak."></textarea></label>
    <div class="drawer-actions"><button class="btn btn-primary" type="button" data-act="reject-ok">${icon('close')}<span>Lead'i reddet</span></button></div>
  </div>`;
}

function leadAction(id, el) {
  const act = el.dataset.act;
  if (act === 'opp') return openOpp(el.dataset.id);
  if (act === 'account') return goAccount(el.dataset.id);
  if (act === 'convert') return openLead(id, 'convert');
  if (act === 'reject') return openLead(id, 'reject');
  const root = el.closest('.drawer-inner');
  if (act === 'convert-ok') return convertLead(id, root.querySelector('[data-convert]'));
  if (act === 'reject-ok') {
    const reason = root.querySelector('[data-r="reason"]').value;
    const note = root.querySelector('[data-r="note"]').value.trim();
    if (!reason) {
      root.querySelector('[data-r="reason"]').focus();
      return toast('Ret gerekçesi zorunlu');
    }
    rejectLead(id, reason, note);
  }
}

export function rejectLead(id, reason, note = '') {
  if (!can('LEAD_QUALIFY') || !reason) return false;
  const s = state();
  const l = s.leads.find((x) => x.id === id);
  if (!l || l.status !== 'open') return false;
  Object.assign(l, { status: 'rejected', rejectReason: reason, rejectNote: note, closedAt: nowIso(), closedBy: me().id });
  write(s);
  toast(`${l.id} reddedildi · ${reason}`);
  if (rootRef?.isConnected) openLead(id);
  refreshAll();
  return true;
}

// v: { accName, region, channel, segment, oppName, amount, closeDate, stage, owner }
export function convertLeadWith(id, v) {
  if (!can('LEAD_QUALIFY')) return { error: lockReason('LEAD_QUALIFY') };
  const s = state();
  const l = s.leads.find((x) => x.id === id);
  if (!l || l.status !== 'open') return { error: 'Lead açık değil' };
  if (bantCount(l) < 4) return { error: 'BANT tamamlanmadı' };
  if (!v.oppName || !(v.amount > 0) || !v.closeDate) return { error: 'Fırsat adı, beklenen tutar ve kapanış tarihi zorunlu' };
  let acc = l.account ? partnerOf(l.account) : null;
  if (acc?.blocked) return { error: 'Hesap bloke' };
  const contact = l.contact?.name ? { name: l.contact.name, role: l.contact.role || '', phone: l.contact.phone || '', email: l.contact.email || '' } : null;
  const ownerOk = holders('OPP_MANAGE').some((u) => u.id === v.owner);
  const owner = ownerOk ? v.owner : me().id;
  if (!acc) {
    if (!v.accName) return { error: 'Hesap adı zorunlu' };
    acc = addProspect({ name: v.accName, region: v.region || l.region, city: v.region || l.region, channel: v.channel || l.channel || '10', segment: v.segment || l.segment || 'C', salesRep: owner, source: `${l.source}${l.campaign ? ` · ${l.campaign}` : ''} (${l.id})`, estimatedAnnualVolume: v.amount, note: l.note || '', contacts: contact ? [contact] : [] });
  } else if (contact && !acc.contacts.some((k) => k.name === contact.name)) {
    updateCustomer(acc.id, { contacts: [...acc.contacts, contact] }, { silent: true });
  }
  const at = nowIso();
  const o = {
    id: nextId(s, 'opp', 'OPP'), name: v.oppName, account: acc.id, contact: contact?.name || acc.contacts?.[0]?.name || '', owner, stage: v.stage || 'needs',
    probability: stageOf(v.stage || 'needs').probability, amount: Number(v.amount), closeDate: v.closeDate, competitor: '', source: l.source, campaign: l.campaign || null, lead: l.id,
    items: [], createdAt: at, history: [{ at, by: me().id, action: 'converted', note: `${l.id} · BANT 4/4${l.campaign ? ` · ${l.campaign}` : ''}` }],
  };
  s.opps.push(o);
  Object.assign(l, { status: 'converted', account: acc.id, opportunity: o.id, closedAt: at, closedBy: me().id });
  write(s);
  markDone();
  return { opportunity: o, account: acc };
}

function convertLead(id, form) {
  const v = (k) => form.querySelector(`[data-c="${k}"]`)?.value.trim() ?? '';
  const r = convertLeadWith(id, { accName: v('accName'), region: v('region'), channel: v('channel'), segment: v('segment'), oppName: v('oppName'), amount: Number(v('amount')), closeDate: v('closeDate'), stage: v('stage'), owner: v('owner') });
  if (r.error) return toast(r.error);
  toast(`${r.account.prospect ? `Aday hesap ${r.account.id} · ` : ''}${r.opportunity.id} oluşturuldu`);
  openOpp(r.opportunity.id);
  refreshAll();
}

function openLeadForm() {
  if (!can('LEAD_CREATE')) return toast(lockReason('LEAD_CREATE'));
  const s = state();
  const D = company();
  const regions = [...new Set(D.customers.map((c) => c.region))];
  const accounts = [...D.customers, ...(D.prospects || [])];
  const html =
    drawerHead('Yeni lead', 'Lead oluştur') +
    `<div class="drawer-body iam-form" data-newlead>
      <div class="form-grid">
        <label class="field span-2"><span class="field-label">Mevcut hesap (isteğe bağlı)</span><select class="select" data-l="account"><option value="">— Yeni şirket —</option>${accounts.map((a) => `<option value="${esc(a.id)}">${esc(a.id)} · ${esc(a.name)}</option>`).join('')}</select></label>
        <label class="field span-2"><span class="field-label">Şirket <span class="req">*</span></span><input class="input" data-l="company" maxlength="80" placeholder="Ör. Salihli Gross Market"></label>
        <label class="field"><span class="field-label">İlgili kişi <span class="req">*</span></span><input class="input" data-l="cname" maxlength="60"></label>
        <label class="field"><span class="field-label">Görevi</span><input class="input" data-l="crole" maxlength="60"></label>
        <label class="field"><span class="field-label">Telefon</span><input class="input" data-l="phone" maxlength="20"></label>
        <label class="field"><span class="field-label">E-posta</span><input class="input" type="email" data-l="email" maxlength="80"></label>
        <label class="field"><span class="field-label">Kaynak <span class="req">*</span></span><select class="select" data-l="source">${cfg().leadSources.map((x) => `<option>${esc(x)}</option>`).join('')}</select></label>
        <label class="field"><span class="field-label">Kampanya</span><select class="select" data-l="campaign"><option value="">—</option>${s.camps.map((c) => `<option value="${esc(c.id)}">${esc(c.id)} · ${esc(c.name)}</option>`).join('')}</select></label>
        <label class="field"><span class="field-label">Sıcaklık</span><select class="select" data-l="score">${Object.entries(SCORE).map(([k, v]) => `<option value="${k}" ${k === 'warm' ? 'selected' : ''}>${v.label}</option>`).join('')}</select></label>
        <label class="field"><span class="field-label">Bölge</span><select class="select" data-l="region">${regions.map((r) => `<option>${esc(r)}</option>`).join('')}</select></label>
        <label class="field"><span class="field-label">Kanal</span><select class="select" data-l="channel">${D.organization.distributionChannels.map((c) => `<option value="${esc(c.code)}">${esc(c.code)} · ${esc(c.name)}</option>`).join('')}</select></label>
        <label class="field"><span class="field-label">Tahmini değer (₺)</span><input class="input" type="number" min="0" step="1000" data-l="value"></label>
        <label class="field span-2"><span class="field-label">Not</span><textarea class="input textarea" rows="2" data-l="note"></textarea></label>
      </div>
      <div class="drawer-actions"><button class="btn btn-primary" type="button" data-act="lead-save">${icon('check')}<span>Lead'i oluştur</span></button><button class="btn btn-ghost" type="button" data-close>Vazgeç</button></div>
    </div>`;
  openDrawer(html, (el) => {
    if (el.dataset.act !== 'lead-save') return;
    const f = el.closest('[data-newlead]');
    const v = (k) => f.querySelector(`[data-l="${k}"]`).value.trim();
    const acc = v('account') ? partnerOf(v('account')) : null;
    const company_ = acc?.name || v('company');
    if (!company_ || !v('cname')) return toast('Şirket ve ilgili kişi zorunlu');
    if (v('source') === 'Kampanya' && !v('campaign')) return toast('Kaynak Kampanya ise kampanyayı seç');
    const s2 = state();
    const l = {
      id: nextId(s2, 'lead', 'LEAD'), company: company_, account: acc?.id, contact: { name: v('cname'), role: v('crole'), phone: v('phone'), email: v('email') },
      source: v('source'), campaign: v('campaign') || null, score: v('score'), region: acc?.region || v('region'), segment: acc?.segment || 'C', channel: acc?.channel || v('channel'),
      value: Number(v('value')) || 0, bant: { budget: false, authority: false, need: false, timeline: false }, status: 'open', owner: me().id, note: v('note'), createdAt: nowIso(), createdBy: me().id,
    };
    s2.leads.push(l);
    write(s2);
    toast(`${l.id} oluşturuldu`);
    leadFilter = 'open';
    openLead(l.id);
    refreshAll();
  });
  const f = document.querySelector('.drawer-root [data-newlead]');
  f?.querySelector('[data-l="account"]').addEventListener('change', (e) => {
    const a = partnerOf(e.target.value);
    const inp = f.querySelector('[data-l="company"]');
    inp.value = a?.name || '';
    inp.disabled = !!a;
  });
}

// ---------- hesaplar ----------
function accountsView(s) {
  const D = company();
  const q = norm(accQuery);
  const list = [...D.customers, ...(D.prospects || [])].filter((c) => !q || norm(`${c.id} ${c.name} ${c.region} ${c.city}`).includes(q));
  const opps = visibleOpps(s);
  return `<div class="toolbar">
      <label class="search">${icon('search')}<input type="search" data-accq value="${esc(accQuery)}" placeholder="Hesap, numara veya bölge ara" autocomplete="off"></label>
      <span class="toolbar-count">${list.length} hesap</span>
    </div>
    <div class="card table-card"><div class="table-wrap"><table class="table tl-table c4c-table">
      <thead><tr><th>Hesap</th><th class="hide-sm">Bölge</th><th>Segment</th><th class="num hide-md">Açık fırsat</th><th class="hide-md">Son aktivite</th><th>Kredi</th></tr></thead>
      <tbody>${list
        .map((c) => {
          const op = opps.filter((o) => o.account === c.id && isOpen(o));
          const last = s.acts.filter((a) => a.account === c.id && a.date <= today()).sort((a, b) => b.date.localeCompare(a.date))[0];
          const cs = creditStatus(c);
          return `<tr data-account="${esc(c.id)}" tabindex="0">
            <td><strong>${esc(c.name)}</strong><div class="cell-sub">${esc(c.id)} · ${esc(channelName(c.channel))}</div></td>
            <td class="hide-sm">${esc(c.region || '—')}</td>
            <td>${segBadge(c.segment)}</td>
            <td class="num hide-md">${op.length ? `${op.length} · ${money(sum(op, (o) => o.amount))}` : '<span class="muted">—</span>'}</td>
            <td class="hide-md">${last ? `${date(last.date)}<div class="cell-sub">${esc(ACT_TYPE[last.type].label)}</div>` : '<span class="muted">—</span>'}</td>
            <td>${badge(cs.label, cs.tone)}</td>
          </tr>`;
        })
        .join('')}</tbody></table></div>
      <div class="table-foot">Satıra tıklayınca Hesap 360 açılır. Aday hesaplar ERP'de açılana kadar müşteri numarası taşımaz.</div></div>`;
}

const ACC_TABS = [
  ['summary', 'Özet'], ['contacts', 'İlgili kişiler'], ['opps', 'Fırsatlar'], ['acts', 'Aktiviteler'], ['docs', 'Teklifler / siparişler'], ['balance', 'Açık bakiye'],
];

function account360(s) {
  const c = partnerOf(accountId);
  const cs = creditStatus(c);
  const opps = visibleOpps(s).filter((o) => o.account === c.id);
  const acts = visibleActs(s).filter((a) => a.account === c.id);
  const quotes = visibleQuotes().filter((q) => q.customer === c.id);
  const orders = visibleOrders().filter((o) => o.customer === c.id);
  const n = { contacts: c.contacts.length, opps: opps.filter(isOpen).length, acts: acts.filter((a) => a.status === 'open').length, docs: quotes.length + orders.length };
  const body =
    accTab === 'contacts' ? accContacts(c)
    : accTab === 'opps' ? accOpps(c, opps)
    : accTab === 'acts' ? `<div class="toolbar"><span class="c4c-spacer"></span>${actionBtn({ perm: 'OPP_MANAGE', label: 'Yeni aktivite', iconName: 'calendar', attrs: `data-new-act data-account="${esc(c.id)}"` })}</div><div class="card tl-sec">${actsList(acts)}</div>`
    : accTab === 'docs' ? accDocs(quotes, orders)
    : accTab === 'balance' ? accBalance(c, cs)
    : accSummary(c, cs, opps, acts, s);
  return `<button class="back" type="button" data-acc-back>${icon('back')}<span>Tüm hesaplar</span></button>
    <header class="card acc-head">
      <span class="icon-tile">${icon('building')}</span>
      <div class="acc-title"><h2>${esc(c.name)}</h2><div class="badges">${badge(c.prospect ? 'Aday hesap' : `ERP ${erpNumberOf(c)}`, c.prospect ? 'info' : 'neutral')}${segBadge(c.segment)}${badge(channelName(c.channel), 'neutral')}${badge(cs.label, cs.tone)}</div></div>
      <button class="btn btn-ghost" type="button" data-company-open="${esc(c.id)}">${icon('users')}<span>Şirket kaydı</span></button>
    </header>
    <div class="toolbar"><div class="seg-ctrl acc-tabs" role="tablist" aria-label="Hesap 360">${ACC_TABS.map(([id, label]) => `<button type="button" role="tab" data-acctab="${id}" aria-selected="${accTab === id}" class="${accTab === id ? 'is-active' : ''}">${label}${n[id] ? ` <span class="count muted-count">${n[id]}</span>` : ''}</button>`).join('')}</div></div>
    ${body}`;
}

function accSummary(c, cs, opps, acts, s) {
  const open = opps.filter(isOpen);
  const won = opps.filter((o) => o.stage === 'won');
  const t = today();
  const next = acts.filter((a) => a.status === 'open' && a.date >= t).sort((a, b) => a.date.localeCompare(b.date))[0];
  const last = acts.filter((a) => a.date <= t && a.status === 'done').sort((a, b) => b.date.localeCompare(a.date))[0];
  const late = acts.filter((a) => a.status === 'open' && a.date < t);
  const leads = s.leads.filter((l) => l.account === c.id);
  const rep = userById(c.salesRep);
  return `${c.blocked ? alertBox('danger', 'Müşteri bloke', esc(c.blockReason || '')) : ''}
    ${cs.key === 'over' ? alertBox('danger', 'Kredi limiti aşıldı', 'Yeni teklifler kredi onayına düşer; sipariş riski yüksek.') : cs.key === 'risk' ? alertBox('warning', 'Kredi limitine yakın', `Kullanım ${pct(cs.ratio * 100)}. Büyük fırsatlar için muhasebeyle önceden görüş.`) : ''}
    ${c.prospect ? alertBox('info', "Aday hesap: ERP'de tanımlı değil", "Teklif verilebilir; sipariş ERP'ye aktarılmadan önce Key User hesabı ERP'de açmalı (Şirket kaydı > ERP'de müşteri aç).") : ''}
    ${late.length ? alertBox('warning', `${late.length} gecikmiş aktivite`, esc(late.map((a) => a.subject).join(' · '))) : ''}
    <div class="kpis">
      <div class="kpi card"><span class="stat-label">Açık fırsat</span><span class="kpi-value">${open.length}</span><span class="cell-sub">${money(sum(open, (o) => o.amount))} · ağırlıklı ${money(sum(open, weighted))}</span></div>
      <div class="kpi card"><span class="stat-label">Kazanılan</span><span class="kpi-value ok">${money(sum(won, (o) => o.amount))}</span><span class="cell-sub">${won.length} fırsat</span></div>
      <div class="kpi card"><span class="stat-label">Açık bakiye</span><span class="kpi-value ${c.overdue > 0 ? 'neg' : ''}">${money(c.openBalance)}</span><span class="cell-sub">${c.creditLimit ? `limit ${money(c.creditLimit)} · ${pct(cs.ratio * 100)}` : 'kredi limiti yok'}</span></div>
      <div class="kpi card"><span class="stat-label">Sonraki aktivite</span><span class="kpi-value sm">${next ? date(next.date) : '—'}</span><span class="cell-sub">${next ? esc(next.subject) : 'Planlı aktivite yok'}</span></div>
    </div>
    <div class="acc-grid">
      <section class="card tl-sec">${kv([
        ['Bölge / şehir', `${esc(c.region || '—')} · ${esc(c.city || '')}`],
        ['Satış temsilcisi', esc(rep?.name || '—')],
        ['Ödeme koşulu', `<span class="code">${esc(c.paymentTerm)}</span> ${esc(termName(c.paymentTerm))}`],
        ['Müşteri tarihi', esc(c.customerSince || (c.prospect ? 'Aday' : '—'))],
        ['Son aktivite', last ? `${date(last.date)} · ${esc(last.subject)}` : '—'],
        ['Lead geçmişi', leads.length ? leads.map((l) => `<button class="link" type="button" data-lead="${esc(l.id)}">${esc(l.id)}</button> ${esc(LSTATUS[l.status].label)}`).join(' · ') : '—'],
      ])}</section>
      <section class="card tl-sec"><h3 class="card-title">Açık fırsatlar</h3>${open.length ? `<ul class="act-list">${open.map((o) => `<li><button class="act-row" type="button" data-opp="${esc(o.id)}"><span class="act-ico">${icon('tag')}</span><span class="act-text"><strong>${esc(o.name)}</strong><span class="cell-sub">${esc(stageOf(o.stage).label)} · ${money(o.amount)} · ${date(o.closeDate)}</span></span>${riskOf(o, s).length ? badge('Riskli', 'warning') : ''}</button></li>`).join('')}</ul>` : '<p class="cell-sub">Açık fırsat yok.</p>'}</section>
    </div>`;
}

function accContacts(c) {
  const canAdd = can('OPP_MANAGE') || can('LEAD_QUALIFY');
  return `<div class="card tl-sec">${c.contacts.length ? contactList(c.contacts) : '<p class="cell-sub">İlgili kişi yok.</p>'}</div>
    <section class="card tl-sec mt-sm">
      <h3 class="card-title">İlgili kişi ekle</h3>
      ${canAdd ? `<div class="form-grid" data-contact-form>
        <label class="field"><span class="field-label">Ad soyad <span class="req">*</span></span><input class="input" data-k="name" maxlength="60"></label>
        <label class="field"><span class="field-label">Görevi <span class="req">*</span></span><input class="input" data-k="role" maxlength="60"></label>
        <label class="field"><span class="field-label">Telefon</span><input class="input" data-k="phone" maxlength="20"></label>
        <label class="field"><span class="field-label">E-posta</span><input class="input" type="email" data-k="email" maxlength="80"></label>
      </div>
      <div class="drawer-actions"><button class="btn btn-primary" type="button" data-add-contact>${icon('user')}<span>Ekle</span></button></div>` : `<p class="lock-note">${icon('lock')}<span>${esc(lockReason('OPP_MANAGE'))}</span></p>`}
    </section>`;
}

function accOpps(c, opps) {
  return `<div class="toolbar"><span class="toolbar-count">${team() ? 'Ekibin fırsatları' : 'Sorumlusu olduğun fırsatlar'}</span><span class="c4c-spacer"></span>${actionBtn({ perm: 'OPP_MANAGE', label: 'Yeni fırsat', iconName: 'tag', attrs: `data-new-opp data-account="${esc(c.id)}"` })}</div>
    ${opps.length ? `<div class="card table-card"><div class="table-wrap"><table class="table tl-table c4c-table">
      <thead><tr><th>Fırsat</th><th>Aşama</th><th class="num">Tutar</th><th class="hide-sm">Kapanış</th></tr></thead>
      <tbody>${opps.map((o) => `<tr data-opp="${esc(o.id)}" tabindex="0"><td><span class="code">${esc(o.id)}</span> <strong>${esc(o.name)}</strong><div class="cell-sub">${esc(userName(o.owner))}</div></td><td>${badge(stageOf(o.stage).label, o.stage === 'won' ? 'success' : o.stage === 'lost' ? 'danger' : 'info')}</td><td class="num">${money(o.amount)}</td><td class="hide-sm">${date(o.closeDate)}</td></tr>`).join('')}</tbody>
    </table></div></div>` : `<div class="card">${emptyState('tag', 'Fırsat yok', 'Bu hesap için görebildiğin fırsat bulunmuyor.')}</div>`}`;
}

function accDocs(quotes, orders) {
  return `<section class="tl-sec"><h3 class="list-title">Teklifler</h3>${quotes.length ? `<div class="card table-card"><div class="table-wrap"><table class="table tl-table c4c-table">
      <thead><tr><th>Teklif</th><th class="hide-sm">Tarih</th><th class="num">Net</th><th>Durum</th></tr></thead>
      <tbody>${quotes.map((q) => `<tr data-quote="${esc(q.no)}" tabindex="0"><td><span class="code">${esc(q.no)}</span>${q.opportunity ? `<div class="cell-sub">Fırsat ${esc(q.opportunity)}</div>` : ''}</td><td class="hide-sm">${date(q.date)}</td><td class="num">${money(q.totals.net)}</td><td>${quoteBadge(q)}</td></tr>`).join('')}</tbody></table></div></div>` : '<p class="cell-sub">Görebildiğin teklif yok.</p>'}</section>
    <section class="tl-sec"><h3 class="list-title">Siparişler</h3>${orders.length ? `<div class="card table-card"><div class="table-wrap"><table class="table tl-table c4c-table">
      <thead><tr><th>Sipariş</th><th class="hide-sm">Teklif</th><th class="num">Net</th><th>Durum</th></tr></thead>
      <tbody>${orders.map((o) => `<tr data-order="${esc(o.no)}" tabindex="0"><td><span class="code">${esc(o.no)}</span></td><td class="hide-sm"><span class="code">${esc(o.quoteNo)}</span></td><td class="num">${money(o.totals.net)}</td><td><div class="badges tight">${orderBadges(o)}</div></td></tr>`).join('')}</tbody></table></div></div>` : '<p class="cell-sub">Görebildiğin sipariş yok.</p>'}</section>`;
}

function accBalance(c, cs) {
  const inv = erpInvoices().filter((i) => i.customer === c.id);
  const simTotal = sum(inv, (i) => i.gross);
  const carried = Math.round((c.openBalance - simTotal) * 100) / 100;
  const t = today();
  return `${alertBox('info', "Bu bilgiler ERP'den okunur", 'C4C açık bakiyeyi değiştirmez; faturalar ve tahsilat ERP\'de (FI-AR) yönetilir.')}
    <div class="kpis">
      <div class="kpi card"><span class="stat-label">Kredi limiti</span><span class="kpi-value">${money(c.creditLimit)}</span></div>
      <div class="kpi card"><span class="stat-label">Açık bakiye</span><span class="kpi-value">${money(c.openBalance)}</span>${c.creditLimit ? progressBar(Math.min(cs.ratio * 100, 100), `var(--tone-${cs.tone.replace('-solid', '')})`) : ''}</div>
      <div class="kpi card"><span class="stat-label">Kullanılabilir</span><span class="kpi-value ${c.creditLimit - c.openBalance < 0 ? 'neg' : ''}">${money(c.creditLimit - c.openBalance)}</span></div>
      <div class="kpi card"><span class="stat-label">Vadesi geçmiş</span><span class="kpi-value ${c.overdue > 0 ? 'neg' : 'ok'}">${money(c.overdue)}</span></div>
    </div>
    <div class="card table-card"><div class="table-wrap"><table class="table tl-table c4c-table">
      <thead><tr><th>Kalem</th><th class="hide-sm">Tarih</th><th>Vade</th><th class="num">Tutar</th></tr></thead>
      <tbody>
        <tr><td>Önceki dönem açık kalemleri<div class="cell-sub">ERP devreden bakiye${c.overdue > 0 ? ` · ${money(c.overdue)} vadesi geçmiş` : ''}</div></td><td class="hide-sm">${date(company().asOf)}</td><td>—</td><td class="num">${money(carried)}</td></tr>
        ${inv.map((i) => `<tr><td><button class="link" type="button" data-invoice="${esc(i.no)}"><span class="code">${esc(i.no)}</span></button><div class="cell-sub">Sipariş ${esc(i.orderNo)}</div></td><td class="hide-sm">${date(i.date)}</td><td><span class="${i.dueDate < t ? 'neg' : ''}">${date(i.dueDate)}</span></td><td class="num">${money(i.gross)}</td></tr>`).join('')}
      </tbody></table></div><div class="table-foot">Ödeme koşulu <span class="code">${esc(c.paymentTerm)}</span> ${esc(termName(c.paymentTerm))}</div></div>`;
}

function goAccount(id) {
  if (!partnerOf(id)) return;
  closeDrawer(true);
  tab = 'accounts';
  accountId = id;
  accTab = 'summary';
  refreshAll();
  rootRef?.scrollIntoView({ block: 'start', behavior: 'smooth' });
}

// ---------- aktiviteler ----------
function weekStart() {
  const t = today();
  const dow = (new Date(parseDay(t)).getUTCDay() + 6) % 7; // Pazartesi = 0
  return addDays(t, -dow + weekOffset * 7);
}

function activitiesView(s) {
  const t = today();
  const acts = visibleActs(s);
  const ws = weekStart();
  const days = [...Array(7)].map((_, i) => addDays(ws, i));
  const late = acts.filter((a) => a.status === 'open' && a.date < t).sort((a, b) => a.date.localeCompare(b.date));
  const range = `${new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long' }).format(new Date(parseDay(days[0])))} – ${date(days[6])}`;
  return `<div class="toolbar">
      <div class="seg-ctrl" aria-label="Hafta">
        <button type="button" data-week="-1" aria-label="Önceki hafta">${icon('back')}</button>
        <button type="button" data-week="0" class="${weekOffset === 0 ? 'is-active' : ''}">Bu hafta</button>
        <button type="button" data-week="1" aria-label="Sonraki hafta"><span class="flip">${icon('back')}</span></button>
      </div>
      <strong class="cal-range">${esc(range)}</strong>
      <span class="c4c-spacer"></span>
      ${actionBtn({ perm: 'OPP_MANAGE', label: 'Yeni aktivite', iconName: 'calendar', attrs: 'data-new-act' })}
    </div>
    ${late.length ? `<section class="card tl-sec late-box"><h3 class="card-title">${icon('alert')} Gecikmiş (${late.length})</h3>${actsList(late)}</section>` : ''}
    <div class="cal" role="list">${days
      .map((d) => {
        const items = acts.filter((a) => a.date === d).sort((a, b) => (a.time || '99').localeCompare(b.time || '99'));
        return `<section class="cal-day${d === t ? ' is-today' : ''}${d < t ? ' is-past' : ''}" role="listitem">
          <header>${esc(dayLabel(d))}${d === t ? ' · bugün' : ''}</header>
          ${items.map((a) => `<button type="button" class="cal-item t-${a.type}${a.status === 'done' ? ' is-done' : ''}${a.status === 'open' && a.date < t ? ' is-late' : ''}" data-actid="${esc(a.id)}">
            <span class="cal-time">${icon(ACT_TYPE[a.type].icon)}${esc(a.time || ACT_TYPE[a.type].label)}</span>
            <strong>${esc(a.subject)}</strong>
            <span class="cell-sub">${esc(accName(a.account))}${team() ? ` · ${esc(userName(a.owner))}` : ''}</span>
          </button>`).join('') || '<p class="cal-empty">—</p>'}
        </section>`;
      })
      .join('')}</div>`;
}

function openAct(id) {
  const s = state();
  const a = s.acts.find((x) => x.id === id);
  if (!a) return;
  const late = a.status === 'open' && a.date < today();
  const mine = a.owner === me()?.id || team();
  const opp = a.opportunity ? s.opps.find((o) => o.id === a.opportunity) : null;
  const html =
    drawerHead(`${ACT_TYPE[a.type].label} · ${a.id}`, a.subject, (late ? badge('Gecikmiş', 'danger') : a.status === 'done' ? badge('Tamamlandı', 'success') : badge('Planlandı', 'neutral')) + badge(ACT_TYPE[a.type].label, 'neutral')) +
    `<div class="drawer-body">
      ${dsec('Ayrıntılar', kv([
        ['Tarih', `${date(a.date)}${a.time ? ` · ${esc(a.time)}` : ''}`],
        ['Hesap', `<button class="link" type="button" data-act="account" data-id="${esc(a.account)}">${esc(accName(a.account))}</button>`],
        ['Fırsat', opp ? `<button class="link" type="button" data-act="opp" data-id="${esc(opp.id)}">${esc(opp.id)} ${esc(opp.name)}</button>` : '—'],
        ['Sorumlu', esc(userName(a.owner))],
        a.note ? ['Not', esc(a.note)] : null,
      ]))}
      <div class="drawer-actions">
        ${a.status === 'open' ? actionBtn({ perm: 'OPP_MANAGE', label: 'Tamamlandı', iconName: 'check', attrs: 'data-act="done"', reason: can('OPP_MANAGE') && !mine ? 'Yalnızca sorumlu kişi veya müdür tamamlayabilir.' : null }) : actionBtn({ perm: 'OPP_MANAGE', label: 'Yeniden aç', iconName: 'clock', cls: 'btn-ghost', attrs: 'data-act="reopen"', reason: can('OPP_MANAGE') && !mine ? 'Yalnızca sorumlu kişi veya müdür değiştirebilir.' : null })}
      </div>
    </div>`;
  openDrawer(html, (el) => {
    if (el.dataset.act === 'account') return goAccount(el.dataset.id);
    if (el.dataset.act === 'opp') return openOpp(el.dataset.id);
    if ((el.dataset.act === 'done' || el.dataset.act === 'reopen') && can('OPP_MANAGE') && mine) {
      const s2 = state();
      const x = s2.acts.find((y) => y.id === id);
      x.status = el.dataset.act === 'done' ? 'done' : 'open';
      x.doneAt = x.status === 'done' ? nowIso() : undefined;
      write(s2);
      toast(`${x.subject}: ${x.status === 'done' ? 'tamamlandı' : 'yeniden açıldı'}`);
      openAct(id);
      refreshAll();
    }
  });
}

function openActForm(_, prefill = {}) {
  if (!can('OPP_MANAGE')) return toast(lockReason('OPP_MANAGE'));
  const s = state();
  const D = company();
  const accounts = [...D.customers, ...(D.prospects || [])];
  const owners = holders('OPP_MANAGE');
  const oppOpts = (acc, sel) => `<option value="">—</option>${visibleOpps(s).filter((o) => o.account === acc).map((o) => `<option value="${esc(o.id)}" ${o.id === sel ? 'selected' : ''}>${esc(o.id)} · ${esc(o.name)}</option>`).join('')}`;
  const html =
    drawerHead('Yeni aktivite', 'Ziyaret, telefon veya görev') +
    `<div class="drawer-body iam-form" data-actform>
      <div class="seg-ctrl act-type" role="radiogroup" aria-label="Aktivite türü">${Object.entries(ACT_TYPE).map(([k, v], i) => `<label class="${(prefill.type || 'task') === k ? 'is-active' : ''}"><input type="radio" name="atype" value="${k}" ${(prefill.type || 'task') === k ? 'checked' : ''}>${icon(v.icon)}<span>${v.label}</span></label>`).join('')}</div>
      <div class="form-grid">
        <label class="field span-2"><span class="field-label">Konu <span class="req">*</span></span><input class="input" data-a="subject" maxlength="100" value="${esc(prefill.subject || '')}"></label>
        <label class="field span-2"><span class="field-label">Hesap <span class="req">*</span></span><select class="select" data-a="account"><option value="">Hesap seç…</option>${accounts.map((a) => `<option value="${esc(a.id)}" ${a.id === prefill.account ? 'selected' : ''}>${esc(a.id)} · ${esc(a.name)}</option>`).join('')}</select></label>
        <label class="field span-2"><span class="field-label">Fırsat</span><select class="select" data-a="opportunity">${oppOpts(prefill.account, prefill.opportunity)}</select></label>
        <label class="field"><span class="field-label">Tarih <span class="req">*</span></span><input class="input" type="date" data-a="date" value="${esc(prefill.date || today())}"></label>
        <label class="field"><span class="field-label">Saat</span><input class="input" type="time" data-a="time" value="${esc(prefill.time || '')}"></label>
        ${team() ? `<label class="field span-2"><span class="field-label">Sorumlu</span><select class="select" data-a="owner">${owners.map((u) => `<option value="${esc(u.id)}" ${u.id === me().id ? 'selected' : ''}>${esc(u.name)}</option>`).join('')}</select></label>` : ''}
        <label class="field span-2"><span class="field-label">Not</span><textarea class="input textarea" rows="2" data-a="note"></textarea></label>
      </div>
      <div class="drawer-actions"><button class="btn btn-primary" type="button" data-act="act-save">${icon('check')}<span>Aktiviteyi oluştur</span></button><button class="btn btn-ghost" type="button" data-close>Vazgeç</button></div>
    </div>`;
  openDrawer(html, (el) => {
    if (el.dataset.act !== 'act-save') return;
    const f = el.closest('[data-actform]');
    const v = (k) => f.querySelector(`[data-a="${k}"]`)?.value.trim() || '';
    const r = createActivity({ type: f.querySelector('input[name="atype"]:checked').value, subject: v('subject'), account: v('account'), opportunity: v('opportunity'), date: v('date'), time: v('time'), owner: v('owner'), note: v('note') });
    if (r.error) return toast(r.error);
    closeDrawer();
    toast(`${r.activity.id} oluşturuldu · ${date(r.activity.date)}`);
    if (tab === 'activities') {
      const ws = weekStart();
      if (r.activity.date < ws || r.activity.date > addDays(ws, 6)) weekOffset += Math.floor(dayDiff(r.activity.date, ws) / 7);
    }
    refreshAll();
  });
  const f = document.querySelector('.drawer-root [data-actform]');
  f?.addEventListener('change', (e) => {
    if (e.target.dataset.a === 'account') f.querySelector('[data-a="opportunity"]').innerHTML = oppOpts(e.target.value, '');
    if (e.target.name === 'atype') f.querySelectorAll('.act-type label').forEach((l) => l.classList.toggle('is-active', l.querySelector('input').checked));
  });
}

export function createActivity(v) {
  if (!can('OPP_MANAGE')) return { error: lockReason('OPP_MANAGE') };
  if (!v.subject || !v.account || !v.date) return { error: 'Konu, hesap ve tarih zorunlu' };
  const s = state();
  const ownerOk = team() && holders('OPP_MANAGE').some((u) => u.id === v.owner);
  const a = { id: nextId(s, 'act', 'ACT'), type: ACT_TYPE[v.type] ? v.type : 'task', subject: v.subject, account: v.account, opportunity: v.opportunity || null, owner: ownerOk ? v.owner : me().id, date: v.date, time: v.time || '', status: 'open', note: v.note || '', createdBy: me().id, createdAt: nowIso() };
  s.acts.push(a);
  write(s);
  return { activity: a };
}

// ---------- kampanyalar ----------
const allAccounts = () => [...company().customers, ...(company().prospects || [])];
export function targetGroup(c) {
  return allAccounts().filter((a) => (!c.segments?.length || c.segments.includes(a.segment)) && (!c.regions?.length || c.regions.includes(a.region)) && (!c.channels?.length || c.channels.includes(a.channel)));
}

function campPerf(c, s) {
  const leads = s.leads.filter((l) => l.campaign === c.id);
  const opps = s.opps.filter((o) => o.campaign === c.id);
  const won = opps.filter((o) => o.stage === 'won');
  const wonAmt = sum(won, (o) => o.amount);
  return {
    leads: leads.length, converted: leads.filter((l) => l.status === 'converted').length, rejected: leads.filter((l) => l.status === 'rejected').length,
    opps: opps.length, won: won.length, wonAmt, pipeline: sum(opps.filter(isOpen), weighted), cpl: leads.length ? c.budget / leads.length : null, roi: c.budget ? wonAmt / c.budget : null,
  };
}

function funnelHtml(p) {
  const max = Math.max(1, p.leads);
  const step = (label, n, sub = '') => `<li><span class="fn-bar" style="--w:${Math.max(6, Math.round((n / max) * 100))}%"></span><span class="fn-label">${label}</span><strong>${n}</strong>${sub ? `<span class="cell-sub">${sub}</span>` : ''}</li>`;
  return `<ol class="funnel">${step('Lead', p.leads)}${step('Fırsat', p.opps)}${step('Kazanılan', p.won, money(p.wonAmt))}</ol>`;
}

function marketingBox() {
  if (holders('CAMPAIGN_MANAGE').length) return '';
  const r = roleById('marketing');
  return `<div class="role-banner tl-warn">${icon('user')}<span><strong>${esc(r?.name || 'Pazarlama Uzmanı')} rolünde kullanıcı yok.</strong> Kampanya oluşturacak (CAMPAIGN_MANAGE) kimse olmadığı için yeni kampanya açılamaz. Kullanıcı Yönetimi'nden oluştur${can('USER_ADMIN') ? '' : ' (USER_ADMIN gerekir: Key User rolüne geç)'}.</span>
    <a class="btn btn-primary" href="#/users?new=marketing">${icon('users')}<span>Kullanıcı Yönetimi'nden oluştur</span></a></div>`;
}

function campaignsView(s) {
  return `${marketingBox()}
    <div class="toolbar"><span class="toolbar-count">${s.camps.length} kampanya · performans: lead → fırsat → kazanılan tutar</span><span class="c4c-spacer"></span>${actionBtn({ perm: 'CAMPAIGN_MANAGE', label: 'Yeni kampanya', iconName: 'send', attrs: 'data-new-camp' })}</div>
    <div class="case-grid">${s.camps
      .slice()
      .reverse()
      .map((c) => {
        const p = campPerf(c, s);
        return `<article class="card case-card camp-card" data-camp="${esc(c.id)}" tabindex="0">
          <header><span class="code">${esc(c.id)}</span>${badge(CSTATUS[c.status].label, CSTATUS[c.status].tone)}${badge(c.type, 'neutral')}</header>
          <h3>${esc(c.name)}</h3>
          <p class="cell-sub">${date(c.start)} – ${date(c.end)} · bütçe ${money(c.budget)}</p>
          <div class="chips">${targetChips(c)}</div>
          ${funnelHtml(p)}
          <p class="cell-sub">${p.roi == null ? '' : `Getiri: kazanılan / bütçe = <strong>${p.roi.toFixed(1).replace('.', ',')}×</strong>`}${p.cpl ? ` · lead başı maliyet ${money(Math.round(p.cpl))}` : ''}</p>
        </article>`;
      })
      .join('') || ''}</div>
    ${s.camps.length ? '' : `<div class="card">${emptyState('send', 'Kampanya yok', 'Pazarlama Uzmanı ilk kampanyayı oluşturabilir.')}</div>`}`;
}

const targetChips = (c) =>
  [...(c.segments?.length ? c.segments.map((x) => `Segment ${x}`) : ['Tüm segmentler']), ...(c.regions?.length ? c.regions : ['Tüm bölgeler']), ...(c.channels?.length ? c.channels.map(channelName) : ['Tüm kanallar'])]
    .map((x) => `<span class="chip static">${esc(x)}</span>`)
    .join('');

function targetTable(list) {
  if (!list.length) return '<p class="cell-sub">Filtreye uyan hesap yok.</p>';
  return `<ul class="tg-list">${list.map((a) => `<li class="${a.blocked ? 'is-blocked' : ''}"><span><strong>${esc(a.name)}</strong><span class="cell-sub">${esc(a.id)} · ${esc(a.region)} · ${esc(channelName(a.channel))}</span></span>${segBadge(a.segment)}${a.blocked ? badge('Bloke · lead üretilmez', 'danger') : a.prospect ? badge('Aday', 'info') : ''}</li>`).join('')}</ul>`;
}

function openCamp(id) {
  const s = state();
  const c = s.camps.find((x) => x.id === id);
  if (!c) return;
  const p = campPerf(c, s);
  const tg = targetGroup(c);
  const leads = s.leads.filter((l) => l.campaign === c.id);
  const generated = leads.some((l) => l.generated);
  const html =
    drawerHead(`Kampanya · ${c.id}`, c.name, badge(CSTATUS[c.status].label, CSTATUS[c.status].tone) + badge(c.type, 'neutral')) +
    `<div class="drawer-body">
      ${c.description ? `<p class="cell-sub">${esc(c.description)}</p>` : ''}
      ${dsec('Performans', `${funnelHtml(p)}${kv([
        ['Bütçe', money(c.budget)],
        ['Lead', `${p.leads} · ${p.converted} dönüştürüldü · ${p.rejected} reddedildi`],
        ['Açık fırsat (ağırlıklı)', money(p.pipeline)],
        ['Kazanılan tutar', `<strong>${money(p.wonAmt)}</strong>`],
        ['Lead başı maliyet', p.cpl ? money(Math.round(p.cpl)) : '—'],
        ['Getiri (kazanılan / bütçe)', p.roi == null ? '—' : `${p.roi.toFixed(2).replace('.', ',')}×`],
      ])}`)}
      ${dsec(`Hedef grup · ${tg.length} hesap`, `<div class="chips">${targetChips(c)}</div>${targetTable(tg)}`)}
      <div class="drawer-actions">
        ${c.status !== 'completed' ? actionBtn({ perm: 'CAMPAIGN_MANAGE', label: 'Lead üret', iconName: 'target', attrs: 'data-act="gen"', reason: can('CAMPAIGN_MANAGE') && !tg.some((a) => !a.blocked) ? 'Hedef grupta lead üretilebilecek hesap yok.' : null }) : ''}
        ${c.status !== 'completed' ? actionBtn({ perm: 'CAMPAIGN_MANAGE', label: 'Kampanyayı tamamla', iconName: 'check', cls: 'btn-ghost', attrs: 'data-act="complete"' }) : ''}
      </div>
      ${generated ? '<p class="cell-sub">Bu kampanyadan daha önce lead üretildi; tekrar üretmek yalnızca yeni hedef hesaplar için lead açar.</p>' : ''}
      ${dsec(`Leadler (${leads.length})`, leads.length ? `<ul class="act-list">${leads.map((l) => `<li><button class="act-row" type="button" data-act="lead" data-id="${esc(l.id)}"><span class="act-ico">${icon('target')}</span><span class="act-text"><strong>${esc(l.company)}</strong><span class="cell-sub">${esc(l.id)} · BANT ${bantCount(l)}/4</span></span>${badge(LSTATUS[l.status].label, LSTATUS[l.status].tone)}</button></li>`).join('')}</ul>` : '<p class="cell-sub">Henüz lead yok.</p>')}
    </div>`;
  openDrawer(html, (el) => {
    const act = el.dataset.act;
    if (act === 'lead') return openLead(el.dataset.id);
    if (act === 'gen') {
      const r = generateLeads(id);
      if (r.error) return toast(r.error);
      toast(`${r.created.length} lead üretildi${r.skippedBlocked ? ` · ${r.skippedBlocked} bloke hesap atlandı` : ''}${r.skippedExisting ? ` · ${r.skippedExisting} hesapta zaten lead var` : ''}`);
      openCamp(id);
      refreshAll();
    }
    if (act === 'complete' && can('CAMPAIGN_MANAGE')) {
      const s2 = state();
      s2.camps.find((x) => x.id === id).status = 'completed';
      write(s2);
      toast(`${c.name} tamamlandı`);
      openCamp(id);
      refreshAll();
    }
  });
}

export function generateLeads(id) {
  if (!can('CAMPAIGN_MANAGE')) return { error: lockReason('CAMPAIGN_MANAGE') };
  const s = state();
  const c = s.camps.find((x) => x.id === id);
  if (!c || c.status === 'completed') return { error: 'Tamamlanan kampanyadan lead üretilemez' };
  const tg = targetGroup(c);
  const created = [];
  let skippedBlocked = 0;
  let skippedExisting = 0;
  const reps = holders('LEAD_QUALIFY').filter((u) => holders('OPP_MANAGE').some((x) => x.id === u.id));
  for (const a of tg) {
    if (a.blocked) {
      skippedBlocked++;
      continue;
    }
    if (s.leads.some((l) => l.campaign === c.id && l.account === a.id)) {
      skippedExisting++;
      continue;
    }
    const contact = a.contacts?.[0] || { name: '', role: '' };
    const l = {
      id: nextId(s, 'lead', 'LEAD'), company: a.name, account: a.id, contact: { name: contact.name, role: contact.role, phone: contact.phone || '', email: contact.email || '' },
      source: 'Kampanya', campaign: c.id, score: a.segment === 'A' ? 'hot' : a.segment === 'B' ? 'warm' : 'cold', region: a.region, segment: a.segment, channel: a.channel,
      value: a.segment === 'A' ? 25000 : a.segment === 'B' ? 15000 : 8000, bant: { budget: false, authority: false, need: false, timeline: false }, status: 'open',
      owner: reps.some((u) => u.id === a.salesRep) ? a.salesRep : reps[0]?.id || me().id, note: `${c.name} hedef grubundan üretildi.`, generated: true, createdAt: nowIso(), createdBy: me().id,
    };
    s.leads.push(l);
    created.push(l);
  }
  if (c.status === 'planned' && created.length) c.status = 'active';
  write(s);
  return { created, skippedBlocked, skippedExisting };
}

function openCampForm() {
  if (!can('CAMPAIGN_MANAGE')) return toast(lockReason('CAMPAIGN_MANAGE'));
  const D = company();
  const regions = [...new Set(allAccounts().map((a) => a.region).filter(Boolean))];
  const cb = (name, value, label) => `<label class="chip-check"><input type="checkbox" data-cf="${name}" value="${esc(value)}"><span>${esc(label)}</span></label>`;
  const html =
    drawerHead('Yeni kampanya', 'Kampanya oluştur') +
    `<div class="drawer-body iam-form" data-campform>
      <div class="form-grid">
        <label class="field span-2"><span class="field-label">Kampanya adı <span class="req">*</span></span><input class="input" data-cv="name" maxlength="80" placeholder="Ör. Kurumsal Kış Kampanyası"></label>
        <label class="field"><span class="field-label">Tür</span><select class="select" data-cv="type">${cfg().campaignTypes.map((x) => `<option>${esc(x)}</option>`).join('')}</select></label>
        <label class="field"><span class="field-label">Bütçe (₺) <span class="req">*</span></span><input class="input" type="number" min="0" step="1000" data-cv="budget"></label>
        <label class="field"><span class="field-label">Başlangıç <span class="req">*</span></span><input class="input" type="date" data-cv="start" value="${esc(addDays(today(), 1))}"></label>
        <label class="field"><span class="field-label">Bitiş <span class="req">*</span></span><input class="input" type="date" data-cv="end" value="${esc(addDays(today(), 42))}"></label>
        <label class="field span-2"><span class="field-label">Açıklama</span><textarea class="input textarea" rows="2" data-cv="description"></textarea></label>
      </div>
      <fieldset class="tg-filter"><legend class="field-label">Hedef segment</legend><div class="chips">${['A', 'B', 'C'].map((x) => cb('segments', x, `Segment ${x}`)).join('')}</div></fieldset>
      <fieldset class="tg-filter"><legend class="field-label">Bölge</legend><div class="chips">${regions.map((x) => cb('regions', x, x)).join('')}</div></fieldset>
      <fieldset class="tg-filter"><legend class="field-label">Kanal</legend><div class="chips">${D.organization.distributionChannels.map((x) => cb('channels', x.code, x.name)).join('')}</div></fieldset>
      <div class="dsec"><h3>Hedef grup önizlemesi</h3><div data-tg-preview></div></div>
      <div class="drawer-actions"><button class="btn btn-primary" type="button" data-act="camp-save">${icon('check')}<span>Kampanyayı oluştur</span></button><button class="btn btn-ghost" type="button" data-close>Vazgeç</button></div>
    </div>`;
  openDrawer(html, (el) => {
    if (el.dataset.act !== 'camp-save') return;
    const r = createCampaign(readCampForm(el.closest('[data-campform]')));
    if (r.error) return toast(r.error);
    toast(`${r.campaign.id} oluşturuldu · hedef grup ${targetGroup(r.campaign).length} hesap`);
    openCamp(r.campaign.id);
    refreshAll();
  });
  const f = document.querySelector('.drawer-root [data-campform]');
  const preview = () => {
    const v = readCampForm(f);
    const tg = targetGroup(v);
    const none = !v.segments.length && !v.regions.length && !v.channels.length;
    f.querySelector('[data-tg-preview]').innerHTML = `<p class="${none ? 'neg' : 'cell-sub'}">${none ? 'Filtre seçilmedi: hedef grup tüm hesapları kapsar.' : `${tg.length} hesap · ${tg.filter((a) => a.blocked).length} bloke`}</p>${targetTable(tg)}`;
  };
  f?.addEventListener('change', preview);
  if (f) preview();
}

function readCampForm(f) {
  const v = (k) => f.querySelector(`[data-cv="${k}"]`)?.value.trim() || '';
  const checked = (k) => [...f.querySelectorAll(`[data-cf="${k}"]:checked`)].map((x) => x.value);
  return { name: v('name'), type: v('type'), budget: Number(v('budget')), start: v('start'), end: v('end'), description: v('description'), segments: checked('segments'), regions: checked('regions'), channels: checked('channels') };
}

export function createCampaign(v) {
  if (!can('CAMPAIGN_MANAGE')) return { error: lockReason('CAMPAIGN_MANAGE') };
  if (!v.name) return { error: 'Kampanya adı zorunlu' };
  if (!(v.budget > 0)) return { error: 'Bütçe sıfırdan büyük olmalı' };
  if (!v.start || !v.end || v.end < v.start) return { error: 'Başlangıç ve bitiş tarihini kontrol et' };
  if (!targetGroup(v).length) return { error: 'Hedef grup boş: filtreleri genişlet' };
  const s = state();
  const t = today();
  const c = { id: nextId(s, 'camp', 'CMP'), ...v, status: v.start > t ? 'planned' : v.end < t ? 'completed' : 'active', createdBy: me().id, createdAt: nowIso() };
  s.camps.push(c);
  write(s);
  return { campaign: c };
}

// ---------- sıfırlama ----------
// Merkezi sıfırlamayı çağırır (tüm modüllerin işlem verisi tutarlı biçimde başlangıca döner)
function resetDemo() {
  accountId = null;
  resetAllDemo();
  toast('Tüm modüllerin demo verisi başlangıç haline döndü');
}

// ---------- olaylar ----------
function bindRoot(root) {
  root.addEventListener('click', (e) => {
    const q = (sel) => e.target.closest(sel);
    let el;
    if ((el = q('[data-tab]'))) {
      tab = el.dataset.tab;
      if (tab !== 'accounts') accountId = null;
      return refreshAll();
    }
    if (q('[data-reset-demo]')) {
      const b = q('[data-reset-demo]');
      if (!b.classList.contains('confirm')) {
        b.classList.add('confirm');
        b.textContent = 'Emin misin? Tüm modüllerin işlem verisi (belgeler, stok, bakiye, onaylar, defect kayıtları) sıfırlanır · tekrar dokun';
        return;
      }
      return resetDemo();
    }
    if ((el = q('[data-pview]'))) {
      pipeView = el.dataset.pview;
      return drawBody();
    }
    if (q('[data-new-opp]')) return newOpp(q('[data-new-opp]').dataset.account ? { account: q('[data-new-opp]').dataset.account } : {});
    if (q('[data-new-lead]')) return openLeadForm();
    if (q('[data-new-act]')) return openActForm(null, q('[data-new-act]').dataset.account ? { account: q('[data-new-act]').dataset.account } : {});
    if (q('[data-new-camp]')) return openCampForm();
    if ((el = q('[data-lfilter]'))) {
      leadFilter = el.dataset.lfilter;
      return drawBody();
    }
    if ((el = q('[data-week]'))) {
      const d = Number(el.dataset.week);
      weekOffset = d === 0 ? 0 : weekOffset + d;
      return drawBody();
    }
    if (q('[data-acc-back]')) {
      accountId = null;
      return drawBody();
    }
    if ((el = q('[data-acctab]'))) {
      accTab = el.dataset.acctab;
      return drawBody();
    }
    if ((el = q('[data-company-open]'))) return openDetail('customer', el.dataset.companyOpen);
    if (q('[data-add-contact]')) return addContact(root);
    if (e.target.closest('select')) return;
    if ((el = q('[data-opp]'))) return openOpp(el.dataset.opp);
    if ((el = q('[data-lead]'))) return openLead(el.dataset.lead);
    if ((el = q('[data-account]'))) {
      accountId = el.dataset.account;
      accTab = 'summary';
      return drawBody();
    }
    if ((el = q('[data-actid]'))) return openAct(el.dataset.actid);
    if ((el = q('[data-camp]'))) return openCamp(el.dataset.camp);
    if ((el = q('[data-quote]'))) return openQuote(el.dataset.quote);
    if ((el = q('[data-order]'))) return openDoc('order', el.dataset.order);
    if ((el = q('[data-invoice]'))) return openDoc('invoice', el.dataset.invoice);
  });
  root.addEventListener('change', (e) => {
    const t = e.target;
    if (t.matches('[data-owner]')) {
      ownerFilter = t.value;
      return drawBody();
    }
    if (t.matches('[data-move]') && t.value) moveStage(t.dataset.move, t.value);
  });
  root.addEventListener('input', (e) => {
    if (!e.target.matches('[data-accq]')) return;
    accQuery = e.target.value;
    const pos = e.target.selectionStart;
    drawBody();
    const inp = root.querySelector('[data-accq]');
    inp?.focus();
    inp?.setSelectionRange(pos, pos);
  });
  root.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const r = e.target.closest('[data-opp],[data-lead],[data-account],[data-camp],[data-quote],[data-order]');
    if (!r || r.matches('button') || e.target.matches('select,input,textarea')) return;
    e.preventDefault();
    r.click();
  });
  // Masaüstünde sürükle-bırak
  root.addEventListener('dragstart', (e) => {
    const card = e.target.closest?.('.kb-card[draggable="true"]');
    if (!card) return;
    e.dataTransfer.setData('text/plain', card.dataset.opp);
    e.dataTransfer.effectAllowed = 'move';
    card.classList.add('is-dragging');
  });
  root.addEventListener('dragend', (e) => {
    e.target.closest?.('.kb-card')?.classList.remove('is-dragging');
    root.querySelectorAll('.kb-col.is-over').forEach((c) => c.classList.remove('is-over'));
  });
  root.addEventListener('dragover', (e) => {
    const col = e.target.closest?.('.kb-col');
    if (!col) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    root.querySelectorAll('.kb-col.is-over').forEach((c) => c !== col && c.classList.remove('is-over'));
    col.classList.add('is-over');
  });
  root.addEventListener('drop', (e) => {
    const col = e.target.closest?.('.kb-col');
    if (!col) return;
    e.preventDefault();
    col.classList.remove('is-over');
    const id = e.dataTransfer.getData('text/plain');
    if (id) moveStage(id, col.dataset.col);
  });
}

function addContact(root) {
  const f = root.querySelector('[data-contact-form]');
  const v = (k) => f.querySelector(`[data-k="${k}"]`).value.trim();
  if (!v('name') || !v('role')) return toast('Ad soyad ve görev zorunlu');
  const c = partnerOf(accountId);
  if (c.contacts.some((k) => norm(k.name) === norm(v('name')))) return toast('Bu kişi hesapta zaten kayıtlı');
  updateCustomer(c.id, { contacts: [...c.contacts, { name: v('name'), role: v('role'), phone: v('phone'), email: v('email') }] }, { silent: true });
  toast(`${v('name')} ${c.name} hesabına eklendi`);
  drawBody();
}

// Testler için
export const _test = {
  setCtx: (c) => (ctx = c), state, read, sync, riskOf, moveStage, validateOpp, weighted, campPerf, weekStart, targetGroup,
  openOpp, openLead, openCamp, openAct,
  renderTab(t, o = {}) {
    tab = t;
    pipeView = o.view || 'board';
    accountId = o.account || null;
    accTab = o.accTab || 'summary';
    const s = state();
    const views = { leads: leadsView, activities: activitiesView, campaigns: campaignsView, accounts: (x) => (accountId ? account360(x) : accountsView(x)), pipeline: (x) => (pipeView === 'forecast' ? forecastView(x) : boardView(x)) };
    return headHtml() + views[t](s);
  },
};
