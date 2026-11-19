## Amaç

SAP yetki konseptinin (rol, yetki nesnesi, kullanıcı) nasıl çalıştığını ve görevler ayrılığının (SoD) neden kritik olduğunu öğrenmek.

## Yetki konsepti

SAP'de kullanıcıya doğrudan yetki verilmez; yetkiler **rollerde** toplanır ve roller kullanıcıya atanır.

| Kavram | Açıklama |
|---|---|
| Kullanıcı | Sisteme giriş yapan kişi |
| Rol | İşlem kodları, Fiori uygulamaları ve yetkilerin toplandığı paket |
| Tekil rol / bileşik rol | Tek iş fonksiyonu / birden fazla tekil rolün birleşimi |
| Yetki nesnesi | Kontrol edilen alanlar grubu (ör. satış organizasyonu + aktivite) |
| Aktivite | Yapılacak işlem: 01 oluşturma, 02 değiştirme, 03 görüntüleme |

### Yetki nesnesi örnekleri

| Nesne | Neyi kontrol eder? |
|---|---|
| `V_VBAK_AAT` | Satış belgesi türü bazında yetki |
| `V_VBAK_VKO` | Satış organizasyonu, dağıtım kanalı, bölüm bazında satış belgesi yetkisi |
| `M_BEST_BSA` | Satın alma siparişi belge türü bazında yetki |
| `F_BKPF_BUK` | Şirket kodu bazında muhasebe belgesi yetkisi |

Bir kullanıcı işlem kodunu çalıştırabilse bile, ilgili yetki nesnesinde doğru değer yoksa işlem "yetkiniz yok" hatasıyla durur.

## Görevler ayrılığı (SoD)

**Segregation of Duties**, kritik bir işi baştan sona tek kişinin yapamamasıdır. Klasik çakışmalar:

| Görev A | Görev B | Risk |
|---|---|---|
| Tedarikçi ana verisi oluşturma | Tedarikçiye ödeme | Sahte tedarikçiye ödeme |
| Satış siparişi oluşturma | Kredi blokajı kaldırma | Riskli müşteriye kontrolsüz satış |
| Teslimat (mal çıkışı) | Faturalama | Faturasız sevk veya sevksiz fatura |
| Ana veri düzenleme | Belge onaylama | Onay sonucunu ana veriyle manipüle etme |

Büyük şirketlerde SoD riskleri **SAP Governance, Risk and Compliance (GRC) Access Control** ile analiz edilir. Acil durumlarda geçici geniş yetki, kayıt altına alınan "firefighter" (acil erişim) kullanıcılarıyla verilir.

> [!IPUCU]
> Bir rol tasarlarken "bu kişi bu işi başlatırsa, kim kontrol eder?" sorusunu sor. Cevap aynı kişiyse SoD riski vardır.

## Ege Dağıtım'dan örnek

| Rol | Yapabildikleri | Yapamadıkları |
|---|---|---|
| Satış Temsilcisi | Teklif ve sipariş oluşturma | Onay, kredi kararı |
| Satış Müdürü | İskonto/tutar onayı | Teklif oluşturma |
| Muhasebe | Kredi onayı, blok kaldırma, fatura | Teklif, teslimat |
| Key User | Ana veri, aktarım yeniden işleme | Hiçbir onay |
| Depo Sorumlusu | Teslimat | Fatura |

Bornova Market'in kampanyalı teklifinde temsilci kaydetti, müdür iskontoyu, muhasebe kredi riskini onayladı. Kimse kendi oluşturduğu belgeyi onaylayamadı.

## İlgili işlem kodları ve Fiori uygulamaları

| Tür | Kod / Uygulama | Açıklama |
|---|---|---|
| T-code | `SU01` | Kullanıcı bakımı |
| T-code | `PFCG` | Rol bakımı (yetki profili oluşturma) |
| T-code | `SU53` | Son başarısız yetki kontrolünü görüntüleme |
| T-code | `SUIM` | Kullanıcı bilgi sistemi (kim hangi yetkiye sahip?) |
| T-code | `SU24` | İşlem kodu için yetki kontrol varsayılanları |
| Fiori | Maintain Business Users | İş kullanıcısı bakımı (özellikle S/4HANA Cloud) |
| Fiori | Maintain Business Roles | İş rolü bakımı (özellikle S/4HANA Cloud) |

## Sık yapılan hatalar

- **"Geçici" geniş yetki vermek:** Test sırasında verilen SAP_ALL benzeri yetkiler canlıda unutulur.
- **SU53'e bakmadan rol değiştirmek:** Hangi yetki nesnesinin eksik olduğunu bilmeden rol genişletmek SoD riskini artırır.
- **Rol tasarımını kişiye göre yapmak:** Roller göreve göre tasarlanmalı; kişi değiştiğinde rol değişmemeli.

## Uygulamadaki karşılığı

ERP Akademi'deki [Kullanıcı Yönetimi](#/users) sayfası, `SU01` (kullanıcı) ve `PFCG` (rol) işlemlerinin basitleştirilmiş bir karşılığıdır. Burada da kaydetmeden önce iki kontrol yapılır:

- **SoD çakışması:** Örneğin `QUOTE_CREATE` + `QUOTE_APPROVE` veya `DELIVERY_CREATE` + `INVOICE_CREATE` aynı kullanıcıda birleşirse uyarı verilir; ancak gerekçe yazılırsa kaydedilir ve gerekçe günlüğe düşer.
- **Son yetki sahibi:** Bir yetkiye sahip son aktif kullanıcıdan (ör. son onaycı) yetki kaldırılamaz; önce o yetkiyle yeni kullanıcı oluşturulması istenir.

> [!DENE]
> [Yetki Matrisi'ni aç](#/roles), ardından [Kampanyalı teklifi uçtan uca onaylat](#/track/b2b-crm/scenarios/uctan-uca-onay) senaryosunda rolleri değiştirerek kilitli düğmeleri gözlemle. Key User rolüyle [Kullanıcı Yönetimi](#/users) sayfasında bir temsilciye müdür rolü eklemeyi dene ve SoD uyarısını gör.
