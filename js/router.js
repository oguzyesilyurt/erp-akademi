// Hash tabanlı router
//   #/                            -> { name: 'home' }
//   #/track/<id>                  -> { name: 'track', id, section: null }
//   #/track/<id>/<bölüm>[/<alt>]  -> { name: 'track', id, section, sub }
//   #/company[/<sekme>]           -> { name: 'company', tab }
//   #/inbox                       -> { name: 'inbox' }   (Onay Kutusu)
//   #/roles                       -> { name: 'roles' }   (Yetki Matrisi)
//   #/interface                   -> { name: 'interface' } (Aktarım Monitörü)
//   #/docs[/<slug>|/glossary]     -> { name: 'docs', slug }   (Dokümantasyon)
//   #/users                       -> { name: 'users' }  (Kullanıcı Yönetimi, USER_ADMIN)
//   #/settings                    -> { name: 'settings' } (Ayarlar, demo sıfırlama)
// Her rotada "?a=b" sorgu parametreleri route.query içinde gelir.

export function parse(hash = location.hash) {
  const raw = hash.replace(/^#/, '') || '/';
  const [path, qs = ''] = raw.split('?');
  const parts = path.split('/').filter(Boolean).map(decodeURIComponent);
  const query = Object.fromEntries(new URLSearchParams(qs));

  if (parts.length === 0) return { name: 'home', query };
  if (parts[0] === 'track' && parts[1]) {
    return { name: 'track', id: parts[1], section: parts[2] || null, sub: parts[3] || null, query };
  }
  if (parts[0] === 'company') return { name: 'company', tab: parts[1] || null, query };
  if (parts[0] === 'inbox') return { name: 'inbox', query };
  if (parts[0] === 'roles') return { name: 'roles', query };
  if (parts[0] === 'interface') return { name: 'interface', query };
  if (parts[0] === 'docs') return { name: 'docs', slug: parts[1] || null, query };
  if (parts[0] === 'users') return { name: 'users', query };
  if (parts[0] === 'settings') return { name: 'settings', query };
  return { name: 'notfound', path, query };
}

export function href(name, params = {}, query = null) {
  let h = '#/';
  if (name === 'track') {
    h = `#/track/${encodeURIComponent(params.id)}`;
    if (params.section) h += `/${encodeURIComponent(params.section)}`;
    if (params.section && params.sub) h += `/${encodeURIComponent(params.sub)}`;
  } else if (name === 'company') {
    h = params.tab ? `#/company/${encodeURIComponent(params.tab)}` : '#/company';
  }
  if (query && Object.keys(query).length) h += `?${new URLSearchParams(query)}`;
  return h;
}

// Sorgu parametrelerini, yeni bir gezinme tetiklemeden adresten kaldırır
export function stripQuery() {
  const [path] = location.hash.split('?');
  if (path !== location.hash) history.replaceState(null, '', path || '#/');
}

export function start(onRoute) {
  const run = () => onRoute(parse());
  window.addEventListener('hashchange', run);
  run();
}
