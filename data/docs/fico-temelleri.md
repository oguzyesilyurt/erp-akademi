## Amaç

FI (Finansal Muhasebe) ve CO (Maliyet Muhasebesi) arasındaki farkı, satış ve satın alma süreçlerinin muhasebeye nasıl yansıdığını ve alacak takibinin temel adımlarını öğrenmek.

## FI ve CO farkı

| | FI – Financial Accounting | CO – Controlling |
|---|---|---|
| Amaç | Yasal raporlama (bilanço, gelir tablosu) | Şirket içi yönetim raporlaması |
| Kime? | Vergi dairesi, denetçi, ortaklar | Yöneticiler |
| Temel nesneler | Genel muhasebe hesabı, müşteri, tedarikçi | Maliyet merkezi, kâr merkezi, iç sipariş |
| Organizasyon | Şirket kodu | Kontrol alanı (controlling area) |

S/4HANA'da FI ve CO kalemleri tek bir tabloda, **Universal Journal** (ACDOCA) içinde tutulur. Bu sayede ayrı mutabakat ihtiyacı büyük ölçüde ortadan kalkar.

## Alt defterler

- **Genel muhasebe (G/L):** Tüm hesapların toplandığı ana defter.
- **Alacak hesapları (AR):** Müşteri faturaları, tahsilatlar, ihtarlar.
- **Borç hesapları (AP):** Tedarikçi faturaları ve ödemeler.

Müşteri ve tedarikçi kayıtları G/L'ye **mutabakat hesabı** (reconciliation account) üzerinden bağlanır; her müşteri faturası otomatik olarak ilgili alacak mutabakat hesabına da yansır.

## Süreçlerin muhasebe etkisi

| Olay | Kaynak | Muhasebe kaydı (özet) |
|---|---|---|
| Mal çıkışı | SD teslimat | Satılan malın maliyeti (borç) / Stok (alacak) |
| Müşteri faturası | SD faturalama | Müşteri (borç) / Hasılat ve hesaplanan KDV (alacak) |
| Tahsilat | FI | Banka (borç) / Müşteri (alacak), açık kalem kapanır |
| Mal girişi | MM | Stok (borç) / GR/IR (alacak) |
| Tedarikçi faturası | MM fatura doğrulama | GR/IR ve indirilecek KDV (borç) / Tedarikçi (alacak) |

### Açık kalem ve vade

Fatura kaydedildiğinde müşteri hesabında bir **açık kalem** oluşur. Vade tarihi ödeme koşulundan hesaplanır (Z030 → 30 gün). Vadesi geçmiş kalemler için **ihtar** (dunning) çalıştırılır; tahsil edilmeyen alacak kredi riskini büyütür. Açık kalemler vadeden bu yana geçen güne göre **yaşlandırılır** (ör. 0–30, 31–60, 60+ gün).

### Tahsilat ve ödeme

- **Tahsilat (`F-28`):** Gelen ödeme müşterinin açık kalemleriyle **denkleştirilir**. Tutar yetmezse kalem kısmen kapanır. Açık bakiye düşer, kredi kullanımı iyileşir.
- **Ödeme programı (`F110`):** Vadesi bir sonraki çalıştırmadan önce gelen tedarikçi kalemleri önerilir. **Ödeme blokajlı** (ör. fatura doğrulamada R blokajı) kalemler hariç tutulur ve istisna listesinde nedeniyle görünür.

### Raporlar

**Mizan** tüm hesapların borç/alacak toplamlarını verir; toplam borç toplam alacağa eşittir. **Bilanço** varlıkları kaynaklarla (yabancı kaynak + özkaynak + dönem kârı) karşılaştırır; **gelir tablosu** net satıştan satışların maliyetini ve faaliyet giderlerini düşer.

## Maliyet ve kâr merkezi

- **Maliyet merkezi:** Gider topladığı yer (ör. Kemalpaşa depo maliyetleri, satış ekibi giderleri).
- **Kâr merkezi:** Gelir ve gideri birlikte izlenen sorumluluk alanı (ör. Gıda bölümü, Temizlik bölümü).
- **Kârlılık analizi (CO-PA):** Gelir − iskonto − satılan malın maliyeti = katkı payı; müşteri, segment, kanal, bölge ve ürün kırılımında raporlanır.

Ege Dağıtım'da maliyet merkezleri 4100 Satış, 4200 Depo ve Lojistik, 4300 Yönetim; kâr merkezleri PC01 Gıda ve PC02 Temizlik'tir.

> [!UYARI]
> Hesap kodları Tekdüzen Hesap Planı'na göre verilmiştir (102, 120, 153, 191, 320, 391, 600, 611, 621, 631, 632). Alt hesaplar, GR/IR karşılığı ve giderlerin 7/A veya 7/B seçeneğiyle izlenmesi şirkete göre değişebilir. Ayrıntılar: [Bir satışın muhasebe izi](#/docs/satisin-muhasebe-izi).

## Ege Dağıtım'dan örnek

Ödemiş Yöresel Gıda'ya kesilen 90000001 numaralı fatura (50.014,30 ₺) müşteri hesabında açık kalem oluşturdu. Ödeme koşulu Z000 (peşin) olduğu için vade fatura tarihidir. Uşak Kardeşler'de ise 184.300 ₺ vadesi geçmiş alacak var; bu yüzden müşteri bloke edildi ve muhasebe tahsilat görüşmesi yapıyor.

## İlgili işlem kodları ve Fiori uygulamaları

| Tür | Kod / Uygulama | Açıklama |
|---|---|---|
| T-code | `FS00` | Genel muhasebe hesabı ana verisi |
| T-code | `FB50` | Genel muhasebe kaydı girişi |
| T-code | `FB70` / `FB60` | Müşteri / tedarikçi faturası girişi (FI) |
| T-code | `F-28` | Gelen ödeme kaydı |
| T-code | `F110` | Otomatik ödeme programı |
| T-code | `FS10N` | Genel muhasebe hesabı bakiyeleri |
| T-code | `KSB1` | Maliyet merkezi fiili kalemleri |
| T-code | `KE30` | Kârlılık analizi raporu (CO-PA) |
| T-code | `F150` | İhtar (dunning) çalıştırma |
| T-code | `FBL5N` / `FBL1N` / `FBL3N` | Müşteri / tedarikçi / G/L kalemleri |
| T-code | `KS01` | Maliyet merkezi oluşturma |
| T-code | `KE51` | Kâr merkezi oluşturma |
| Fiori | Manage Customer Line Items | Müşteri açık/kapalı kalemleri |
| Fiori | Manage Supplier Line Items | Tedarikçi kalemleri |
| Fiori | Post General Journal Entries | Genel muhasebe kaydı |

> [!UYARI]
> S/4HANA'da bazı klasik raporların yerini Fiori uygulamaları alır; kullanılabilirlik sürüme göre değişir.

## Sık yapılan hatalar

- **Satış ekibinin vadeyi elle değiştirmesi:** Ödeme koşulu ana veriden gelmeli; elle değişiklik nakit planını bozar.
- **Tahsilatı yanlış faturaya eşlemek:** Açık kalem kapanmaz, müşteri ihtar alır.
- **CO nesnesi olmadan gider kaydetmek:** Maliyet merkezi raporları eksik kalır.

> [!DENE]
> [FI/CO çalışma alanında](#/track/s4-fico/simulation?tab=ar) müşteri açık kalemlerini yaşlandır ve tahsilat gir; ardından [Manisa Yıldız tahsilat senaryosunu](#/track/s4-fico/scenarios/manisa-tahsilat) uygula.
