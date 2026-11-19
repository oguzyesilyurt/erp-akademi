## Amaç

SAP'de her stok hareketinin neden bir **hareket türü** taşıdığını, en sık kullanılan kodları, **malzeme belgesini** ve tesisler arası transferle depo yeri transferi arasındaki farkı öğrenmek.

## Hareket türü nedir?

Hareket türü, bir stok hareketinin ne olduğunu söyleyen üç haneli koddur. Sistem bu koda bakarak stoğun hangi stok türünde arttığını veya azaldığını, hangi alanların zorunlu olduğunu ve muhasebede hangi hesapların çalışacağını belirler. Mal girişi, mal çıkışı ve transfer kayıtları büyük ölçüde `MIGO` işlemiyle yapılır; teslimatın mal çıkışı ise satış tarafında teslimattan kaydedilir.

## En sık kullanılan hareket türleri

| Kod | Hareket | Stok etkisi |
|---|---|---|
| `101` | Satın alma siparişine (veya üretim siparişine) referanslı mal girişi | Stok artar, GR/IR açılır |
| `102` | 101'in ters kaydı (iptali) | Stok azalır |
| `122` | Tedarikçiye iade | Stok azalır, sipariş açık miktarı tekrar artar |
| `201` | Masraf yerine mal çıkışı | Stok azalır, gider yazılır |
| `261` | Siparişe (ör. üretim) mal çıkışı | Stok azalır |
| `301` | Tesisler arası transfer, tek adım | Bir tesiste azalır, diğerinde artar |
| `303` / `305` | Tesisler arası transfer, iki adım (çıkış / giriş) | Arada "yolda" stok oluşur |
| `311` | Aynı tesis içinde depo yerleri arası transfer, tek adım | Tesis toplamı değişmez |
| `321` | Kalite kontrol stoğundan serbest stoğa | Stok türü değişir |
| `344` / `343` | Serbest stoktan bloke stoğa / bloke stoktan serbest stoğa | Stok türü değişir |
| `551` | Hurdaya ayırma | Stok azalır, gider yazılır |
| `561` | Başlangıç stok girişi (veri aktarımı) | Stok artar |
| `601` | Teslimat için mal çıkışı (satış) | Stok azalır |

> [!INFO]
> Ters kayıt için çoğunlukla hareket türü bir artırılır: 101 → 102, 301 → 302, 601 → 602. Belge silinmez; iz kalması için karşı hareket kaydedilir.

## Malzeme belgesi

Her stok hareketi bir **malzeme belgesi** üretir: belge numarası, kayıt tarihi, hareket türü, malzeme, miktar, tesis ve (varsa) referans sipariş. Hareketin değer etkisi varsa ayrıca bir muhasebe belgesi oluşur. Bir malzemenin stok geçmişi malzeme belgelerinden okunur (`MB51`).

## Stok türleri

- **Serbest kullanılabilir:** Satılabilir ve tüketilebilir.
- **Kalite kontrolde:** Kontrol sonucu bekleyen stok; kullanılamaz.
- **Bloke:** Hasarlı veya şüpheli stok; kullanılamaz.

Sipariş edilmiş ama henüz teslim alınmamış miktar stok değildir. Stok genel bakışında (`MMBE`) sipariş edilen miktar olarak ayrıca izlenir. Bu simülasyonda **yolda** diye gösterilir.

## Tesisler arası mı, depo yerleri arası mı?

Ege Dağıtım'da 1100 Kemalpaşa ve 1200 Manisa iki ayrı **tesistir**. Kemalpaşa'dan Manisa'ya stok taşımak tesisler arası transferdir:

- **301 (tek adım):** Çıkış ve giriş aynı anda kaydedilir. Fiziksel taşıma kısa ve izlenmesi gerekmiyorsa kullanılır.
- **303 + 305 (iki adım):** Çıkış tesisi 303 ile malı gönderir, giriş tesisi 305 ile teslim alır. Arada mal "yolda" stoktur.
- Taşıma bir satın alma belgesiyle (stok nakil siparişi) yönetilecekse çıkış teslimatla yapılır (ör. 641) ve giriş 101 ile kaydedilir.

**311** ise aynı tesisin içindeki iki depo yeri arasında taşımadır (ör. 1100 tesisinde ana depodan sevkiyat alanına). Tesis toplam stoğu değişmez.

## Ege Dağıtım'dan örnek

Manisa Yıldız Dağıtım'ın zeytinyağı siparişi Manisa'dan (1200) teslim edilecek ama Manisa'da GD-1002 stoğu 0. Sipariş ERP aktarımında "Depoda kullanılabilir stok yok" hatası aldı. Mehmet Kemalpaşa'dan 20 koliyi **301** ile Manisa'ya aktardı. Malzeme belgesinde iki satır oluştu: 1100'den −20, 1200'e +20. Key user mesajı yeniden işledi, sipariş ERP'ye aktarıldı ve teslimatın mal çıkışı (601) Manisa stoğunu 15'e düşürdü.

## İlgili işlem kodları ve Fiori uygulamaları

| Tür | Kod / Uygulama | Açıklama |
|---|---|---|
| T-code | `MIGO` | Mal girişi, mal çıkışı, transfer kaydı |
| T-code | `MB51` | Malzeme belgesi listesi |
| T-code | `MMBE` | Stok genel bakış |
| T-code | `MB5B` | Kayıt tarihine göre stok |
| Fiori | Post Goods Movement | Mal hareketi kaydı |
| Fiori | Stock – Single Material | Tek malzeme stok görünümü |
| Fiori | Transfer Stock – Cross-Plant | Tesisler arası transfer |

> [!UYARI]
> Hareket türleri yapılandırılabilir; kurumlar kendi kodlarını (9xx, Zxx) tanımlayabilir. Tablodaki kodlar SAP standardıdır. Fiori uygulama adları sürüme göre değişebilir.

## Sık yapılan hatalar

- **Tesisler arası taşımada 311 kullanmak:** 311 tesis içidir; tesisler arası taşıma 301 veya 303/305 ile yapılır.
- **Yanlış girişi silmeye çalışmak:** Malzeme belgesi silinmez; ters hareket (ör. 102) kaydedilir.
- **Siparişsiz mal girişi:** 101'i siparişe referans vermeden yapmak üç yönlü eşleştirmeyi bozar.
- **Bloke stoğu satılabilir sanmak:** Serbest stok ile toplam stok aynı şey değildir.

> [!DENE]
> [Zeytinyağı transfer senaryosunu](#/track/s4-mm/scenarios/zeytinyagi-transfer) uygula; ardından [Transfer sekmesinde](#/track/s4-mm/simulation?tab=transfer) 301 kaydını incele.
