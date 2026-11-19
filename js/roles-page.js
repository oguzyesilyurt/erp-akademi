// Yetki Matrisi (#/roles): rol × yetki tablosu, salt okunur + görevler ayrılığı açıklaması
import { icon } from './icons.js';
import { esc, badge, emptyState } from './ui.js';
import { loadRoles, rolesData, currentRole, userById, initials, openLogin } from './auth.js';

export async function viewRoles(setView) {
  try {
    await loadRoles();
  } catch (e) {
    console.error(e);
    setView(`<section class="panel card">${emptyState('lock', 'Rol verisi yüklenemedi', 'Bağlantını kontrol edip sayfayı yenile.')}</section>`, 'Yetki Matrisi');
    return;
  }
  const R = rolesData();
  const me = currentRole();

  const head = R.roles
    .map((r) => {
      const u = userById(r.users[0]);
      return `<th class="role-col${r.id === me?.id ? ' is-me' : ''}" scope="col">
        <span class="role-head"><span class="avatar">${esc(initials(u?.name))}</span><span><span class="cell-main">${esc(r.name)}</span><span class="cell-sub">${esc(u?.name || '')}</span></span></span>
        ${r.id === me?.id ? badge('Oturumdaki rol', 'info') : ''}
      </th>`;
    })
    .join('');

  let lastGroup = null;
  const rows = R.permissions
    .map((p) => {
      const g = p.group !== lastGroup ? `<tr class="group-row"><th colspan="${R.roles.length + 1}" scope="rowgroup">${esc(p.group)}</th></tr>` : '';
      lastGroup = p.group;
      const cells = R.roles
        .map((r) => {
          const has = r.permissions.includes(p.id);
          return `<td class="role-col${r.id === me?.id ? ' is-me' : ''}">${has ? `<span class="mark ok" title="${esc(r.name)}: var">${icon('check')}</span><span class="sr-only">Var</span>` : `<span class="no-perm" aria-label="Yok">—</span>`}</td>`;
        })
        .join('');
      return `${g}<tr>
        <th scope="row"><span class="cell-main">${esc(p.label)}</span><span class="code">${esc(p.id)}</span><span class="cell-sub">${esc(p.description)}</span></th>
        ${cells}
      </tr>`;
    })
    .join('');

  const s = R.sod;
  setView(
    `<div data-roles>
      <header class="page-head">
        <div>
          <p class="eyebrow">Yönetim</p>
          <h1>Yetki Matrisi</h1>
          <p class="lead">Ege Dağıtım'daki dört rolün hangi işlemleri yapabildiği. Bu tablo salt okunurdur; rolünü değiştirmek için oturum değiştir.</p>
        </div>
        <button class="btn btn-ghost" type="button" data-login>${icon('user')}<span>Oturumu değiştir</span></button>
      </header>

      <div class="card table-card">
        <div class="table-wrap"><table class="matrix">
          <thead><tr><th scope="col">Yetki</th>${head}</tr></thead>
          <tbody>${rows}</tbody>
        </table></div>
      </div>

      <div class="role-cards">${R.roles
        .map((r) => `<div class="card role-card${r.id === me?.id ? ' is-me' : ''}"><strong>${esc(r.name)}</strong><span class="cell-sub">${esc(r.summary)}</span><span class="cell-sub">${r.permissions.length} yetki</span></div>`)
        .join('')}</div>

      ${s ? `<section class="sod card">
        <div class="guide-head"><span class="icon-tile sm" style="--accent:var(--tone-violet)">${icon('shield')}</span><h3>${esc(s.title)}</h3></div>
        ${s.paragraphs.map((p) => `<p>${esc(p)}</p>`).join('')}
        <h4 class="list-title">Çakışan görev çiftleri</h4>
        <ul class="conflicts">${s.conflicts
          .map((c) => `<li><span class="conf-pair"><span class="chip static">${esc(c.a)}</span><span class="conf-x">${icon('close')}</span><span class="chip static">${esc(c.b)}</span></span><span class="cell-sub">${esc(c.why)}</span></li>`)
          .join('')}</ul>
      </section>` : ''}
    </div>`,
    'Yetki Matrisi'
  );

  document.querySelector('[data-roles] [data-login]')?.addEventListener('click', () => openLogin());
}
