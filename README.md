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
js/c4c.js             SAP C4C çalışma alanı: huni, tahmin, lead/BANT, Hesap 360, aktivite, kampanya
js/mm.js              MM çalışma alanı: stok (MMBE), talep, sipariş, mal girişi (101), fatura doğrulama, transfer (301)
js/fi.js              FI/CO: türetilmiş muhasebe belgeleri, alacak/borç, tahsilat, ödeme programı, raporlar, CO
js/demo-reset.js      Merkezi demo sıfırlama (tüm modüllerin işlem verisi)
js/settings-page.js   Ayarlar (#/settings)
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
| Denel | DENEL | Satış Temsilcisi |
| Ayçelen | AYCELEN | Satış Müdürü |
| Gökhan | GOKHAN | Muhasebe |
| Oğuz | OGUZ | Key User (kullanıcı yönetimi dahil) |
| Mehmet | MEHMET | Depo Sorumlusu |

Varsayılan kullanıcısı olmayan roller: **Teknik Lider** (DEFECT_FIX), **Pazarlama Uzmanı** (CAMPAIGN_MANAGE, LEAD_CREATE, LEAD_QUALIFY), **Satın Alma Uzmanı** (PR_CREATE, PO_CREATE), **Satın Alma Müdürü** (PR_RELEASE, PO_RELEASE), **Hazine Uzmanı** (PAYMENT_RUN) ve **Controller** (CO_VIEW, FI_REPORTS). İlgili ekrandaki uyarı kutusundan Kullanıcı Yönetimi'nde oluşturulur.

Varsayılan kullanıcılar yalnızca adla tanımlıdır; kullanıcı adı addan (Türkçe karakterler ASCII'ye çevrilerek) türetilir. Yeni oluşturulan kullanıcılarda soyad zorunludur ve kullanıcı adı ad baş harfi + soyaddan üretilir (ör. Çağrı Şahin → `CSAHIN`). Eski sürümden kalan, düzenlenmemiş varsayılan kullanıcı kayıtları açılışta yeni adlara taşınır.

`USER_ADMIN` yetkisine sahip kullanıcılar `#/users` sayfasından kullanıcı, rol ve departmanları yönetebilir. Değişiklikler tarayıcıda saklanır; "Varsayılana dön" ile sıfırlanır. Senaryolar kişiye değil role bağlıdır; adımlarda o roldeki güncel kullanıcı gösterilir. Gerçek SAP'de bu işler `SU01` (kullanıcı) ve `PFCG` (rol) ile yapılır.

## Test Uzmanlığı ve sistem sürümleri

`data/releases.json` iki sürüm tanımlar: **v1.0** (canlı, doğru kurallar) ve **v1.1** (UAT adayı). v1.1'de dört hata feature flag ile açıktır: kampanya minimum miktar kontrolü yok, onay eşiği 500.000 ₺, teslimatta stok düşmüyor, fatura vadesi ödeme koşulunu yok sayıyor. Sürüm, Test Uzmanlığı > Simülasyon (Test Laboratuvarı) sekmesinden seçilir; seçili sürüm tüm simülasyonları etkiler ve varsayılan dışındaysa üst barda görünür. Hata Avı her zaman doğru kuralları kullanır.

Test Laboratuvarı'nda 13 gereksinim (2'si satın alma, 1'i finans), 4 örnek test case (TC-04 MM çalışma alanını gömer), test koşumu (adımlar + gömülü simülasyon), defect yaşam döngüsü (Yeni → Atandı → Düzeltiliyor → Yeniden teste hazır → Kapandı / Yeniden açıldı / Tekrarlanamadı) ve izlenebilirlik matrisi bulunur. Defect düzeltme yetkisi (`DEFECT_FIX`) varsayılan kullanıcısı olmayan Teknik Lider rolündedir; önce Kullanıcı Yönetimi'nden bu rolde kullanıcı oluşturulmalıdır.

## SAP C4C (Sales Cloud)

SAP C4C > Simülasyon bir C4C çalışma alanıdır. Huni sekmesinde Kanban (PC'de sürükle-bırak, mobilde yatay kaydırma ve aşama menüsü) ve tahmin (ağırlıklı tutar, kapanış ayı, riskli fırsatlar, kayıp nedenleri) bulunur. Leadler sekmesinde BANT ile nitelendirilen lead tek tıkla hesap + ilgili kişi + fırsata dönüşür. Hesaplar sekmesi Hesap 360 görünümünü verir. Aktiviteler haftalık takvimde, gecikmiş görevler vurgulu gösterilir. Kampanyalar sekmesinde hedef grup önizlenir, lead üretilir ve performans izlenir. Fırsat Teklif aşamasında teklif simülasyonunu açar; teklif onayı fırsatı Pazarlık'a taşır ve tutarı günceller, sipariş fırsatı Kazanıldı yapar. Başlangıç verisi `data/tracks/sap-c4c.json` içinde `simulation.seed` altındadır; "Demo verisini sıfırla" ile geri yüklenir. Yetkiler: LEAD_CREATE, LEAD_QUALIFY, OPP_MANAGE (temsilci, müdür), FORECAST_VIEW_TEAM (müdür), CAMPAIGN_MANAGE (Pazarlama Uzmanı).

## Satın Alma ve Stok (MM)

Satın Alma (MM) > Simülasyon bir P2P çalışma alanıdır:

- **Stok (MMBE benzeri):** ürün × tesis serbest, bloke ve yoldaki stok; yeniden sipariş noktasının altındakiler vurgulanır ve "Talep oluştur" önerilir.
- **Talepler (0010000001…):** 50.000 ₺ üstü talep onay (PR_RELEASE) ister.
- **Siparişler (4500000001…):** onaylı talepten dönüştürülür; fiyat ve teslim süresi tedarikçinin bilgi kaydından (`company.json > suppliers[].prices`) gelir. 20.000 ₺ üstü sipariş onay (PO_RELEASE) ister. Yazdır/gönder görünümü vardır.
- **Mal girişi (101, 5000000001…):** kısmi teslimatı destekler.
- **Fatura doğrulama (5105600001…):** üç yönlü eşleştirme yapar; %2 fiyat toleransını veya teslim alınmamış miktarı aşan fatura ödemeye bloke edilir, muhasebe gerekçeyle kaldırır.
- **Transfer:** tesisler arası 301; stok hatası alan satış siparişleri listelenir.

Belge akışı PR → PO → GR → fatura zincirini gösterir; talep ve sipariş onayları Onay Kutusu'na düşer. Görevler ayrılığı kuralları: PO_CREATE + GR_POST, PO_CREATE + INVOICE_VERIFY, PR_CREATE + PR_RELEASE. Başlangıç verisi `data/tracks/s4-mm.json` içinde `simulation.seed` altındadır.

## Finans ve Maliyet (FI/CO)

Finans (FI/CO) > Simülasyon:

- **Muhasebe belgeleri (1000000001…):** teslimat (WA), satış faturası (RV), mal girişi (WE), tedarikçi faturası (RE), tahsilat (DZ) ve ödeme (KZ) olaylarından Tekdüzen Hesap Planı ile türetilir. Türetme deterministiktir; mevcut belge numaraları yeni olaylarla değişmez. Belge akışı ağaçlarında "Muhasebe belgesi" düğümü görünür.
- **Başlangıç verisi:** Ekim sonu açılış kaydı, 10 Kasım faturası, gider kayıtları ve tedarikçi açık kalemleri `data/tracks/s4-fico.json` içindedir.
- **Alacaklar:** yaşlandırma (FBL5N benzeri) ve tahsilat (F-28 benzeri, en eski vadeden denkleştirme). Tahsilat açık bakiyeyi ve kredi durumunu günceller.
- **Borçlar:** FBL1N benzeri liste ve ödeme programı (F110 benzeri); ödeme blokajlı kalemler nedeniyle hariç tutulur.
- **Raporlar:** mizan, bilanço ve gelir tablosu.
- **CO:** maliyet merkezi plan/fiili, kâr merkezleri ve kârlılık analizi (segment, kanal, bölge, ürün).

Hesap kodlarının kullanımı (GR/IR için 329, giderlerin doğrudan 63x'e yazılması) eğitim amaçlı sadeleştirilmiştir ve şirkete göre değişebilir.

## Demo verisini sıfırlama

Ayarlar (`#/settings`) tüm modüllerin işlem verisini tek seferde başlangıca döndürür: teklifler, siparişler, ERP belgeleri, satın alma belgeleri, CRM kayıtları, tahsilat/ödemeler, test koşumları ve defect'ler, stok/bakiye etkileri ve v1.1 düzeltmeleri. Kullanıcı/rol ayarları ve öğrenme ilerlemesi ayrı seçeneklerdir. C4C, MM, FI ve Aktarım Monitörü'ndeki sıfırlama düğmeleri aynı işlevi çağırır.

## Derin bağlantılar

Herhangi bir sayfaya `?open=<tür>:<no>` eklenirse ilgili belge paneli açılır. Türler: `quote`, `order`, `message`, `delivery`, `invoice`; satın alma için `pr`, `po`, `mdoc` (malzeme belgesi), `sinv` (tedarikçi faturası); muhasebe için `fidoc` (ör. `?open=fidoc:1000000003`). Örnek: `#/interface?open=order:10000001`.

C4C: `#/track/sap-c4c/simulation?account=100002` (Hesap 360), `?opp=OPP-0002`, `?lead=LEAD-0007`, `?tab=campaigns`.
