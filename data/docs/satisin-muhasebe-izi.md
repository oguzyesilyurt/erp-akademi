## Amaç

Bir satışın tekliften tahsilata kadar hangi muhasebe belgelerini ürettiğini, her belgenin Tekdüzen Hesap Planı'ndaki karşılığını ve bu kayıtların mizan, bilanço ve gelir tablosuna nasıl yansıdığını adım adım izlemek. Satın alma tarafındaki GR/IR ara hesabını da aynı mantıkla anlamak.

## Kim kayıt yapar?

Satış temsilcisi, depocu veya satın almacı hesap kodu seçmez. SAP, işlem türüne göre hesabı **otomatik hesap belirleme** ile bulur. Satış gelir hesapları `VKOA` ile, stok hareketlerinin hesapları `OBYC` ile yapılandırılır. Muhasebe ekibi bu kuralları bir kez kurar; günlük işlemde kayıtlar kendiliğinden oluşur. Her belge borç toplamı = alacak toplamı kuralına uyar.

## Satış: teklif ve sipariş muhasebe kaydı üretmez

Teklif ve satış siparişi değer taşır ama muhasebe kaydı oluşturmaz; henüz bir varlık veya borç değişmemiştir. İlk kayıt malın depodan çıktığı anda oluşur.

## 1. Teslimat: mal çıkışı (WA)

| Hesap | Borç | Alacak |
|---|---|---|
| 621 Satılan Ticari Mallar Maliyeti | 11.700 ₺ | |
| 153 Ticari Mallar | | 11.700 ₺ |

10 koli ayçiçek yağı × 1.170 ₺ standart maliyet. Stok değeri azalır, maliyet gider olarak yazılır. Hareket türü 601'dir.

## 2. Satış faturası (RV)

| Hesap | Borç | Alacak |
|---|---|---|
| 120 Alıcılar | 16.725,60 ₺ | |
| 611 Satış İskontoları (−) | 1.440,00 ₺ | |
| 600 Yurt İçi Satışlar | | 18.000,00 ₺ |
| 391 Hesaplanan KDV | | 165,60 ₺ |

Liste fiyatı 600'e, segment iskontosu (K007 %8) 611'e yazılır. KDV %1 (temel gıda). Müşteri hesabında 16.725,60 ₺ tutarında bir **açık kalem** oluşur; vadesi ödeme koşulundan (Z030 → 30 gün) hesaplanır.

> [!INFO]
> Fatura içi iskontoyu ayrı hesapta (611) izlemek brüt satışı ve iskonto politikasını görünür kılar. Bazı şirketler fatura altı iskontoyu doğrudan net satış olarak 600'e yazar. Bu tercih şirkete göre değişebilir.

## 3. Tahsilat (DZ)

| Hesap | Borç | Alacak |
|---|---|---|
| 102 Bankalar | 16.725,60 ₺ | |
| 120 Alıcılar | | 16.725,60 ₺ |

Tahsilat açık kalemi **denkleştirir** (`F-28`). Açık bakiye düşer; kredi kullanımı iyileşir. Tutar eksikse kalem kısmen kapanır.

## Satın alma tarafı: GR/IR ara hesabı

Satın almada mal ile fatura farklı günlerde gelir. SAP bu zaman farkını **GR/IR** (mal girişi / fatura girişi) ara hesabıyla yönetir:

| Olay | Borç | Alacak |
|---|---|---|
| Mal girişi 101 (WE) | 153 Ticari Mallar | GR/IR |
| Tedarikçi faturası (RE) | GR/IR · 191 İndirilecek KDV | 320 Satıcılar |
| Ödeme (KZ) | 320 Satıcılar | 102 Bankalar |

Mal girildi ama fatura gelmediyse GR/IR'nin alacak bakiyesi "faturası beklenen mal" borcunu gösterir. Fatura gelip eşleştiğinde kapanır. Fatura fiyatı sipariş fiyatından farklıysa fark stok değerine (veya fiyat farkı hesabına) yazılır.

> [!UYARI]
> Tekdüzen Hesap Planı'nda GR/IR için standart bir hesap yoktur. Şirketler genellikle kısa vadeli ticari borçlar grubunda bir hesap veya alt hesap tanımlar. Bu simülasyonda **329 Diğer Ticari Borçlar** kullanılmıştır; şirketinizdeki eşleştirme farklı olabilir.

## Mizan, bilanço ve gelir tablosu

- **Mizan:** Her hesabın borç ve alacak toplamı. Örnekteki satış 120, 600, 611, 391, 621 ve 153 bakiyelerini değiştirir. Toplam borç = toplam alacak.
- **Gelir tablosu:** Brüt satış (600) − satış iskontoları (611) = net satış; − SMM (621) = brüt satış kârı; − faaliyet giderleri (631, 632) = faaliyet kârı. Örnek satış brüt kârı 16.560 − 11.700 = 4.860 ₺ artırır.
- **Bilanço:** Varlıklar (102, 120, 153, 191) = yabancı kaynaklar (320, GR/IR, 391) + özkaynak (500 + dönem kârı).

> [!IPUCU]
> Bu simülasyonda giderler sadeleştirilerek doğrudan 631 ve 632'ye yazılır. Tekdüzen Hesap Planı'nda giderler 7/A veya 7/B seçeneğine göre önce 7 grubunda toplanıp gelir tablosu hesaplarına yansıtılabilir.

## Ege Dağıtım'dan örnek

Karşıyaka Gıda'ya 10 koli ayçiçek yağı satıldı. Mehmet teslimatı kaydedince 621/153 kaydı oluştu. Gökhan faturayı kesince 120/611/600/391 kaydı oluştu; belge akışında iki "Muhasebe belgesi" düğümü göründü. Mizanda 600 alacak bakiyesi 18.000 ₺, 611 borç bakiyesi 1.440 ₺ arttı. Gelir tablosunda brüt kâr 4.860 ₺ büyüdü. 30 gün sonra Karşıyaka ödeme yaptığında 102/120 kaydıyla açık kalem kapanacak.

## İlgili işlem kodları ve Fiori uygulamaları

| Tür | Kod / Uygulama | Açıklama |
|---|---|---|
| T-code | `FB03` | Muhasebe belgesini görüntüleme |
| T-code | `FS10N` | Hesap bakiyeleri |
| T-code | `FBL3N` / `FBL5N` / `FBL1N` | Genel muhasebe / müşteri / tedarikçi kalemleri |
| T-code | `VKOA` | Satış gelir hesap belirleme (Customizing) |
| T-code | `OBYC` | Stok hareketleri hesap belirleme (Customizing) |
| T-code | `F-28` / `F110` | Gelen ödeme / otomatik ödeme programı |
| Fiori | Display Financial Statement | Bilanço ve gelir tablosu |
| Fiori | Display G/L Account Balances | Hesap bakiyeleri (mizan görünümü) |

> [!UYARI]
> Fiori uygulama adları ve kapsamı S/4HANA sürümüne göre değişebilir. Hesap kodları ve kullanımları şirkete göre değişebilir.

## Sık yapılan hatalar

- **Teklif veya siparişte kayıt beklemek:** Muhasebe etkisi mal çıkışı ve faturayla başlar.
- **GR/IR bakiyesini izlememek:** Faturası gelmeyen veya fiyatı tutmayan mallar ay sonunda açıklanamayan bakiye bırakır.
- **İskontoyu kaybetmek:** İskonto net satışa gömülürse iskonto politikasının maliyeti görünmez.
- **Mizan dengesini doğruluk sanmak:** Yanlış hesaba yapılan kayıt da mizanı dengede tutar.

> [!DENE]
> [Satış faturasından mizana iz sür](#/track/s4-fico/scenarios/faturadan-mizana) senaryosunu uygula; ardından [muhasebe belgelerini](#/track/s4-fico/simulation?tab=journal) incele.
