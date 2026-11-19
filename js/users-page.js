// Kullanıcı Yönetimi (#/users): kullanıcılar, roller, departmanlar ve değişiklik günlüğü
// Gerekli yetki: USER_ADMIN. Tüm değişiklikler tarayıcıda saklanır (auth.js → IAM).
import { icon } from './icons.js';
import { esc, norm, badge, emptyState, toast, openDrawer, closeDrawer, drawerHead, datetime, alertBox } from './ui.js';
import {
  loadRoles, can, lockReason, iam, commitIam, resetIam, isIamCustomized, permissions, permOf, templates,
  roleById, userById, allUsers, permsOfRoles, permsOfUser, sodConflicts, lostPerms, currentUser, userLabel,
  initials, openLogin, rolesOfUser, membersOf,
} from './auth.js';

let tab = 'users';
let query = '';

const clone = (o) => JSON.parse(JSON.stringify(o));
const TR_ASCII = { ç: 'c', ğ: 'g', ı: 'i', i: 'i', ö: 'o', ş: 's', ü: 'u', Ç: 'C', Ğ: 'G', İ: 'I', I: 'I', Ö: 'O', Ş: 'S', Ü: 'U' };
const ascii = (s) => String(s).replace(/[çğıiöşüÇĞİIÖŞÜ]/g, (c) => TR_ASCII[c] ?? c).normalize('NFD').replace(/[̀-ͯ]/g, '');

function makeUsername(first, last, st, selfId) {
  const base = ascii(`${first.trim()[0] || ''}${last.trim().replace(/\s+/g, '')}`).toUpperCase().replace(/[^A-Z0-9]/g, '') || 'KULLANICI';
  let u = base;
  let n = 2;
  while (st.users.some((x) => x.username === u && x.id !== selfId)) u = `${base}${n++}`;
  return u;
}
function nextUserId(st) {
  const max = Math.max(0, ...st.users.map((u) => Number(String(u.id).replace(/\D/g, '')) || 0));
  return `U${String(max + 1).padStart(2, '0')}`;
}
function makeRoleId(name, st) {
  const base = ascii(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'rol';
  let id = base;
  let n = 2;
  while (st.roles.some((r) => r.id === id)) id = `${base}-${n++}`;
  return id;
}

const ACTION_LABEL = {
  'user-create': 'Kullanıcı oluşturdu', 'user-update': 'Kullanıcıyı güncelledi', 'user-deactivate': 'Kullanıcıyı pasifleştirdi', 'user-activate': 'Kullanıcıyı aktifleştirdi',
  'role-create': 'Rol oluşturdu', 'role-update': 'Rolü güncelledi', 'role-delete': 'Rolü sildi',
  'dept-add': 'Departman ekledi', 'dept-rename': 'Departmanı yeniden adlandırdı', 'dept-delete': 'Departmanı sildi',
  reset: 'Varsayılana döndürdü',
};

// ---------- sayfa ----------
export async function viewUsers(setView) {
  await loadRoles();
  if (!can('USER_ADMIN')) {
    setView(
      `<header class="page-head"><div><p class="eyebrow">Yönetim</p><h1>Kullanıcı Yönetimi</h1></div></header>
      <div class="card">${emptyState('lock', 'Bu sayfa için yetkin yok', lockReason('USER_ADMIN'), `<button class="btn btn-primary" type="button" data-login>${icon('user')}<span>Oturumu değiştir</span></button>`)}</div>`,
      'Kullanıcı Yönetimi'
    );
    document.querySelector('[data-login]')?.addEventListener('click', () => openLogin());
    return;
  }

  const st = iam();
  const tabBtn = (id, label, n) => `<button type="button" role="tab" data-tab="${id}" aria-selected="${tab === id}" class="${tab === id ? 'is-active' : ''}">${label} <span class="count muted-count">${n}</span></button>`;
  const body = tab === 'roles' ? rolesTab(st) : tab === 'depts' ? deptsTab(st) : usersTab(st);

  setView(
    `<div data-users>
      <header class="page-head">
        <div>
          <p class="eyebrow">Yönetim</p>
          <h1>Kullanıcı Yönetimi</h1>
          <p class="lead">Kullanıcıları, rolleri ve departmanları yönet. Yetki değişiklikleri kaydedilmeden önce görevler ayrılığı ve "son yetki sahibi" kurallarıyla kontrol edilir.</p>
        </div>
        <div class="head-actions">
          ${isIamCustomized() ? `<button class="btn btn-ghost" type="button" data-reset>${icon('close')}<span>Varsayılana dön</span></button>` : badge('Varsayılan kurulum', 'neutral')}
        </div>
      </header>
      <aside class="callout callout-info sap-note">${icon('help')}<div><strong>Gerçek SAP'de</strong><p>Kullanıcılar <code>SU01</code>, roller ve yetki profilleri <code>PFCG</code> ile yönetilir; kim hangi yetkiye sahip sorusu <code>SUIM</code> ile, başarısız yetki kontrolü <code>SU53</code> ile incelenir. SoD riskleri büyük şirketlerde SAP GRC Access Control ile analiz edilir. Ayrıntı: <a class="link" href="#/docs/yetki-sod">Yetki konsepti ve görevler ayrılığı</a>.</p></div></aside>
      <div class="toolbar">
        <div class="seg-ctrl" role="tablist" aria-label="Yönetim bölümleri">
          ${tabBtn('users', 'Kullanıcılar', st.users.length)}${tabBtn('roles', 'Roller', st.roles.length)}${tabBtn('depts', 'Departmanlar', st.departments.length)}
        </div>
      </div>
      ${body}
      ${logSection(st)}
    </div>`,
    'Kullanıcı Yönetimi'
  );
  bindPage(setView);
}

function usersTab(st) {
  const q = norm(query);
  const list = st.users.filter((u) => !q || norm(`${u.name} ${u.username} ${u.department} ${u.title} ${rolesOfUser(u.id).map((r) => r.name).join(' ')}`).includes(q));
  const me = currentUser();
  return `<div class="toolbar">
      <label class="search">${icon('search')}<input type="search" data-q value="${esc(query)}" placeholder="Ad, kullanıcı adı, departman veya rol ara" autocomplete="off"></label>
      <button class="btn btn-primary" type="button" data-new-user>${icon('user')}<span>Yeni kullanıcı</span></button>
    </div>
    <div class="card table-card"><div class="table-wrap"><table class="table">
      <thead><tr><th>Kullanıcı</th><th class="hide-sm">Unvan / departman</th><th>Roller</th><th class="hide-md">Yetki</th><th>Durum</th></tr></thead>
      <tbody>${list
        .map((u) => {
          const perms = permsOfUser(u.id);
          const sod = sodConflicts(perms);
          return `<tr data-user="${esc(u.id)}" tabindex="0" class="${u.active ? '' : 'is-inactive'}">
            <td><div class="user-cell"><span class="avatar">${esc(initials(u.name))}</span><div><div class="cell-main">${esc(u.name)}${u.id === me?.id ? ' <span class="cell-sub inline">(sen)</span>' : ''}</div><div class="cell-sub">${esc(u.username)} · ${esc(u.id)}</div></div></div></td>
            <td class="hide-sm"><div>${esc(u.title || '—')}</div><div class="cell-sub">${esc(u.department || '—')}</div></td>
            <td><div class="badges tight">${rolesOfUser(u.id).map((r) => badge(r.name, 'info')).join('') || '<span class="muted">Rol yok</span>'}</div></td>
            <td class="hide-md">${perms.size}${sod.length ? ` <span class="sod-flag" title="${esc(sod.map((r) => `${r.a} + ${r.b}`).join(', '))}">${icon('alert')} SoD</span>` : ''}</td>
            <td>${u.active ? badge('Aktif', 'success') : badge('Pasif', 'neutral')}</td>
          </tr>`;
        })
        .join('')}</tbody>
    </table></div>
    <div class="table-foot"><strong>${st.users.filter((u) => u.active).length}</strong> aktif · ${st.users.filter((u) => !u.active).length} pasif kullanıcı · satıra tıklayınca düzenleme açılır</div></div>`;
}

function rolesTab(st) {
  return `<div class="toolbar">
      <span class="toolbar-count">Rol yetkileri Yetki Matrisi'nde de görünür.</span>
      <button class="btn btn-primary" type="button" data-new-role>${icon('shield')}<span>Yeni rol</span></button>
    </div>
    <div class="role-admin-grid">${st.roles
      .map((r) => {
        const sod = sodConflicts(new Set(r.permissions));
        const members = membersOf(r.id);
        return `<button class="card role-admin" type="button" data-role="${esc(r.id)}">
          <span class="ra-head"><strong>${esc(r.name)}</strong>${r.builtIn ? badge('Varsayılan', 'neutral') : badge('Özel', 'info')}${sod.length ? `<span class="sod-flag">${icon('alert')} SoD</span>` : ''}</span>
          <span class="cell-sub">${esc(r.summary || '')}</span>
          <span class="ra-meta"><span>${icon('shield')} ${r.permissions.length} yetki</span><span>${icon('users')} ${members.length ? esc(members.map((u) => u.name).join(', ')) : 'üye yok'}</span></span>
        </button>`;
      })
      .join('')}</div>`;
}

function deptsTab(st) {
  const used = (d) => st.users.filter((u) => u.department === d).length;
  return `<div class="card dept-card">
    <ul class="dept-list">${st.departments
      .map((d, i) => `<li>
        <input class="input" value="${esc(d)}" data-dept-name="${i}" aria-label="Departman adı">
        <span class="cell-sub">${used(d)} kullanıcı</span>
        <button class="btn btn-ghost" type="button" data-dept-save="${i}">${icon('check')}<span>Kaydet</span></button>
        <button class="icon-btn" type="button" data-dept-del="${i}" aria-label="Sil" title="${used(d) ? 'Kullanıcısı olan departman silinemez' : 'Sil'}">${icon('close')}</button>
      </li>`)
      .join('')}</ul>
    <div class="dept-add">
      <input class="input" data-dept-new placeholder="Yeni departman adı" aria-label="Yeni departman adı">
      <button class="btn btn-primary" type="button" data-dept-add>${icon('check')}<span>Ekle</span></button>
    </div>
  </div>`;
}

function logSection(st) {
  const log = st.log || [];
  return `<section class="iam-log">
    <h2 class="list-title">Değişiklik günlüğü</h2>
    ${log.length
      ? `<div class="card table-card"><div class="table-wrap"><table class="table log-table">
          <thead><tr><th>Zaman</th><th>Kim</th><th>İşlem</th><th>Hedef</th><th class="hide-sm">Ayrıntı</th></tr></thead>
          <tbody>${log
            .map((l) => `<tr>
              <td class="nowrap">${datetime(l.at)}</td>
              <td>${esc(userLabel(l.by))}</td>
              <td>${esc(ACTION_LABEL[l.action] || l.action)}</td>
              <td><strong>${esc(l.target || '')}</strong></td>
              <td class="hide-sm">${esc(l.detail || '')}${l.justification ? `<div class="log-just">${icon('alert')} SoD gerekçesi: ${esc(l.justification)}</div>` : ''}</td>
            </tr>`)
            .join('')}</tbody></table></div></div>`
      : `<p class="cell-sub">Henüz değişiklik yok. Yaptığın her kullanıcı, rol ve departman değişikliği burada kim, ne zaman, neyi değiştirdi bilgisiyle listelenir.</p>`}
  </section>`;
}

// ---------- olaylar ----------
function bindPage(setView) {
  const root = document.querySelector('[data-users]');
  const rerender = () => viewUsers(setView);

  root.addEventListener('click', (e) => {
    const t = e.target.closest('[data-tab]');
    if (t) {
      tab = t.dataset.tab;
      return rerender();
    }
    const reset = e.target.closest('[data-reset]');
    if (reset) {
      if (!reset.classList.contains('confirm')) {
        reset.classList.add('confirm', 'danger');
        reset.querySelector('span').textContent = 'Emin misin? Tekrar dokun';
        return;
      }
      resetIam();
      return toast('Kullanıcılar, roller ve departmanlar varsayılana döndü');
    }
    if (e.target.closest('[data-new-user]')) return openUserForm(null);
    if (e.target.closest('[data-new-role]')) return openRoleForm(null);
    const ur = e.target.closest('tr[data-user]');
    if (ur) return openUserForm(ur.dataset.user);
    const rr = e.target.closest('[data-role]');
    if (rr) return openRoleForm(rr.dataset.role);

    const ds = e.target.closest('[data-dept-save]');
    if (ds) return renameDept(Number(ds.dataset.deptSave), root.querySelector(`[data-dept-name="${ds.dataset.deptSave}"]`).value);
    const dd = e.target.closest('[data-dept-del]');
    if (dd) return deleteDept(Number(dd.dataset.deptDel));
    if (e.target.closest('[data-dept-add]')) return addDept(root.querySelector('[data-dept-new]').value);
  });
  root.addEventListener('keydown', (e) => {
    const ur = e.target.closest('tr[data-user]');
    if (ur && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      openUserForm(ur.dataset.user);
    }
    if (e.key === 'Enter' && e.target.matches('[data-dept-new]')) addDept(e.target.value);
  });
  root.querySelector('[data-q]')?.addEventListener('input', (e) => {
    query = e.target.value;
    const pos = e.target.selectionStart;
    rerender().then(() => {
      const i = document.querySelector('[data-users] [data-q]');
      i?.focus();
      i?.setSelectionRange(pos, pos);
    });
  });
}

// ---------- departmanlar ----------
function addDept(name) {
  const n = name.trim();
  const st = clone(iam());
  if (!n) return toast('Departman adı yaz');
  if (st.departments.some((d) => norm(d) === norm(n))) return toast('Bu departman zaten var');
  st.departments.push(n);
  commitIam(st, { action: 'dept-add', target: n });
  toast(`Departman eklendi: ${n}`);
}
function renameDept(i, name) {
  const n = name.trim();
  const st = clone(iam());
  const old = st.departments[i];
  if (!n || n === old) return;
  if (st.departments.some((d, k) => k !== i && norm(d) === norm(n))) return toast('Bu departman zaten var');
  st.departments[i] = n;
  st.users.forEach((u) => {
    if (u.department === old) u.department = n;
  });
  commitIam(st, { action: 'dept-rename', target: n, detail: `${old} → ${n}` });
  toast('Departman güncellendi');
}
function deleteDept(i) {
  const st = clone(iam());
  const d = st.departments[i];
  const n = st.users.filter((u) => u.department === d).length;
  if (n) return toast(`${d} departmanında ${n} kullanıcı var; önce kullanıcıları başka departmana taşı`);
  st.departments.splice(i, 1);
  commitIam(st, { action: 'dept-delete', target: d });
  toast(`Departman silindi: ${d}`);
}

// ---------- ortak: kontrol paneli ----------
function sodPanel(conflicts, justification = '') {
  if (!conflicts.length) return `<div class="check is-ok"><div class="check-head">${icon('check')}<strong>Görevler ayrılığı çakışması yok</strong></div></div>`;
  return `<div class="check is-warn">
    <div class="check-head">${icon('alert')}<strong>Görevler ayrılığı (SoD) çakışması</strong></div>
    <ul>${conflicts.map((r) => `<li><span class="code">${esc(r.a)}</span> + <span class="code">${esc(r.b)}</span>: ${esc(r.why)}</li>`).join('')}</ul>
    <label class="field"><span class="field-label">Gerekçe <span class="req">*</span><span class="cell-sub inline">yazılırsa kayıt yapılır ve günlüğe eklenir</span></span>
      <textarea class="input textarea" rows="2" data-just placeholder="Ör. Küçük şube; ikinci kişi yok. Aylık denetimle telafi edilir.">${esc(justification)}</textarea></label>
  </div>`;
}

function blockBox(title, text, suggestion = '') {
  return `<div class="alert alert-danger block-box">${icon('lock')}<div><strong>${esc(title)}</strong><p>${text}</p>${suggestion}</div></div>`;
}

const drawerRoot = () => document.querySelector('.drawer-root .drawer-inner');

// ---------- kullanıcı formu ----------
// prefill: { roles, department, title, firstName, lastName, note }
function openUserForm(id, prefill = null) {
  const st = iam();
  const u = id ? userById(id) : null;
  const v = u ? clone(u) : { firstName: '', lastName: '', department: st.departments[0] || '', title: '', roles: [], active: true, ...(prefill || {}) };
  const me = currentUser();

  const html =
    drawerHead(u ? `Kullanıcı · ${u.username}` : 'Yeni kullanıcı', u ? u.name : 'Kullanıcı oluştur', u ? (u.active ? badge('Aktif', 'success') : badge('Pasif', 'neutral')) + (u.id === me?.id ? badge('Oturumdaki kullanıcı', 'info') : '') : '') +
    `<div class="drawer-body iam-form" data-user-form="${esc(id || '')}">
      ${prefill?.note ? alertBox('info', 'Form önerilen değerlerle dolduruldu', esc(prefill.note)) : ''}
      <div class="form-grid">
        <label class="field"><span class="field-label">Ad <span class="req">*</span></span><input class="input" data-f="firstName" value="${esc(v.firstName)}" maxlength="40"></label>
        <label class="field"><span class="field-label">Soyad <span class="req">*</span></span><input class="input" data-f="lastName" value="${esc(v.lastName)}" maxlength="40"></label>
        <div class="field"><span class="field-label">Kullanıcı adı</span><div class="ro" data-username>${esc(u?.username || '—')}</div></div>
        <label class="field"><span class="field-label">Departman</span><select class="select" data-f="department">${st.departments.map((d) => `<option ${d === v.department ? 'selected' : ''}>${esc(d)}</option>`).join('')}</select></label>
        <label class="field span-2"><span class="field-label">Unvan</span><input class="input" data-f="title" value="${esc(v.title || '')}" maxlength="60" placeholder="Ör. Satış Temsilcisi"></label>
      </div>
      <fieldset class="role-pick"><legend class="field-label">Roller</legend>
        ${st.roles.map((r) => `<label class="role-opt"><input type="checkbox" data-role-cb value="${esc(r.id)}" ${v.roles.includes(r.id) ? 'checked' : ''}><span><strong>${esc(r.name)}</strong><span class="cell-sub">${esc(r.summary || '')} · ${r.permissions.length} yetki</span></span></label>`).join('')}
      </fieldset>
      ${u ? `<label class="role-opt status-opt"><input type="checkbox" data-f-active ${v.active ? 'checked' : ''}><span><strong>Aktif</strong><span class="cell-sub">Pasif kullanıcı oturum açamaz, onay kutusunda görünmez.</span></span></label>` : ''}
      <div class="dsec"><h3>Etkin yetkiler</h3><div class="chips" data-perm-chips></div></div>
      <div data-sod></div>
      <div data-block></div>
      <div class="drawer-actions">
        <button class="btn btn-primary" type="button" data-act="user-save">${icon('check')}<span>${u ? 'Değişiklikleri kaydet' : 'Kullanıcıyı oluştur'}</span></button>
        <button class="btn btn-ghost" type="button" data-close>Vazgeç</button>
      </div>
    </div>`;

  openDrawer(html, (el) => {
    if (el.dataset.act === 'user-save') saveUser(id);
    if (el.dataset.act === 'suggest-user') openUserForm(null, JSON.parse(el.dataset.prefill));
    if (el.dataset.act === 'suggest-role') openRoleForm(null, JSON.parse(el.dataset.prefill));
  });
  const form = drawerRoot();
  const refresh = () => previewUser(form, id);
  form.addEventListener('change', refresh);
  form.addEventListener('input', (e) => {
    if (e.target.matches('[data-f="firstName"],[data-f="lastName"]')) refresh();
  });
  refresh();
}

function readUserForm(form) {
  const f = (k) => form.querySelector(`[data-f="${k}"]`)?.value.trim() || '';
  return {
    firstName: f('firstName'),
    lastName: f('lastName'),
    department: f('department'),
    title: f('title'),
    roles: [...form.querySelectorAll('[data-role-cb]:checked')].map((c) => c.value),
    active: form.querySelector('[data-f-active]') ? form.querySelector('[data-f-active]').checked : true,
    justification: form.querySelector('[data-just]')?.value.trim() || '',
  };
}

function previewUser(form, id) {
  const v = readUserForm(form);
  const perms = permsOfRoles(v.roles);
  form.querySelector('[data-perm-chips]').innerHTML = [...perms].map((p) => `<span class="chip static" title="${esc(permOf(p)?.description || '')}"><span class="code">${esc(p)}</span> ${esc(permOf(p)?.label || '')}</span>`).join('') || '<span class="muted">Rol seçilmedi; kullanıcı hiçbir işlem yapamaz.</span>';
  const sodBox = form.querySelector('[data-sod]');
  const keep = sodBox.querySelector('[data-just]')?.value || v.justification;
  sodBox.innerHTML = sodPanel(sodConflicts(perms), keep);
  if (v.firstName || v.lastName) form.querySelector('[data-username]').textContent = id ? userById(id).username : makeUsername(v.firstName, v.lastName, iam(), id);
  form.querySelector('[data-block]').innerHTML = '';
}

function saveUser(id) {
  const form = drawerRoot();
  const v = readUserForm(form);
  const block = form.querySelector('[data-block]');
  if (!v.firstName || !v.lastName) return toast('Ad ve soyad zorunlu');

  const st = clone(iam());
  const me = currentUser();
  const old = id ? st.users.find((u) => u.id === id) : null;
  const rec = old || { id: nextUserId(st), email: '', phone: '', responsibilities: [], approvalLimit: 0 };
  Object.assign(rec, {
    firstName: v.firstName,
    lastName: v.lastName,
    name: `${v.firstName} ${v.lastName}`,
    username: old?.username || makeUsername(v.firstName, v.lastName, st, rec.id),
    department: v.department,
    title: v.title,
    role: v.title,
    roles: v.roles,
    active: v.active,
  });
  if (!old) st.users.push(rec);

  // 1) Kendi hesabını koru
  if (id && id === me?.id) {
    if (!v.active) {
      block.innerHTML = blockBox('Kendi hesabını pasifleştiremezsin', 'Oturumdaki kullanıcı pasifleştirilirse sistemde kimse bu işlemi geri alamayabilir.');
      return;
    }
    if (!permsOfRoles(v.roles, st).has('USER_ADMIN')) {
      block.innerHTML = blockBox('Kendi USER_ADMIN yetkini kaldıramazsın', 'Kullanıcı yönetimi yetkisini başka bir yönetici kaldırabilir. Bu yetkiyi veren rolü (ör. Key User veya Sistem Yöneticisi) koru.');
      return;
    }
  }

  // 2) Son yetki sahibi
  const lost = lostPerms(st);
  if (lost.length) {
    const cur = iam();
    const sugRoles = [...new Set(lost.map((p) => cur.roles.find((r) => r.permissions.includes(p))?.id).filter(Boolean))];
    const prefill = { roles: sugRoles, department: old?.department || v.department, title: old?.title || '', note: `${lost.join(', ')} yetkisine sahip yeni bir kullanıcı oluştur; ardından ${old?.name || 'bu kullanıcı'} üzerindeki değişikliği tekrar dene.` };
    block.innerHTML = blockBox(
      'Bu değişiklik engellendi: son yetki sahibi',
      `Kaydedilirse <strong>${lost.map((p) => `${esc(p)} (${esc(permOf(p)?.label || '')})`).join(', ')}</strong> yetkisine sahip aktif kullanıcı kalmaz. Önce bu yetkiyle yeni kullanıcı oluştur.`,
      `<button class="btn btn-primary" type="button" data-act="suggest-user" data-prefill="${esc(JSON.stringify(prefill))}">${icon('user')}<span>Önce bu yetkiyle yeni kullanıcı oluştur</span></button>`
    );
    return;
  }

  // 3) SoD
  const conflicts = sodConflicts(permsOfRoles(v.roles, st));
  if (conflicts.length && !v.justification) {
    form.querySelector('[data-just]')?.focus();
    return toast('SoD çakışması var: kaydetmek için gerekçe yaz');
  }
  rec.sodJustification = conflicts.length ? v.justification : undefined;

  // Günlük ayrıntısı
  const roleName = (r) => roleById(r)?.name || r;
  let action = old ? 'user-update' : 'user-create';
  const parts = [];
  if (old) {
    const prev = userById(id);
    if (prev.active !== v.active) action = v.active ? 'user-activate' : 'user-deactivate';
    const add = v.roles.filter((r) => !prev.roles.includes(r));
    const rem = prev.roles.filter((r) => !v.roles.includes(r));
    if (add.length) parts.push(`+ ${add.map(roleName).join(', ')}`);
    if (rem.length) parts.push(`− ${rem.map(roleName).join(', ')}`);
    if (prev.name !== rec.name) parts.push(`ad: ${prev.name} → ${rec.name}`);
    if (prev.department !== rec.department) parts.push(`departman: ${prev.department} → ${rec.department}`);
    if ((prev.title || '') !== rec.title) parts.push(`unvan: ${rec.title || '—'}`);
  } else {
    parts.push(`${rec.username} · ${v.roles.map(roleName).join(', ') || 'rol yok'}`);
  }
  if (old && !parts.length && action === 'user-update') return toast('Değişiklik yok');

  commitIam(st, { action, target: rec.name, detail: parts.join(' · '), justification: rec.sodJustification });
  closeDrawer();
  toast(old ? `${rec.name} güncellendi` : `${rec.name} oluşturuldu (${rec.username})`);
}

// ---------- rol formu ----------
// prefill: { name, summary, permissions, note }
function openRoleForm(id, prefill = null) {
  const st = iam();
  const r = id ? roleById(id) : null;
  const v = r ? clone(r) : { name: '', summary: '', permissions: [], ...(prefill || {}) };
  const groups = [...new Set(permissions().map((p) => p.group))];
  const members = r ? membersOf(r.id) : [];

  const html =
    drawerHead(r ? 'Rol' : 'Yeni rol', r ? r.name : 'Rol oluştur', r ? (r.builtIn ? badge('Varsayılan', 'neutral') : badge('Özel', 'info')) + badge(`${members.length} üye`, 'neutral') : '') +
    `<div class="drawer-body iam-form" data-role-form="${esc(id || '')}">
      ${prefill?.note ? alertBox('info', 'Form önerilen değerlerle dolduruldu', esc(prefill.note)) : ''}
      ${!r ? `<label class="field"><span class="field-label">Şablondan başla</span><select class="select" data-template><option value="">Şablon seç (isteğe bağlı)…</option>${templates().map((t, i) => `<option value="${i}">${esc(t.name)} · ${t.permissions.length} yetki</option>`).join('')}</select></label>` : ''}
      <div class="form-grid">
        <label class="field"><span class="field-label">Rol adı <span class="req">*</span></span><input class="input" data-f="name" value="${esc(v.name)}" maxlength="40"></label>
        <label class="field span-2"><span class="field-label">Açıklama</span><input class="input" data-f="summary" value="${esc(v.summary || '')}" maxlength="120"></label>
      </div>
      <fieldset class="perm-pick"><legend class="field-label">Yetkiler</legend>
        ${groups.map((g) => `<div class="perm-group"><div class="tree-label">${esc(g)}</div>${permissions()
          .filter((p) => p.group === g)
          .map((p) => `<label class="role-opt"><input type="checkbox" data-perm-cb value="${esc(p.id)}" ${v.permissions.includes(p.id) ? 'checked' : ''}><span><strong>${esc(p.label)}</strong> <span class="code">${esc(p.id)}</span><span class="cell-sub">${esc(p.description)}</span></span></label>`)
          .join('')}</div>`).join('')}
      </fieldset>
      ${r ? `<div class="dsec"><h3>Bu role sahip aktif kullanıcılar</h3>${members.length ? `<div class="chips">${members.map((u) => `<span class="chip static">${esc(u.name)}</span>`).join('')}</div>` : '<p class="cell-sub">Üye yok.</p>'}</div>` : ''}
      <div data-sod></div>
      <div data-block></div>
      <div class="drawer-actions">
        <button class="btn btn-primary" type="button" data-act="role-save">${icon('check')}<span>${r ? 'Değişiklikleri kaydet' : 'Rolü oluştur'}</span></button>
        ${r && !r.builtIn && !members.length ? `<button class="btn btn-ghost danger" type="button" data-act="role-delete">${icon('close')}<span>Rolü sil</span></button>` : ''}
        <button class="btn btn-ghost" type="button" data-close>Vazgeç</button>
      </div>
    </div>`;

  openDrawer(html, (el) => {
    if (el.dataset.act === 'role-save') saveRole(id);
    if (el.dataset.act === 'role-delete') deleteRole(id, el);
    if (el.dataset.act === 'suggest-user') openUserForm(null, JSON.parse(el.dataset.prefill));
    if (el.dataset.act === 'suggest-role') openRoleForm(null, JSON.parse(el.dataset.prefill));
  });
  const form = drawerRoot();
  const refresh = () => {
    const perms = new Set([...form.querySelectorAll('[data-perm-cb]:checked')].map((c) => c.value));
    const box = form.querySelector('[data-sod]');
    const keep = box.querySelector('[data-just]')?.value || '';
    box.innerHTML = sodPanel(sodConflicts(perms), keep);
    form.querySelector('[data-block]').innerHTML = '';
  };
  form.addEventListener('change', (e) => {
    if (e.target.matches('[data-template]') && e.target.value !== '') {
      const t = templates()[Number(e.target.value)];
      form.querySelector('[data-f="name"]').value = t.name;
      form.querySelector('[data-f="summary"]').value = t.description;
      form.querySelectorAll('[data-perm-cb]').forEach((c) => (c.checked = t.permissions.includes(c.value)));
    }
    refresh();
  });
  refresh();
}

function saveRole(id) {
  const form = drawerRoot();
  const block = form.querySelector('[data-block]');
  const name = form.querySelector('[data-f="name"]').value.trim();
  const summary = form.querySelector('[data-f="summary"]').value.trim();
  const perms = [...form.querySelectorAll('[data-perm-cb]:checked')].map((c) => c.value);
  const just = form.querySelector('[data-just]')?.value.trim() || '';
  if (!name) return toast('Rol adı zorunlu');

  const st = clone(iam());
  if (st.roles.some((r) => r.id !== id && norm(r.name) === norm(name))) return toast('Bu adla bir rol zaten var');
  const old = id ? st.roles.find((r) => r.id === id) : null;
  const rec = old || { id: makeRoleId(name, st), builtIn: false };
  const prevPerms = old ? [...old.permissions] : [];
  Object.assign(rec, { name, summary, permissions: perms });
  if (!old) st.roles.push(rec);

  // 1) Kendi USER_ADMIN yetkisi
  const me = currentUser();
  if (me && permsOfUser(me.id).has('USER_ADMIN') && !permsOfUser(me.id, st).has('USER_ADMIN')) {
    block.innerHTML = blockBox('Kendi USER_ADMIN yetkini kaldıramazsın', `Bu değişiklikle ${esc(me.name)} kullanıcı yönetimi yetkisini kaybeder. Yetkiyi önce başka bir rol üzerinden koru.`);
    return;
  }

  // 2) Son yetki sahibi
  const lost = lostPerms(st);
  if (lost.length) {
    const roleWith = (p) => st.roles.find((r) => r.permissions.includes(p))?.id;
    const userRoles = [...new Set(lost.map(roleWith).filter(Boolean))];
    const suggestion = userRoles.length === lost.length
      ? `<button class="btn btn-primary" type="button" data-act="suggest-user" data-prefill="${esc(JSON.stringify({ roles: userRoles, note: `${lost.join(', ')} yetkisini taşıyan rolle yeni kullanıcı oluştur; ardından "${name}" rolündeki değişikliği tekrar dene.` }))}">${icon('user')}<span>Önce bu yetkiyle yeni kullanıcı oluştur</span></button>`
      : `<button class="btn btn-primary" type="button" data-act="suggest-role" data-prefill="${esc(JSON.stringify({ name: `${name} (yedek)`, summary: `${lost.join(', ')} yetkisini taşıyan yedek rol`, permissions: lost, note: 'Bu yetkiyi taşıyan başka rol yok. Önce yedek rolü oluştur, bir kullanıcıya ata, sonra değişikliği tekrar dene.' }))}">${icon('shield')}<span>Önce bu yetkiyle yedek rol oluştur</span></button>`;
    block.innerHTML = blockBox(
      'Bu değişiklik engellendi: son yetki sahibi',
      `Kaydedilirse <strong>${lost.map((p) => esc(p)).join(', ')}</strong> yetkisine sahip aktif kullanıcı kalmaz (ör. son onaycı). Önce bu yetkiyle yeni kullanıcı oluştur.`,
      suggestion
    );
    return;
  }

  // 3) SoD
  const conflicts = sodConflicts(new Set(perms));
  if (conflicts.length && !just) {
    form.querySelector('[data-just]')?.focus();
    return toast('SoD çakışması var: kaydetmek için gerekçe yaz');
  }
  rec.sodJustification = conflicts.length ? just : undefined;

  const add = perms.filter((p) => !prevPerms.includes(p));
  const rem = prevPerms.filter((p) => !perms.includes(p));
  const detail = old ? [add.length && `+ ${add.join(', ')}`, rem.length && `− ${rem.join(', ')}`, old.name !== name && `ad: ${name}`].filter(Boolean).join(' · ') : `${perms.length} yetki: ${perms.join(', ')}`;
  if (old && !detail && old.summary === summary) return toast('Değişiklik yok');

  commitIam(st, { action: old ? 'role-update' : 'role-create', target: name, detail: detail || 'açıklama güncellendi', justification: rec.sodJustification });
  closeDrawer();
  toast(old ? `${name} rolü güncellendi` : `${name} rolü oluşturuldu`);
}

function deleteRole(id, el) {
  if (!el.classList.contains('confirm')) {
    el.classList.add('confirm');
    el.querySelector('span').textContent = 'Silmek için tekrar dokun';
    return;
  }
  const st = clone(iam());
  const r = st.roles.find((x) => x.id === id);
  if (!r || r.builtIn || allUsers(st).some((u) => u.roles.includes(id))) return toast('Bu rol silinemez');
  st.roles = st.roles.filter((x) => x.id !== id);
  commitIam(st, { action: 'role-delete', target: r.name });
  closeDrawer();
  toast(`${r.name} rolü silindi`);
}

export const _test = { makeUsername, nextUserId, makeRoleId };
