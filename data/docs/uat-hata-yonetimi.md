## Amaç

Kullanıcı kabul testinin (UAT) nasıl planlanıp yürütüldüğünü, hataların nasıl raporlanıp önceliklendirildiğini ve kabul kararının nasıl verildiğini öğrenmek.

## UAT nedir?

UAT (User Acceptance Testing), canlıya geçmeden önce **iş biriminin** sistemi kendi senaryolarıyla doğruladığı son test aşamasıdır. Soru "sistem çalışıyor mu?" değil, **"sistem işimizi doğru yapıyor mu?"** sorusudur.

## UAT planı

| Adım | İçerik |
|---|---|
| Kapsam | Hangi süreçler, hangi roller, hangi lokasyonlar |
| Senaryolar | Gerçek iş günlerinden alınmış uçtan uca akışlar |
| Test verisi | Canlıya benzer müşteri, ürün, fiyat ve stok |
| Takvim | Test turları (ör. 1. tur, düzeltme, 2. tur) |
| Roller | Test eden key user'lar, hata düzelten danışmanlar, onaylayan süreç sahipleri |
| Kabul kriteri | Açık kritik/yüksek hata yok, senaryoların belirli oranı başarılı |

## Hata raporu

İyi bir hata raporu başka birinin hatayı **tekrar üretmesini** sağlar.

| Alan | Örnek |
|---|---|
| Başlık | Teklif 20000091 · K007 B segmentinde %8 uygulanıyor |
| Hatalı alan | Segment iskontosu (K007) |
| Beklenen sonuç | Aydın Efe B segmentinde; K007 %5 olmalı |
| Gerçekleşen sonuç | Kalem 10 ve 20'de K007 %8 uygulanmış |
| Tekrar adımları | 1. Teklifi aç 2. Müşteri segmentini kontrol et 3. Fiyat adımlarını aç |
| Önem | Yüksek |
| Ek | Ekran görüntüsü, belge numarası, kullanıcı ve sistem tarihi |

### Önem ve öncelik

**Önem (severity)** hatanın iş etkisidir; **öncelik (priority)** ne kadar hızlı düzeltileceğidir. Ege Dağıtım'ın kullandığı önem ölçeği:

| Önem | Tanım | Örnek |
|---|---|---|
| Kritik | Yasal risk, engellenmesi gereken işlem, ciddi kayıp | Bloke müşteriye kaydedilen teklif, yanlış KDV |
| Yüksek | Doğrudan para kaybı veya yetki/onay ihlali | Yanlış segment iskontosu, atlanan müdür onayı |
| Orta | Süreç kuralına aykırılık, gecikme | Kampanya bitişini aşan geçerlilik, stoksuz depo |
| Düşük | Görsel veya metinsel hata | Yanlış etiket, yazım hatası |

> [!IPUCU]
> Hata raporunda tek bir hata anlat. "Fiyat yanlış ve depo da yanlış" diye yazılan rapor iki ayrı ekibe gider ve izlenmesi zorlaşır.

### Hata yaşam döngüsü

**Yeni → Analizde → Düzeltmede → Yeniden teste hazır → Kapandı** (veya Reddedildi / Ertelendi). Düzeltilen hata, raporu açan key user tarafından yeniden test edilmeden kapatılmaz.

## Kabul kararı

UAT sonunda süreç sahipleri **kabul (sign-off)** verir. Açık kalan düşük önemli hatalar, sahibi ve hedef tarihi belirlenmiş bir listeyle canlıya taşınabilir; kritik ve yüksek hatalar taşınmaz.

## Ege Dağıtım'dan örnek

Hata Avı görevlerindeki 8 teklif, UAT'de karşılaşılan tipik hataları içerir: yanlış segment iskontosu, minimum miktar altında kampanya, bloke müşteriye kayıt, yanlış KDV, atlanan onay, kampanya sonrası geçerlilik, stoksuz depo ve eski liste fiyatı. Her biri için ideal hata raporu ve önem gerekçesi verilmiştir.

## İlgili işlem kodları ve araçlar

| Tür | Kod / Araç | Açıklama |
|---|---|---|
| Araç | SAP Cloud ALM – Test Management | Test turları, hata kayıtları, raporlama |
| Araç | SAP Solution Manager – Test Suite | Test planları ve hata yönetimi (on-premise) |
| T-code | `VA23` / `VA03` | Teklif / siparişi görüntüleyerek kanıt toplama |
| T-code | `SU53` | Yetki hatasının nedenini rapora ekleme |
| T-code | `WE02` | Arayüz hatalarında IDoc numarası ve durumunu rapora ekleme |

## Sık yapılan hatalar

- **Beklenen sonucu yazmamak:** Danışman neyin "doğru" olduğunu bilmeden düzeltemez.
- **Önemi abartmak:** Her hatayı Kritik işaretlemek gerçek kritik hataları gizler.
- **Yeniden test etmeden kapatmak:** Düzeltme başka bir yeri bozmuş olabilir; regresyon gerekir.

> [!DENE]
> [Hata Avı'na başla](#/track/b2b-crm/tests): her teklif için hata raporu yaz, puanını ve ideal raporu karşılaştır.
