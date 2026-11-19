## Amaç

SAP Sales Cloud'da (C4C) bir ilginin lead olarak nasıl kaydedildiğini, BANT ile nasıl nitelendirildiğini ve tek adımda hesap, ilgili kişi ve fırsata nasıl dönüştürüldüğünü öğrenmek; fırsatı aşama, olasılık ve kapanış verisiyle doğru yönetmek.

## Lead: henüz satış değil, ilgi

**Lead**, satışa dönüşüp dönüşmeyeceği bilinmeyen ilgidir: fuarda bırakılan kartvizit, web formu, kampanya yanıtı, mevcut müşterinin tavsiyesi. Lead'in iki temel özelliği vardır:

- **Kaynak** (fuar, web, kampanya, referans): pazarlama bütçesinin nereye yazılacağını belirler.
- **Sıcaklık** (C4C'de *qualification level*: sıcak / ılık / soğuk): satışın hangi lead'e önce döneceğini belirler.

> [!INFO]
> Nitelendirilmemiş her ilgiyi fırsat olarak açmak huniyi şişirir ve tahmini bozar. Lead ayrı bir nesnedir; ancak nitelendirildikten sonra fırsata dönüşür.

## BANT ile nitelendirme

| Harf | Soru | Ege Dağıtım örneği |
|---|---|---|
| **B**udget (Bütçe) | Bu alım için bütçe var mı? | Salihli Gross: yıllık tedarik bütçesi onaylı |
| **A**uthority (Yetki) | Görüştüğümüz kişi karar verebilir mi? | Satın Alma Müdürü Burak Yalçın |
| **N**eed (İhtiyaç) | Ürünlerimizle karşılanacak somut ihtiyaç var mı? | Aralık'ta açılan iki yeni şube |
| **T**imeline (Zaman) | Ne zaman satın alacaklar? | Aralık |

Dördü de karşılanan lead **nitelikli**dir. Eksik olan madde, bir sonraki görüşmenin gündemidir. Kalıcı bir engel varsa (ihale zorunluluğu, kredi riski, hizmet bölgesi dışı) lead **gerekçeyle reddedilir**. Gerekçe raporlanır; aynı neden sık tekrarlıyorsa kampanyanın hedeflemesi yanlıştır.

> [!UYARI]
> BANT bir kontrol listesidir, sihirli formül değildir. Bazı kurumlar "3/4 yeterli" der. Bu simülasyonda dönüştürme için dördü de zorunludur ki her eksik madde görünür olsun.

## Tek tıkla dönüştürme

Nitelikli lead'de **Dönüştür** dendiğinde:

1. Şirket yeni ise **hesap** açılır (aday hesap: ERP'de henüz müşteri numarası yoktur).
2. Lead'deki kişi hesaba **ilgili kişi** olarak eklenir.
3. Lead'in kaynağı, kampanyası ve tahmini değeri taşınarak **fırsat** oluşur.

Lead mevcut bir hesaba aitse (ör. kampanyadan gelen mevcut müşteri), yalnızca fırsat ve gerekiyorsa ilgili kişi oluşur.

## Fırsatı yönetmek

| Alan | Neden önemli? |
|---|---|
| Aşama | Satış döngüsündeki yer. Keşif → İhtiyaç analizi → Teklif → Pazarlık → Kazanıldı / Kaybedildi |
| Olasılık | Aşamadan varsayılan gelir (%10, %25, %50, %75). Temsilci gerekçeyle düzeltir |
| Beklenen tutar | Tahminin temeli; teklif onaylanınca teklif tutarıyla güncellenir |
| Kapanış tarihi | Tahminin hangi aya yazılacağını belirler |
| Rakip | Kayıp analizinin ilk sorusu: kime kaybettik? |
| Kayıp nedeni | Kaybedildi'de zorunlu; boş kalırsa analiz yapılamaz |

Fırsat **Teklif** aşamasına gelince teklif fırsattan oluşturulur. Teklif onaylanırsa tutar kesinleşir ve fırsat **Pazarlık**'a geçer. Tekliften sipariş oluşunca fırsat **Kazanıldı** olur. C4C'de teklif ve sipariş, fırsatın *takip belgeleri* olarak görünür. Böylece hangi fırsatın hangi siparişi getirdiği izlenebilir.

## Ege Dağıtım'dan örnek

Salihli Gross Market, Manisa Yıldız Dağıtım'ın tavsiyesiyle geldi (kaynak: Referans). Denel görüşmede dört BANT maddesini de doğruladı ve lead'i dönüştürdü. Sistem "Salihli Gross Market" aday hesabını, Burak Yalçın'ı ilgili kişi olarak ve 210.000 ₺'lik fırsatı tek adımda açtı. Teklif onaylandığında hesap hâlâ adaydı. Key user hesabı ERP'de açmadan sipariş aktarılamadı.

## İlgili işlemler ve uygulamalar

| Sistem | İşlem / Uygulama | Açıklama |
|---|---|---|
| Sales Cloud | Sales > Leads | Lead listesi, nitelendirme ve dönüştürme |
| Sales Cloud | Sales > Opportunities | Fırsat, satış aşaması, rakip, kayıp nedeni |
| Sales Cloud | Customers > Accounts / Contacts | Hesap ve ilgili kişiler |
| S/4HANA | `BP` | Aday hesabın ERP'de Business Partner olarak açılması |
| S/4HANA | `VA21` / `VA01` | ERP'de teklif / satış siparişi |

> [!IPUCU]
> Sales Cloud'da aşamalar, varsayılan olasılıklar, kayıp nedenleri ve lead kaynakları yapılandırılabilir listelerdir. Menü adları sürüme göre değişebilir.

## Sık yapılan hatalar

- **Her ilgiyi fırsat açmak:** Huni şişer, tahmin güvenilmez olur.
- **Gerekçesiz reddetmek:** Kampanyanın neden lead üretemediği öğrenilemez.
- **Aşamayı değiştirip olasılığı unutmak ya da tersi:** Aşama ile olasılık birbirini tutmalı; sapma varsa nedeni yazılmalı.
- **Kapanış tarihini güncellememek:** Tarihi geçmiş açık fırsat tahmini şişirir.
- **Aday hesabı ERP'de açmayı unutmak:** Sipariş aktarımda hata verir.

> [!DENE]
> [C4C çalışma alanında](#/track/sap-c4c/simulation?tab=leads) Salihli Gross Market lead'ini aç, BANT'ı kontrol et ve dönüştür.
