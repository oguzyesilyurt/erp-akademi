## Amaç

SAP'nin bulut CRM çözümünde (SAP Sales Cloud, eski adıyla SAP Cloud for Customer / C4C) satış sürecinin nasıl yürüdüğünü ve ERP ile nasıl buluştuğunu öğrenmek.

## SAP Sales Cloud (C4C) nedir?

**SAP Cloud for Customer (C4C)**, SAP'nin bulut tabanlı müşteri ilişkileri yönetimi ürünüdür. Bugün satış tarafı **SAP Sales Cloud**, servis tarafı **SAP Service Cloud** adıyla sunulur. Saha satış ekibinin günlük işi (ziyaret, fırsat, teklif) burada yürür; sipariş, teslimat ve fatura ise ERP'de (SAP S/4HANA veya ECC) gerçekleşir.

## Temel nesneler

| Nesne | İngilizce | Açıklama |
|---|---|---|
| Hesap | Account | Müşteri şirket. ERP'deki Business Partner ile eşleşir |
| İlgili kişi | Contact | Hesaba bağlı kişi (satın almacı, muhasebeci) |
| Lead | Lead | Nitelendirilmemiş ilgi |
| Fırsat | Opportunity | Tutarı, olasılığı ve aşaması olan satış ihtimali |
| Satış teklifi | Sales Quote | Müşteriye sunulan fiyat belgesi |
| Ziyaret / aktivite | Visit / Activity | Müşteriyle yapılan görüşmeler |

## Satış akışı

1. **Lead** kaydı açılır (fuar, web formu, telefon).
2. Lead nitelendirilir ve **fırsata** dönüştürülür.
3. Fırsat aşamaları ilerledikçe **teklif** hazırlanır.
4. Teklif kabul edilince **satış siparişi** oluşturulur ve ERP'ye aktarılır (veya doğrudan ERP'de açılır).

### ERP ile entegrasyon noktaları

- **Hesap ve ürün ana verisi** ERP'den CRM'e (veya iki yönlü) aktarılır.
- **Fiyat** çoğu kurulumda ERP'deki koşul tekniğinden hesaplanır; CRM teklif sırasında ERP'ye fiyat sorgusu yapabilir.
- **Kredi ve stok kontrolü** ERP'de yapılır; sonuç CRM'e döner.
- **Sipariş ve belge durumu** (teslimat, fatura) ERP'den CRM'e yansıtılır.

> [!INFO]
> C4C ile S/4HANA arasındaki standart entegrasyon genellikle SAP Integration Suite (Cloud Integration) üzerinden, hazır entegrasyon paketleriyle kurulur. Ayrıntılar için [CRM–ERP entegrasyonu](#/docs/entegrasyon) makalesine bak.

## Ege Dağıtım'dan örnek

Bölge bayi toplantısında tanışılan Ödemiş Yöresel Gıda, Denel tarafından **lead** olarak açıldı. Nitelendirme görüşmesinden sonra 1,8 milyon ₺ yıllık tahmini hacimle **fırsat** oluştu. İlk deneme teklifi CRM'de hazırlandı. Ancak firma ERP'de henüz Business Partner olarak açılmadığı için siparişe dönüşte aktarım hatası alındı. Key user müşteriyi ERP'de açınca süreç devam etti.

## İlgili işlemler ve uygulamalar

| Sistem | İşlem / Uygulama | Açıklama |
|---|---|---|
| Sales Cloud | Customers > Accounts | Hesap kayıtları |
| Sales Cloud | Sales > Leads | Lead listesi ve nitelendirme |
| Sales Cloud | Sales > Opportunities | Fırsatlar ve satış hunisi |
| Sales Cloud | Sales > Sales Quotes | Teklifler |
| S/4HANA | `VA21` / `VA22` / `VA23` | ERP'de teklif oluşturma / değiştirme / görüntüleme |
| S/4HANA | `BP` | Hesabın ERP'deki Business Partner karşılığı |

> [!UYARI]
> Sales Cloud menü adları kuruluma ve sürüme göre farklılık gösterebilir. Tabloda SAP'nin standart iş merkezi adlarına yakın adlar kullanılmıştır.

## Sık yapılan hatalar

- **Lead ile fırsatı karıştırmak:** Nitelendirilmemiş her ilgiyi fırsat açmak satış hunisini şişirir.
- **Hesabı CRM'de açıp ERP'yi unutmak:** Sipariş aşamasında aktarım hatası olarak geri döner.
- **Fiyatı CRM'de elle girmek:** ERP koşullarıyla tutarsız teklifler müşteri şikayetine yol açar.

> [!DENE]
> [Yeni bayi fırsatı senaryosunu](#/track/b2b-crm/scenarios/yeni-bayi) adım adım incele.
