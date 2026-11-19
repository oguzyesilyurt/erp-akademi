# ERP Akademi

**Canlı site:** https://oguzyesilyurt.github.io/erp-akademi/ · **Depo:** https://github.com/oguzyesilyurt/erp-akademi

SAP ve CRM süreçlerini uygulamalı öğreten eğitim simülatörü. Telefona ve bilgisayara uygulama olarak yüklenebilen (PWA), çevrimdışı çalışan, tamamen statik bir web uygulamasıdır. Build aracı yoktur; saf HTML, CSS ve JavaScript.

## Yapı

```
index.html            Uygulama kabuğu
css/app.css           Tasarım sistemi (açık/koyu tema)
js/app.js             Görünümler, navigasyon, tema
js/router.js          Hash router: #/, #/track/<id>, #/track/<id>/<bölüm>
js/store.js           İlerleme ve tercihler (localStorage)
js/icons.js           Satır içi SVG ikonlar
js/ui.js              Ortak yardımcılar (biçimlendirme, rozet, boş durum)
js/company.js         Şirket sayfası ve iş kuralları (kredi, stok, fiyat)
js/track-content.js   Yol bölümlerini veriden çizer (giriş, kavramlar, senaryolar)
js/sim-quote.js       "Teklif Oluştur" simülasyonu (simulation.type = "quote")
js/quote-doc.js       Kaydedilmiş teklifin salt okunur belge görünümü
js/bug-hunt.js        Testler: "Hata Avı" (tests.type = "bug-hunt")
js/quiz.js            Quiz (quiz.type = "quiz")
js/auth.js            Sahte oturum, rol çözümleme, yetki kontrolü (can) ve kilitli düğmeler
js/quotes.js          Teklif iş akışı: Taslak → Onay bekliyor → Onaylandı / Reddedildi
js/inbox.js           Onay Kutusu sayfası (#/inbox)
js/roles-page.js      Yetki Matrisi sayfası (#/roles)
js/erp.js             Sipariş → aktarım mesajı → teslimat → fatura ve belge akışı
js/interface-page.js  Aktarım Monitörü (#/interface)
js/markdown.js        Güvenli, küçük Markdown oluşturucu
js/docs.js            Dokümantasyon merkezi, arama, sözlük (#/docs)
js/users-page.js      Kullanıcı Yönetimi: kullanıcı, rol, departman, günlük (#/users)
js/release.js         Sistem sürümü ve feature flag'ler (data/releases.json)
js/testlab.js         Test Laboratuvarı: gereksinim, test case, koşum, defect, izlenebilirlik
data/docs/            Makaleler (.md), index.json, glossary.json
data/roles.json       Roller, yetkiler ve görevler ayrılığı açıklaması
data/company.json     Ortak sahte şirket verisi (Ege Dağıtım A.Ş.)
data/tracks.json      Öğrenme yolları listesi
data/tracks/<id>.json Her yolun içeriği
manifest.json, sw.js  PWA tanımı ve çevrimdışı önbellek
icons/                Uygulama ikonları
```

Bölümler (`intro`, `concepts`, `simulation`, `scenarios`, `tests`, `quiz`) tüm yollarda ortaktır.

### Yeni yol eklemek

1. `data/tracks.json` içindeki `tracks` dizisine bir kayıt ekleyin (`id`, `title`, `summary`, `icon`, `accent`).
2. Aynı `id` ile `data/tracks/<id>.json` dosyasını oluşturun.
3. `sw.js` içindeki `CACHE_VERSION` değerini artırın ki kullanıcılar güncel veriyi alsın.

Kod değişikliği gerekmez. Kullanılabilir ikon adları: `js/icons.js`.

## Yerelde çalıştırma

Service worker ve `fetch` nedeniyle dosyayı doğrudan açmak yerine yerel bir sunucu kullanın:

```bash
# Python
python -m http.server 8080
# veya Node
npx serve .
```

Ardından `http://localhost:8080` adresini açın.

## GitHub Pages'te yayınlama

1. Depoyu GitHub'a gönderin.
2. **Settings → Pages → Build and deployment** altında kaynak olarak **Deploy from a branch** seçin, dal `main`, klasör `/ (root)`.
3. Birkaç dakika sonra uygulama `https://<kullanıcı>.github.io/<depo>/` adresinde yayında olur.

Tüm yollar görelidir; alt dizinde sorunsuz çalışır. Yayından sonra tarayıcıda **Uygulamayı yükle** (masaüstü) veya **Ana ekrana ekle** (mobil) ile kurulabilir.

> Not: iOS ana ekran ikonu için SVG yerine 180×180 PNG gerekebilir; ileride `icons/` altına eklenebilir.

## Dokümantasyon merkezi

`#/docs` altında kategori ağacı, tam metin arama ve sözlük (`#/docs/glossary`) bulunur. İçerik `data/docs/` klasöründedir:

- `index.json` – kategoriler ve makale listesi (kategori, başlık, slug, etiketler, okuma süresi, ilgili makaleler)
- `<slug>.md` – makale metni (Markdown)
- `glossary.json` – sözlük terimleri

**Yeni makale eklemek:** `data/docs/<slug>.md` dosyasını oluşturun ve `index.json` içindeki `articles` dizisine bir satır ekleyin. Kod değişikliği gerekmez.

Desteklenen Markdown: `##`/`###` başlıklar, listeler (iç içe), tablolar, `kod` ve kod blokları, bağlantılar (`#/…` veya `https://…`) ve bilgi kutuları:

```
> [!INFO] / [!UYARI] / [!IPUCU] / [!ORNEK] / [!DENE]
> Kutu içeriği
```

Arama bağlantısı paylaşmak için: `#/docs?q=kredi`.

## Kullanıcılar ve roller

Varsayılan kullanıcılar `data/company.json`, roller, yetkiler, rol şablonları ve SoD kuralları `data/roles.json` içindedir:

| Kullanıcı | Kod | Rol |
|---|---|---|
| Denel Kaya | DKAYA | Satış Temsilcisi |
| Ayçelen Demir | ADEMIR | Satış Müdürü |
| Gökhan Yılmaz | GYILMAZ | Muhasebe |
| Oğuz Öztürk | OOZTURK | Key User (kullanıcı yönetimi dahil) |
| Mehmet Çınar | MCINAR | Depo Sorumlusu |

`USER_ADMIN` yetkisine sahip kullanıcılar `#/users` sayfasından kullanıcı, rol ve departmanları yönetebilir. Değişiklikler tarayıcıda saklanır; "Varsayılana dön" ile sıfırlanır. Senaryolar kişiye değil role bağlıdır; adımlarda o roldeki güncel kullanıcı gösterilir. Gerçek SAP'de bu işler `SU01` (kullanıcı) ve `PFCG` (rol) ile yapılır.

## Test Uzmanlığı ve sistem sürümleri

`data/releases.json` iki sürüm tanımlar: **v1.0** (canlı, doğru kurallar) ve **v1.1** (UAT adayı). v1.1'de dört hata feature flag ile açıktır: kampanya minimum miktar kontrolü yok, onay eşiği 500.000 ₺, teslimatta stok düşmüyor, fatura vadesi ödeme koşulunu yok sayıyor. Sürüm, Test Uzmanlığı > Simülasyon (Test Laboratuvarı) sekmesinden seçilir; seçili sürüm tüm simülasyonları etkiler ve varsayılan dışındaysa üst barda görünür. Hata Avı her zaman doğru kuralları kullanır.

Test Laboratuvarı'nda 10 gereksinim, 3 örnek test case, test koşumu (adımlar + gömülü simülasyon), defect yaşam döngüsü (Yeni → Atandı → Düzeltiliyor → Yeniden teste hazır → Kapandı / Yeniden açıldı / Tekrarlanamadı) ve izlenebilirlik matrisi bulunur. Defect düzeltme yetkisi (`DEFECT_FIX`) varsayılan kullanıcısı olmayan Teknik Lider rolündedir; önce Kullanıcı Yönetimi'nden bu rolde kullanıcı oluşturulmalıdır.

## Derin bağlantılar

Herhangi bir sayfaya `?open=<tür>:<no>` eklenirse ilgili belge paneli açılır. Türler: `quote`, `order`, `message`, `delivery`, `invoice`. Örnek: `#/interface?open=order:10000001`.
