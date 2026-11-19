## Amaç

SD'de fiyatın nasıl hesaplandığını (koşul tekniği) ve kredi yönetiminin siparişi nasıl etkilediğini anlamak; Ege Dağıtım'daki PR00 → K007 → ZKMP → KDV zincirini SAP kavramlarıyla eşleştirmek.

## Koşul tekniği

SAP'de fiyat, **koşul tekniği** (condition technique) ile hesaplanır. Yapı taşları:

| Kavram | Açıklama |
|---|---|
| Koşul türü | Fiyatın bir bileşeni: fiyat, iskonto, navlun, vergi |
| Koşul kaydı | Belirli bir anahtar için değer (ör. "GD-1001 için 1.800 ₺") |
| Koşul tablosu | Koşul kaydının hangi alanlara göre tutulduğu (malzeme, müşteri + malzeme…) |
| Erişim sırası | Sistemin koşul kaydını hangi tablolarda, hangi sırayla arayacağı |
| Fiyatlandırma şeması | Koşul türlerinin hangi sırayla uygulanacağı, ara toplamlar |

Sipariş girildiğinde sistem fiyatlandırma şemasındaki her koşul türü için erişim sırasını izler, ilk bulduğu geçerli koşul kaydını uygular.

### Ege Dağıtım'ın fiyat zinciri

| Adım | Koşul | Açıklama |
|---|---|---|
| 1 | PR00 | Liste fiyatı (malzeme bazında) |
| 2 | K007 | Müşteri iskontosu – Ege Dağıtım'da segmente göre A %8, B %5, C %2 |
| 3 | ZKMP | Kampanya iskontosu – müşteriye özel koşul türü ("Z" ile başlayanlar şirkete özeldir) |
| 4 | KDV | Net tutar üzerinden vergi |

> [!INFO]
> PR00 ve K007, SAP'nin klasik standart koşul türleridir. Birçok S/4HANA sisteminde standart fiyat koşulu **PPR0** olarak gelir; şirketler mevcut tasarımlarına göre PR00'ı kullanmaya devam edebilir. "Z" veya "Y" ile başlayan koşul türleri müşteriye özel tanımlardır.

İskontolar toplanmaz, sırayla uygulanır. A segmentinde kampanyalı bir üründe toplam iskonto 1 − (0,92 × 0,90) = **%17,2** olur.

## Kredi yönetimi

Kredi yönetimi, müşterinin ödenmemiş borcunun bir sınırı aşmasını engeller. S/4HANA'da bu işlev **SAP Credit Management** (FIN-FSCM-CR) ile yürür:

- Her müşterinin **kredi segmenti** bazında bir **kredi limiti** vardır.
- **Kredi riski toplamı (exposure)**: açık alacaklar + teslim edilmemiş siparişler + faturalanmamış teslimatlar.
- Sipariş kaydedilirken exposure + yeni sipariş limiti aşıyorsa sipariş **kredi blokajına** düşer; teslimat oluşturulamaz.
- Blokajı yetkili kredi yöneticisi kaldırır (onaylar veya reddeder).

> [!IPUCU]
> Kredi blokajı satış ekibinin değil finansın kararıdır. Ege Dağıtım'da bu yüzden kredi onayı yalnızca muhasebe rolündedir (CREDIT_RELEASE).

## Ege Dağıtım'dan örnek

Bornova Market Zinciri'nin kredi limiti 2.500.000 ₺, açık bakiyesi 2.180.000 ₺. Kampanyalı büyük teklif (KDV dahil 343.785,60 ₺) eklendiğinde toplam 2.523.785,60 ₺ olur ve limit aşılır. Teklif önce müdür onayına (iskonto %17,2), ardından muhasebenin kredi onayına gider.

Manisa Yıldız Dağıtım ise zaten %108 kullanımda; yeni sipariş muhasebe tahsilat planı olmadan sevk edilemez.

## İlgili işlem kodları ve Fiori uygulamaları

| Tür | Kod / Uygulama | Açıklama |
|---|---|---|
| T-code | `VK11` / `VK12` / `VK13` | Koşul kaydı oluşturma / değiştirme / görüntüleme |
| T-code | `UKM_BP` | SAP Credit Management: iş ortağı kredi verileri |
| T-code | `VKM1` | Kredi nedeniyle bloke SD belgeleri listesi ve serbest bırakma |
| T-code | `VA02` | Siparişte fiyat analizini ve kredi durumunu görme |
| Fiori | Manage Prices – Sales | Satış fiyat koşullarını yönetir |
| Fiori | Manage Credit Accounts | Müşteri kredi hesaplarını izler |

> [!UYARI]
> Kredi yönetimi kurulumları şirkete göre farklılık gösterir; ECC'de klasik SD kredi yönetimi, S/4HANA'da SAP Credit Management kullanılır. Fiori uygulama adları sürüme göre değişebilir.

## Sık yapılan hatalar

- **İskontoları toplamak:** %8 + %10 = %18 değil, sırayla uygulandığı için %17,2'dir.
- **Kampanya koşul kaydının geçerlilik tarihini atlamak:** Teklif geçerliliği kampanya bitişini aşarsa müşteri kampanya bitince de aynı fiyatı talep eder.
- **Kredi blokajını satış tarafında "çözmeye" çalışmak:** Limit değişikliği finans yetkisindedir.

> [!DENE]
> [Kampanyalı teklif senaryosunu simülasyonda aç](#/track/b2b-crm/simulation?scenario=kampanyali-teklif), ardından [limit aşımındaki müşteri senaryosunu](#/track/b2b-crm/scenarios/limit-asimi) incele.
