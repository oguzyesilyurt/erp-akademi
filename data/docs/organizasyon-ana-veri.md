## Amaç

SAP'de bir şirketin nasıl modellendiğini (organizasyon birimleri) ve süreçlerin üzerinde çalıştığı ana veriyi (Business Partner, malzeme, fiyat) öğrenmek.

## Organizasyon birimleri

SAP'de her işlem bir organizasyon biriminde gerçekleşir. Bu birimler proje başında **Customizing** (`SPRO`) içinde bir kez tanımlanır ve sonradan değiştirilmesi zordur.

| Birim | Tanım | Ege Dağıtım |
|---|---|---|
| Mandant (Client) | Sistemdeki bağımsız veri alanı | Üretim mandantı |
| Şirket kodu | Yasal bilanço çıkaran en küçük birim | 1000 Ege Dağıtım A.Ş. |
| Satış organizasyonu | Satıştan ve fiyatlandırmadan sorumlu birim | 1000 Ege Satış Organizasyonu |
| Dağıtım kanalı | Ürünün müşteriye ulaşma yolu | 10 Bayi, 20 Kurumsal, 30 E-ticaret |
| Bölüm (Division) | Ürün grubu sorumluluğu | 01 Gıda, 02 Temizlik |
| Üretim yeri / tesis (Plant) | Stok tutulan, mal hareketi yapılan yer | 1100 Kemalpaşa, 1200 Manisa |
| Satın alma organizasyonu | Tedarikçilerle pazarlık eden birim | 1000 Merkez Satın Alma |

### Satış alanı

**Satış organizasyonu + dağıtım kanalı + bölüm** üçlüsüne **satış alanı** denir. Müşteri, satış alanı bazında açılır. Aynı müşteri bayi kanalında farklı, e-ticaret kanalında farklı ödeme koşuluna sahip olabilir.

## Ana veri

Ana veri, işlemlerde tekrar tekrar kullanılan ve nadiren değişen kayıtlardır. Teklif, sipariş ve fatura gibi **hareket verisi** ana veriden beslenir.

### Business Partner (BP)

S/4HANA'da müşteri ve tedarikçi tek bir nesnede tutulur: **Business Partner**. Bir BP'nin farklı **rolleri** olabilir (ör. müşteri rolü, tedarikçi rolü). Genel veriler (ad, adres, vergi no) bir kez girilir; satış alanı verileri (ödeme koşulu, fiyat grubu, teslimat önceliği) ve şirket kodu verileri (mutabakat hesabı) rollere göre eklenir.

> [!INFO]
> ECC'deki `XD01` ve `XK01` gibi müşteri/tedarikçi işlem kodları S/4HANA'da `BP` işlemine yönlendirilir. Bu dönüşüme **Customer/Vendor Integration (CVI)** denir.

### Malzeme ana verisi

Malzeme (S/4HANA'da "ürün") kaydı **görünümlerden** oluşur: temel veri, satış, satın alma, muhasebe, depo. Satış görünümü satış alanı bazında, muhasebe görünümü tesis bazında tutulur.

## Ege Dağıtım'dan örnek

Bornova Market Zinciri (100002) Kurumsal kanalda (20) A segmentinde, 45 gün vadelidir. Aynı firma ileride e-ticaret kanalında da alım yapmak isterse, BP'ye yeni bir satış alanı (1000/30/01-02) eklenir; genel veriler tekrar girilmez.

Ödemiş Yöresel Gıda henüz CRM'de aday müşteridir; ERP'de BP kaydı olmadığı için sipariş ERP'ye aktarılamaz. Key user BP'yi açtığında müşteri numarası atanır.

## İlgili işlem kodları ve Fiori uygulamaları

| Tür | Kod / Uygulama | Açıklama |
|---|---|---|
| T-code | `SPRO` | Customizing (uyarlama) kılavuzu |
| T-code | `OX02` | Şirket kodu tanımı (Customizing) |
| T-code | `OX10` | Tesis (plant) tanımı (Customizing) |
| T-code | `OVX5` | Satış organizasyonu tanımı (Customizing) |
| T-code | `BP` | Business Partner oluşturma / değiştirme |
| T-code | `MM01` / `MM02` / `MM03` | Malzeme oluşturma / değiştirme / görüntüleme |
| Fiori | Manage Business Partner Master Data | BP kayıtlarını yönetir |
| Fiori | Manage Product Master Data | Ürün kayıtlarını yönetir |

## Sık yapılan hatalar

- **Mükerrer BP açmak:** Vergi numarasıyla arama yapmadan yeni kayıt açmak raporları ve kredi limitini böler.
- **Satış alanını eksik açmak:** Müşteri bayi kanalında açıkken kurumsal kanaldan sipariş girilemez.
- **Organizasyon yapısını canlıdan sonra değiştirmeye çalışmak:** Şirket kodu veya satış organizasyonu değişikliği geçmiş belgeleri etkiler; tasarım Explore fazında netleştirilmelidir.

> [!DENE]
> [Şirket sayfasında organizasyon yapısını incele](#/company/org), ardından [müşteri listesinde](#/company/customers) satış alanı ve ERP müşteri numarası alanlarına bak.
