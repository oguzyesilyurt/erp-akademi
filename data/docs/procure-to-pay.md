## Amaç

Procure-to-Pay (P2P) sürecini satın alma talebinden tedarikçi ödemesine kadar izlemek; üç yönlü eşleştirmenin ve GR/IR hesabının neden önemli olduğunu anlamak.

## P2P nedir?

Procure-to-Pay, bir şirketin ihtiyacını tedarikçiden satın alıp ödemesini yaptığı uçtan uca süreçtir. SAP'de büyük ölçüde **MM** (Materials Management) modülünde yürür; fatura doğrulama ve ödeme **FI** ile birleşir.

## Adımlar ve belgeler

| Adım | Belge | Ne olur? |
|---|---|---|
| 1. İhtiyaç | Satın alma talebi (PR) | Stok düşük veya departman ihtiyacı bildirir |
| 2. Kaynak belirleme | Bilgi kaydı, kaynak listesi, teklif | Hangi tedarikçiden, hangi fiyata alınacağı belirlenir |
| 3. Sipariş | Satın alma siparişi (PO) | Tedarikçiye resmi sipariş verilir, gerekirse onaya gider |
| 4. Mal girişi | Mal girişi belgesi (GR) | Mal depoya girer, stok artar |
| 5. Fatura doğrulama | Tedarikçi faturası | Fatura PO ve GR ile karşılaştırılır |
| 6. Ödeme | Ödeme belgesi | Vadesi gelen faturalar ödenir |

### Talep ve sipariş onayı

Satın alma talebi ve siparişi tutar eşiğini aşınca **serbest bırakma** (release) gerekir. Ege Dağıtım'da talep 50.000 ₺, sipariş 20.000 ₺ üstündeyse Satın Alma Müdürü onaylar. Belgeyi oluşturan kişi kendi belgesini onaylayamaz. Sipariş fiyatı ve teslim süresi tedarikçinin **satın alma bilgi kaydından** gelir.

### Mal girişi ve hareket türü

Satın alma siparişine referanslı mal girişi standart olarak **101 hareket türü** ile kaydedilir. Bu kayıt stoğu artırır ve muhasebede stok hesabına borç, **GR/IR** (mal girişi / fatura girişi) ara hesabına alacak yazar. Mal parça parça gelebilir (kısmi teslimat); kalan miktar siparişte açık kalır. Diğer hareket türleri için [Hareket türleri](#/docs/hareket-turleri) makalesine bak.

### Üç yönlü eşleştirme

Fatura doğrulamada üç belge karşılaştırılır:

1. **Satın alma siparişi** – ne sipariş edildi, hangi fiyata?
2. **Mal girişi** – ne teslim alındı?
3. **Tedarikçi faturası** – ne faturalandı?

Miktar veya fiyat toleransı aşılırsa fatura **ödeme blokajına** düşer. Ege Dağıtım'da fiyat toleransı %2'dir; faturalanan miktar teslim alınıp henüz faturalanmamış miktarı aşamaz. Blokajı muhasebe, farkın nedenini öğrendikten sonra gerekçeyle kaldırır (`MRBR`). Böylece teslim alınmayan mal veya anlaşılmayan fiyat ödenmez. Fatura kaydı GR/IR hesabını kapatır ve tedarikçiye borç oluşturur.

## Ege Dağıtım'dan örnek

Kağıt havlu (TM-2006) toplam stoğu 370 pakete düştü; yeniden sipariş noktası 400. Satın alma talebi açılır ve Parlak Kimya'ya (200003, tedarik süresi 10 gün, 60 gün vade) sipariş gider. Mal Kemalpaşa deposuna 101 hareket türüyle girer. Tedarikçi faturası sipariş fiyatından yüksek gelirse fatura ödeme blokajına düşer ve satın alma birimi fiyat farkını tedarikçiyle konuşur.

## İlgili işlem kodları ve Fiori uygulamaları

| Tür | Kod / Uygulama | Açıklama |
|---|---|---|
| T-code | `ME51N` | Satın alma talebi oluşturma |
| T-code | `ME21N` / `ME22N` / `ME23N` | Satın alma siparişi oluşturma / değiştirme / görüntüleme |
| T-code | `ME54N` | Satın alma talebini onaylama (tekil serbest bırakma) |
| T-code | `ME29N` | Satın alma siparişini onaylama (tekil serbest bırakma) |
| T-code | `ME2N` | Satın alma siparişleri listesi |
| T-code | `MIGO` | Mal hareketi (mal girişi) |
| T-code | `MIRO` | Tedarikçi faturası girişi (fatura doğrulama) |
| T-code | `MRBR` | Ödemeye bloke faturaların serbest bırakılması |
| T-code | `ME11` / `ME12` | Satın alma bilgi kaydı oluşturma / değiştirme |
| T-code | `MMBE` | Stok genel görünümü |
| T-code | `F110` | Otomatik ödeme programı |
| Fiori | Manage Purchase Orders | Satın alma siparişlerini yönetir |
| Fiori | Post Goods Receipt for Purchasing Document | Siparişe referanslı mal girişi |
| Fiori | Create Supplier Invoice | Tedarikçi faturası girişi |
| Fiori | Stock – Single Material | Tek malzeme stok görünümü |

> [!UYARI]
> Fiori uygulama adları ve kapsamı S/4HANA sürümüne göre değişebilir.

## Sık yapılan hatalar

- **Siparişsiz alım:** PO olmadan mal kabul etmek üç yönlü eşleştirmeyi imkânsız kılar.
- **Mal girişini geciktirmek:** Fatura önce gelir, GR olmadığı için ödeme blokajına düşer; tedarikçi ilişkisi zarar görür.
- **Kendi talebini onaylamak:** Talep açan ile onaylayan aynı kişiyse harcama kontrolü çalışmaz (görevler ayrılığı).
- **Blokajı gerekçesiz kaldırmak:** Fiyat farkı satın almayla netleşmeden ödenirse fazla ödeme geri alınamaz.
- **GR/IR hesabını izlememek:** Kapanmayan GR/IR bakiyeleri ay sonunda açıklanamayan farklar olarak çıkar.

> [!DENE]
> [Kağıt havlu için uçtan uca P2P senaryosunu](#/track/s4-mm/scenarios/kagit-havlu-p2p) uygula: [MM çalışma alanında](#/track/s4-mm/simulation?tab=stock) kritik stoktan talep aç, onaylat, siparişe dönüştür, malı teslim al ve faturayı eşleştir.
