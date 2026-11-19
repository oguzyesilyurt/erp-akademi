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

Fatura kaydedildiğinde müşteri hesabında bir **açık kalem** oluşur. Vade tarihi ödeme koşulundan hesaplanır (Z030 → 30 gün). Vadesi geçmiş kalemler için **ihtar** (dunning) çalıştırılır; tahsil edilmeyen alacak kredi riskini büyütür.

## Maliyet ve kâr merkezi

- **Maliyet merkezi:** Gider topladığı yer (ör. Kemalpaşa depo maliyetleri, satış ekibi giderleri).
- **Kâr merkezi:** Gelir ve gideri birlikte izlenen sorumluluk alanı (ör. Gıda bölümü, Temizlik bölümü).

## Ege Dağıtım'dan örnek

Ödemiş Yöresel Gıda'ya kesilen 90000001 numaralı fatura (50.014,30 ₺) müşteri hesabında açık kalem oluşturdu. Ödeme koşulu Z000 (peşin) olduğu için vade fatura tarihidir. Uşak Kardeşler'de ise 184.300 ₺ vadesi geçmiş alacak var; bu yüzden müşteri bloke edildi ve muhasebe tahsilat görüşmesi yapıyor.

## İlgili işlem kodları ve Fiori uygulamaları

| Tür | Kod / Uygulama | Açıklama |
|---|---|---|
| T-code | `FS00` | Genel muhasebe hesabı ana verisi |
| T-code | `FB50` | Genel muhasebe kaydı girişi |
| T-code | `FB70` / `FB60` | Müşteri / tedarikçi faturası girişi (FI) |
| T-code | `F-28` | Gelen ödeme kaydı |
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
> [Müşteri listesinde](#/company/customers) açık bakiye ve vadesi geçmiş tutarları incele; [Aktarım Monitörü](#/interface) üzerinden bir siparişi faturalayıp açık bakiyenin nasıl değiştiğini gör.
