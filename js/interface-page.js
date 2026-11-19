// Aktarım Monitörü (#/interface): CRM → ERP mesajları
import { icon } from './icons.js';
import { esc, money2 as money, datetime, badge, emptyState, toast } from './ui.js';
import { loadCompany, resetMasterData } from './company.js';
import { loadRoles, can } from './auth.js';
import { messages, getOrder, MSG_STATUS, openDoc, processPending, resetErp } from './erp.js';

let filter = 'all';

export async function viewInterface(setView) {
  await Promise.all([loadRoles(), loadCompany()]);
  processPending();
  const all = messages();
  const count = (s) => all.filter((m) => m.status === s).length;
  const list = filter === 'all' ? all : all.filter((m) => m.status === filter);

  const rows = list
    .map((m) => {
      const o = getOrder(m.orderNo);
      const s = MSG_STATUS[m.status];
      return `<tr data-msg="${esc(m.no)}" tabindex="0" class="msg-${m.status}">
        <td><span class="code">${esc(m.no)}</span></td>
        <td class="hide-sm"><span class="cell-main">${esc(m.type)}</span><span class="cell-sub">${esc(m.direction)}</span></td>
        <td><span class="cell-main">Sipariş ${esc(m.orderNo)}</span><span class="cell-sub">${esc(o?.customerName || '')}</span></td>
        <td class="hide-md">${datetime(m.attempts.at(-1)?.at || m.createdAt)}</td>
        <td class="hide-md num">${m.attempts.length}</td>
        <td>${m.status === 'pending' ? `<span class="badge badge-neutral"><span class="spin" aria-hidden="true"></span>${esc(s.label)}</span>` : badge(s.label, s.tone)}
          ${m.status === 'error' ? `<span class="cell-sub err-line">${esc(m.error.split('\n')[0])}</span>` : ''}</td>
      </tr>`;
    })
    .join('');

  const tab = (id, label, n) => `<button type="button" role="tab" data-filter="${id}" aria-selected="${filter === id}" class="${filter === id ? 'is-active' : ''}">${label}${n ? ` <span class="count${id === 'error' ? ' danger-count' : ' muted-count'}">${n}</span>` : ''}</button>`;

  setView(
    `<div data-iface>
      <header class="page-head">
        <div>
          <p class="eyebrow">Entegrasyon</p>
          <h1>Aktarım Monitörü</h1>
          <p class="lead">CRM'de kaydedilen siparişler ERP'ye (S/4HANA) mesaj olarak gider. Hatalı mesajı key user ana veriyi düzelttikten sonra yeniden işler.</p>
        </div>
        <div class="iface-stats">
          <div class="kpi card"><span class="stat-label">Bekliyor</span><span class="kpi-value">${count('pending')}</span></div>
          <div class="kpi card"><span class="stat-label">Başarılı</span><span class="kpi-value ok">${count('success')}</span></div>
          <div class="kpi card"><span class="stat-label">Hatalı</span><span class="kpi-value ${count('error') ? 'neg' : ''}">${count('error')}</span></div>
        </div>
      </header>
      <div class="toolbar">
        <div class="seg-ctrl" role="tablist" aria-label="Durum filtresi">
          ${tab('all', 'Tümü', all.length)}${tab('error', 'Hatalı', count('error'))}${tab('pending', 'Bekliyor', count('pending'))}${tab('success', 'Başarılı', count('success'))}
        </div>
        <span class="toolbar-count">${can('INTERFACE_REPROCESS') ? `${icon('check')} Yeniden işleme yetkin var` : `${icon('lock')} Yeniden işleme: Key User`}</span>
      </div>
      ${
        list.length
          ? `<div class="card table-card"><div class="table-wrap"><table class="table">
              <thead><tr><th>Mesaj no</th><th class="hide-sm">Tür / yön</th><th>İçerik</th><th class="hide-md">Son işlem</th><th class="hide-md num">Deneme</th><th>Durum</th></tr></thead>
              <tbody>${rows}</tbody></table></div>
              <div class="table-foot"><strong>${list.length}</strong> mesaj · satıra tıklayınca JSON içeriği, hata metni ve yeniden işleme açılır</div></div>`
          : `<div class="card">${emptyState('link', filter === 'all' ? 'Henüz aktarım mesajı yok' : 'Bu durumda mesaj yok', 'Onaylanmış bir teklifi siparişe dönüştürdüğünde mesaj burada görünür.')}</div>`
      }
      <div class="iface-foot">
        <button class="btn btn-ghost" type="button" data-reset-erp>${icon('close')}<span>Tüm sipariş/ERP belgelerini sıfırla</span></button>
        <span class="cell-sub">Siparişler, mesajlar, teslimatlar, faturalar, stok/bakiye etkileri ve ana veri değişiklikleri (ör. ERP'de açılan müşteri) geri alınır; teklifler korunur.</span>
      </div>
    </div>`,
    'Aktarım Monitörü'
  );

  const root = document.querySelector('[data-iface]');
  root.addEventListener('click', (e) => {
    const f = e.target.closest('[data-filter]');
    if (f) {
      filter = f.dataset.filter;
      return viewInterface(setView);
    }
    const r = e.target.closest('tr[data-msg]');
    if (r) return openDoc('message', r.dataset.msg);
    const reset = e.target.closest('[data-reset-erp]');
    if (reset) {
      if (!reset.classList.contains('confirm')) {
        reset.classList.add('confirm', 'danger');
        reset.querySelector('span').textContent = 'Emin misin? Tekrar dokun';
        return;
      }
      resetErp();
      resetMasterData();
      toast('Sipariş ve ERP belgeleri sıfırlandı');
    }
  });
  root.addEventListener('keydown', (e) => {
    const r = e.target.closest('tr[data-msg]');
    if (r && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      openDoc('message', r.dataset.msg);
    }
  });
}
