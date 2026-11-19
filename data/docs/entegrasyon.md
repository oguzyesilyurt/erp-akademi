## Amaç

CRM ile ERP arasındaki veri akışının nasıl kurulduğunu, IDoc ve web servis kavramlarını ve hatalı mesajın nasıl izlenip yeniden işlendiğini öğrenmek.

## Neden entegrasyon?

CRM'de hazırlanan sipariş, ERP'de teslim edilip faturalanır. Müşteri, ürün ve fiyat ana verisi iki sistemde de tutarlı olmalıdır. Bu bilgileri sistemler arasında taşıyan katmana **entegrasyon** denir.

## Temel kavramlar

| Kavram | Açıklama |
|---|---|
| IDoc | SAP'nin standart ara belge biçimi (Intermediate Document) |
| Mesaj türü | IDoc'un iş anlamı: `ORDERS` (sipariş), `ORDRSP` (sipariş teyidi), `DESADV` (sevk bildirimi), `INVOIC` (fatura) |
| Web servis (SOAP / OData) | Gerçek zamanlıya yakın, servis tabanlı iletişim |
| Middleware | Mesajları dönüştüren ve yönlendiren ara katman (ör. SAP Integration Suite – Cloud Integration) |
| Senkron / asenkron | Cevabı beklenen (fiyat sorgusu) / kuyruğa atılıp sonra işlenen (sipariş aktarımı) |

### IDoc durumları

IDoc'un her işlem adımı bir **durum kodu** ile izlenir. Gelen (inbound) IDoc'ta sık görülenler:

| Durum | Anlamı |
|---|---|
| 64 | IDoc uygulamaya aktarılmaya hazır |
| 53 | Uygulama belgesi kaydedildi (başarılı) |
| 51 | Uygulama belgesi kaydedilmedi (hata) |

Giden (outbound) IDoc'ta **30** (gönderime hazır) ve **03** (veri porta aktarıldı) sık görülür.

## Hata izleme ve yeniden işleme

Hatalı mesajın çözüm sırası:

1. **Hatayı oku:** Monitörde durum ve hata metnine bak (ör. "Müşteri tanımlı değil").
2. **Kök nedeni düzelt:** Çoğu hata ana veri kaynaklıdır (eksik müşteri, satış alanı, stoksuz depo).
3. **Yeniden işle:** Mesaj, düzeltilmiş veriyle tekrar işlenir; yeni deneme olarak kaydedilir.
4. **Doğrula:** Uygulama belgesinin (sipariş) oluştuğunu ve belge akışına bağlandığını kontrol et.

> [!UYARI]
> Kök neden düzeltilmeden yeniden işlemek aynı hatayı tekrar üretir. Mesajı silmek veya yeniden göndermek yerine düzeltip yeniden işlemek, izlenebilirliği korur.

## Ege Dağıtım'dan örnek

Sipariş 10000001, CRM'den ERP'ye `ORDERS` mesajı (50000001) olarak gitti. Mesaj içeriğinde `soldTo` alanı boştu çünkü Ödemiş Yöresel Gıda ERP'de tanımlı değildi. Monitör mesajı "Hatalı" gösterdi. Key user Oğuz müşteriyi ERP'de 100009 numarasıyla açtı ve mesajı yeniden işledi; ikinci deneme başarılı oldu.

Sipariş 10000002'de ise Manisa deposunda zeytinyağı stoğu yoktu. Key user siparişin teslimat deposunu Kemalpaşa olarak düzeltip yeniden işledi.

## İlgili işlem kodları ve araçlar

| Tür | Kod / Araç | Açıklama |
|---|---|---|
| T-code | `WE02` / `WE05` | IDoc görüntüleme / IDoc listeleri |
| T-code | `BD87` | ALE/IDoc durum monitörü, yeniden işleme |
| T-code | `WE19` | IDoc test aracı |
| T-code | `WE20` | Ortak profilleri (partner profiles) |
| T-code | `SM58` | Asenkron RFC (tRFC) hata izleme |
| T-code | `SRT_MONI` | Web servis mesaj izleme |
| T-code | `/AIF/ERR` | Application Interface Framework hata yönetimi |
| Araç | SAP Integration Suite – Cloud Integration | Bulut entegrasyon akışları ve izleme |

## Sık yapılan hatalar

- **Ana veriyi tek sistemde güncellemek:** CRM'de değişen ödeme koşulu ERP'ye aktarılmazsa sipariş ve fatura farklı vade taşır.
- **Hatalı mesajları biriktirmek:** Bekleyen mesajlar teslimatları geciktirir; monitör günlük kontrol edilmelidir.
- **Test ortamında entegrasyonu atlamak:** UAT yalnızca tek sistemde yapılırsa canlıda arayüz hataları çıkar.

> [!DENE]
> [Aktarım Monitörü'nü aç](#/interface): hatalı bir mesajın JSON içeriğini, hata metnini ve yeniden işleme geçmişini incele.
