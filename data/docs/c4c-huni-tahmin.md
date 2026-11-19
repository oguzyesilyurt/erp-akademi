## Amaç

Satış hunisini aşamalara göre okumak, ağırlıklı tahmini kapanış ayına göre hesaplamak, riskli fırsatları erken görmek ve pazarlama kampanyasının etkisini lead'den kazanılan tutara kadar ölçmek.

## Huni ve ağırlıklı tahmin

**Satış hunisi**, açık fırsatların aşamalara göre dağılımıdır. Huni toplamı (açık fırsatların beklenen tutarlarının toplamı) iyimserdir; her fırsat kazanılmayacaktır. Bu yüzden tahmin **ağırlıklı** yapılır:

`Ağırlıklı tutar = beklenen tutar × olasılık`

| Fırsat | Aşama | Tutar | Olasılık | Ağırlıklı | Kapanış |
|---|---|---|---|---|---|
| Bornova yeni şubeler | Pazarlık | 420.000 ₺ | %75 | 315.000 ₺ | Aralık 2026 |
| Karşıyaka kış temizlik | Teklif | 85.000 ₺ | %50 | 42.500 ₺ | Aralık 2026 |
| Ödemiş ilk bayi siparişi | İhtiyaç analizi | 120.000 ₺ | %25 | 30.000 ₺ | Ocak 2027 |

Aralık tahmini 357.500 ₺'dir ve bunun 315.000 ₺'si tek bir fırsata bağlıdır. Müdür için asıl bilgi budur: Bornova kaybedilirse Aralık hedefi tutmaz.

> [!INFO]
> Sales Cloud'da fırsatın beklenen değeri ve olasılığı tutulur. Huni ve tahmin raporları bu iki alandan ağırlıklı değeri hesaplar. Kurumlar ayrıca tahmin kategorisi (ör. *commit*, *best case*) kullanabilir.

## Ekip görünümü ve temsilci görünümü

Satış temsilcisi yalnızca sorumlusu olduğu fırsatları ve kendi tahminini görür. Satış müdürü ekip görünümünde (`FORECAST_VIEW_TEAM`) tüm temsilcilerin hunisini, temsilci bazında kırılımı ve riskli fırsatları görür. Bu bir yetki kararıdır: tahmin, yönetimin hedef ve kaynak planlamasının aracıdır.

## Riskli fırsat sinyalleri

| Sinyal | Neden risk? |
|---|---|
| Kapanış tarihi geçmiş ama fırsat açık | Tahmini şişirir; ya tarih ya aşama yanlış |
| Kapanış yakın, aşama erken (Keşif / İhtiyaç analizi) | Kalan sürede teklif ve pazarlık yetişmez |
| Gecikmiş görev veya son 14 günde aktivite yok | Fırsat kendi haline bırakılmış |
| Müşteri kredi limitine yakın, limit aşımında veya bloke | Kazanılsa bile sipariş kredi kontrolüne takılır |
| Vadesi geçmiş bakiye | Yeni sipariş muhasebe onayı gerektirir |

> [!UYARI]
> Risk sinyali karar değildir. Müdür toplantıda nedeni sorar, aksiyon atar (görev) ve gerekiyorsa olasılığı gerekçesiyle düşürür.

## Kayıp analizi

Kaybedilen her fırsatta **kayıp nedeni** ve **rakip** kaydedilir. Tek kayıp anekdottur. Aynı neden tekrarlıyorsa (ör. "Fiyat" ve rakip hep aynı) fiyat politikası, kampanya kapsamı veya teslim koşulu gözden geçirilmelidir. Kaybedilen tutar ağırlıklı tahmine girmez; yalnızca kayıp analizinde görünür.

## Kampanya performansı

Pazarlama kampanyasının değeri harcanan bütçeye karşı yarattığı işle ölçülür:

| Ölçü | Hesap |
|---|---|
| Lead sayısı | Kampanyaya bağlı lead'ler |
| Dönüşüm | Fırsata dönüşen lead'ler |
| Açık huni | Kampanyalı açık fırsatların ağırlıklı tutarı |
| Kazanılan tutar | Kampanyalı kazanılan fırsatların tutarı |
| Lead başı maliyet | Bütçe ÷ lead sayısı |
| Getiri | Kazanılan tutar ÷ bütçe |

Bu zincir ancak lead fırsata, fırsat teklife, teklif siparişe bağlı kaldığında çalışır. Bağ koparsa (ör. fırsatsız teklif) kampanya başarısı ölçülemez.

> [!ORNEK]
> Ege Bölge Bayi Buluşması 2026: 85.000 ₺ bütçe, 4 lead, 2 fırsat, 1 kazanılan (Aydın Efe, 148.600 ₺). Lead başı maliyet 21.250 ₺, getiri 1,7×. Reddedilen iki lead'in nedenleri (bütçe yok, kredi riski) bir sonraki buluşmada hedef grubun nasıl daraltılacağını gösterir.

## Ege Dağıtım'dan örnek

Pazartesi huni toplantısında Ayçelen, Aralık tahmininin büyük kısmının Bornova'ya bağlı olduğunu gördü. Riskli listede Bornova'nın kredi kullanımı %87 ve 145.000 ₺ vadesi geçmiş bakiyesi vardı. Muhasebeyle görüşme görevi de gecikmişti. Ayçelen, Denel'e "kredi ve vade planını muhasebeyle netleştir" görevini atadı ve olasılığı %75'ten %60'a çekti. Aralık tahmini gerçekçi hale geldi.

## İlgili işlemler ve uygulamalar

| Sistem | İşlem / Uygulama | Açıklama |
|---|---|---|
| Sales Cloud | Sales > Opportunities (pipeline görünümü) | Aşamalara göre huni |
| Sales Cloud | Sales > Forecasts / pipeline raporları | Ağırlıklı tahmin |
| Sales Cloud | Activities > Calendar / Tasks / Visits | Ziyaret, telefon, görev |
| Sales Cloud | Marketing > Campaigns / Target Groups | Kampanya ve hedef grup |
| S/4HANA | `FD32` / `UKM_BP` | Kredi limiti ve kredi yönetimi (ERP tarafı) |

> [!IPUCU]
> Menü adları ve rapor içerikleri kuruluma göre değişir. Kredi yönetimi S/4HANA'da SAP Credit Management (`UKM_BP`) ile, eski kurulumlarda `FD32` ile yapılır.

## Sık yapılan hatalar

- **Huni toplamını tahmin sanmak:** Olasılıkla ağırlıklandırılmamış toplam hedefi olduğundan yakın gösterir.
- **Kapanış tarihini ileri atıp durmak:** Fırsat ya kaybedildi ya da aşaması yanlıştır.
- **Kayıp nedenini "Diğer" geçmek:** Analiz edilecek veri kalmaz.
- **Kampanyayı lead sayısıyla ölçmek:** Asıl ölçü kazanılan tutar ve getiridir.

> [!DENE]
> [Müdürün haftalık huni toplantısı](#/track/sap-c4c/scenarios/haftalik-huni) senaryosunu Satış Müdürü rolüyle uygula.
