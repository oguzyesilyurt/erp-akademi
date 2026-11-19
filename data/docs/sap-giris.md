## Amaç

Bu makalenin sonunda ERP'nin ne olduğunu, SAP S/4HANA'nın hangi modüllerden oluştuğunu ve sistemde nasıl gezinildiğini (SAP GUI, işlem kodları, Fiori Launchpad) açıklayabileceksin.

## ERP nedir?

ERP (Enterprise Resource Planning – Kurumsal Kaynak Planlama), bir şirketin satış, satın alma, stok, üretim, finans ve insan kaynakları süreçlerini **tek bir veri tabanı** üzerinde birleştiren yazılımdır. Aynı müşteri, aynı ürün ve aynı muhasebe hesabı tüm departmanlarda ortak kullanılır; bir departmanın yaptığı işlem diğerlerine anında yansır.

ERP olmadan satış Excel'de, stok ayrı bir programda, muhasebe başka bir sistemde tutulur. Rakamlar birbirini tutmaz, ay sonu mutabakatı günler sürer.

## SAP S/4HANA ve SAP ECC

SAP'nin ana ERP ürünü bugün **SAP S/4HANA**'dır. Öncülü olan **SAP ECC** (ERP Central Component), farklı veri tabanlarında çalışabiliyordu; S/4HANA yalnızca SAP HANA bellek içi veri tabanında çalışır ve veri modelini sadeleştirir.

S/4HANA'daki önemli farklardan bazıları:

- Müşteri ve tedarikçi kayıtları **Business Partner (BP)** nesnesinde birleşti.
- Finans ve maliyet muhasebesi kalemleri tek bir tabloda, **Universal Journal** (ACDOCA) içinde tutulur.
- Kullanıcı arayüzü olarak SAP GUI'nin yanında **SAP Fiori** öne çıktı.

> [!INFO]
> SAP S/4HANA hem şirketin kendi sunucularında (on-premise) hem de bulutta (SAP S/4HANA Cloud) kullanılabilir. Bu eğitimdeki süreçler iki kurulumda da aynı mantıkla çalışır.

## Temel modüller

| Kısaltma | Modül | Ne yapar? |
|---|---|---|
| SD | Sales and Distribution | Teklif, satış siparişi, teslimat, faturalama |
| MM | Materials Management | Satın alma, mal girişi, stok yönetimi |
| FI | Financial Accounting | Genel muhasebe, alacak ve borç hesapları |
| CO | Controlling | Maliyet merkezi, kâr merkezi, karlılık analizi |
| PP | Production Planning | Üretim planlama ve üretim siparişleri |
| WM / EWM | (Extended) Warehouse Management | Depo içi yerleşim, toplama, sevkiyat |

Bu modüller birbirine bağlıdır: SD'de kesilen fatura FI'da müşteri alacağı oluşturur, MM'deki mal girişi stok değerini ve muhasebe kaydını aynı anda günceller.

## Sistemde gezinme

### SAP GUI ve işlem kodları

SAP GUI, masaüstüne kurulan klasik arayüzdür. Her ekranın bir **işlem kodu** (T-code) vardır. Komut alanına kodu yazıp Enter'a basarak ekrana doğrudan gidilir:

- `/nVA03` – mevcut pencerede satış siparişi görüntüleme ekranını açar.
- `/oMM03` – yeni bir pencerede malzeme görüntüleme ekranını açar.
- `/n` – mevcut işlemden çıkar ve ana menüye döner.

### SAP Fiori

Fiori, tarayıcıda ve mobilde çalışan, role göre düzenlenmiş uygulamalardan oluşur. Kullanıcı **Fiori Launchpad** üzerinde yalnızca rolüne atanmış kutucukları (tile) görür. Örneğin satış temsilcisi teklif ve sipariş uygulamalarını, muhasebe uzmanı müşteri kalemlerini görür.

## Ege Dağıtım'dan örnek

Ege Dağıtım'da satış temsilcisi Denel Kaya güne Fiori Launchpad'den teklif listesine bakarak başlar. Muhasebe uzmanı Gökhan Yılmaz ise müşteri açık kalemlerini izler. İkisi de aynı müşteri kaydını (ör. 100001 Karşıyaka Gıda) görür. Denel'in kestiği fatura, Gökhan'ın ekranında anında açık bakiye olarak belirir.

## İlgili işlem kodları ve Fiori uygulamaları

| Tür | Kod / Uygulama | Açıklama |
|---|---|---|
| T-code | `/UI2/FLP` | SAP GUI'den Fiori Launchpad'i açar |
| T-code | `SU3` | Kendi kullanıcı ayarlarını (dil, tarih biçimi) düzenler |
| T-code | `SE16N` | Tablo içeriğini görüntüler (yetki gerektirir) |
| T-code | `SM04` | Sistemde oturum açmış kullanıcıları listeler |
| Fiori | Manage Sales Orders | Satış siparişlerini listeler ve yönetir |

> [!UYARI]
> Fiori uygulama adları ve kullanılabilirliği S/4HANA sürümüne ve lisansa göre değişebilir. İşlem kodları yetki rolüne bağlıdır; bir koda erişemiyorsan rolünde ilgili yetki olmayabilir.

## Sık yapılan hatalar

- **Modülleri bağımsız sanmak:** SD'deki bir hata (yanlış ödeme koşulu) FI'da yanlış vadeye dönüşür.
- **Ana veriyi hafife almak:** Yanlış girilmiş bir müşteri segmenti yüzlerce faturada yanlış iskonto demektir.
- **`/n` ile kaydetmeden çıkmak:** `/n` ile çıkıldığında kaydedilmemiş veriler kaybolur.

> [!DENE]
> [B2B CRM yoluna giriş yap](#/track/b2b-crm/intro) ve Ege Dağıtım'ın satış akışını incele.
