## Amaç

Order-to-Cash (O2C) sürecini teklif aşamasından tahsilata kadar adım adım izlemek; her adımda hangi belgenin oluştuğunu ve belge akışının nasıl okunduğunu öğrenmek.

## O2C nedir?

Order-to-Cash, bir müşteri talebinin paraya dönüştüğü uçtan uca satış sürecidir. SAP'de bu süreç büyük ölçüde **SD** (Sales and Distribution) modülünde yürür ve faturadan sonra **FI** (alacak hesapları) devreye girer.

## Adımlar ve belgeler

| Adım | Belge | Ne olur? |
|---|---|---|
| 1. Teklif | Teklif (Quotation) | Fiyat ve koşullar müşteriye sunulur |
| 2. Sipariş | Satış siparişi | Müşteri talebi kesinleşir; fiyat, kredi ve stok kontrolü yapılır |
| 3. Teslimat | Çıkış teslimatı (Outbound Delivery) | Toplama, ambalajlama ve sevkiyat planlanır |
| 4. Mal çıkışı | Mal hareketi belgesi | Stok düşer, satılan malın maliyeti muhasebeleşir |
| 5. Faturalama | Fatura belgesi (Billing Document) | Müşteriye fatura kesilir, alacak oluşur |
| 6. Tahsilat | Muhasebe belgesi | Ödeme alınır, açık kalem kapatılır |

### Satış siparişi

Sipariş girilirken sistem otomatik olarak:

- **Fiyatı** koşul tekniğiyle hesaplar (bkz. [Fiyatlandırma ve kredi](#/docs/sd-fiyat-kredi)).
- **Kredi kontrolü** yapar; limit aşılırsa siparişi bloke edebilir.
- **Kullanılabilirlik kontrolü** (ATP) yapar; istenen tarihte stok yoksa teyit tarihini kaydırır.

### Teslimat ve mal çıkışı

Teslimat, siparişe referansla oluşturulur. Depo malı toplar; **mal çıkışı** (Post Goods Issue) kaydedildiği anda stok düşer ve muhasebe kaydı oluşur. Mal çıkışı yapılmamış teslimat faturalanmaz.

### Faturalama ve alacak

Fatura kaydedildiğinde muhasebede müşteri hesabına borç, hasılat ve hesaplanan KDV hesaplarına alacak kaydı oluşur. Bu kayıt müşterinin **açık kalemidir**; ödeme koşuluna göre vade tarihi hesaplanır.

## Belge akışı

Her SD belgesi bir öncekine referansla oluşur. SAP'de herhangi bir belgede **belge akışı** (Document Flow) açıldığında teklif → sipariş → teslimat → mal çıkışı → fatura → muhasebe belgesi zinciri görülür. Müşteri "bu fatura hangi siparişe ait?" diye sorduğunda cevap buradan bulunur.

## Ege Dağıtım'dan örnek

Ödemiş Yöresel Gıda'nın ilk siparişi:

1. Teklif 20000001 (net 48.118 ₺) eşiklerin altında olduğu için onaysız kaydedildi.
2. Sipariş 10000001 oluşturuldu; müşteri sipariş no ODM-2026-001, istenen teslim 26.11.2026.
3. Aktarım ilk denemede "Müşteri ERP'de tanımlı değil" hatası verdi; key user müşteriyi açtıktan sonra yeniden işlendi.
4. Teslimat 80000001 ile Kemalpaşa deposundan mal çıktı; ayçiçek yağı stoğu 1.840'tan 1.830 koliye düştü.
5. Fatura 90000001 (50.014,30 ₺) kesildi; müşterinin açık bakiyesi bu tutar kadar arttı.

## İlgili işlem kodları ve Fiori uygulamaları

| Tür | Kod / Uygulama | Açıklama |
|---|---|---|
| T-code | `VA21` / `VA23` | Teklif oluşturma / görüntüleme |
| T-code | `VA01` / `VA02` / `VA03` | Satış siparişi oluşturma / değiştirme / görüntüleme |
| T-code | `VA05` | Satış siparişi listesi |
| T-code | `VL01N` | Siparişe referansla çıkış teslimatı oluşturma |
| T-code | `VL02N` | Teslimatı değiştirme, mal çıkışı kaydetme |
| T-code | `VF01` / `VF03` | Fatura oluşturma / görüntüleme |
| T-code | `VF04` | Faturalama vade listesi (toplu faturalama) |
| T-code | `F-28` | Gelen ödeme kaydı |
| Fiori | Manage Sales Orders | Siparişleri listeler, belge akışını gösterir |
| Fiori | Manage Outbound Deliveries | Teslimatları ve mal çıkışını yönetir |
| Fiori | Create Billing Documents | Faturalanacak belgelerden fatura oluşturur |

> [!UYARI]
> Fiori uygulama adları ve kapsamı S/4HANA sürümüne göre değişebilir.

## Sık yapılan hatalar

- **Mal çıkışını unutmak:** Teslimat oluşturulur ama mal çıkışı kaydedilmezse fatura kesilemez, stok yanlış görünür.
- **Siparişi referanssız açmak:** Tekliften kopyalanmayan sipariş belge akışını koparır, teklif fiyatları kaybolur.
- **Bloke siparişi fark etmemek:** Kredi blokajındaki sipariş teslimata düşmez; müşteri beklemeye devam eder.

> [!DENE]
> [Yeni bayinin ilk siparişi senaryosunu](#/track/b2b-crm/scenarios/yeni-bayi-siparis) uygula: teklif, sipariş, aktarım, teslimat ve fatura adımlarını farklı rollerle yürüt.
