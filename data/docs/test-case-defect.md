## Amaç

Tekrarlanabilir bir test case yazmayı, test koşumunu kayıt altına almayı ve defect'i yaşam döngüsü boyunca doğru rollerle yönetmeyi öğrenmek.

## İyi test case

| Alan | Neden önemli? | Örnek (TC-01) |
|---|---|---|
| Başlık | Ne doğrulandığını tek cümlede söyler | Net 50.000 ₺ üstü teklif müdür onayına düşer |
| Bağlı gereksinim | İzlenebilirliği sağlar | REQ-04 |
| Ön koşul | Testin başlangıç durumu | Satış Temsilcisi oturumu, Karşıyaka Gıda kredi limiti yeterli |
| Test verisi | Aynı sonucu tekrar üretmeyi sağlar | 100001 · GD-1008 × 15 koli |
| Adım + beklenen sonuç | Her adım ölçülebilir olmalı | "Onay kontrolü: Müdür onayı gerekli; gerekçe net tutar > 50.000 ₺" |
| Öncelik | Sınırlı zamanda hangi testin önce koşulacağı | Yüksek |

> [!IPUCU]
> Eşik değerlerini hem altından hem üstünden test et. %12 iskonto kuralı için %11,9 ve %12,1; 10 birim kampanya kuralı için 9 ve 10 birim.

### Test koşumu

Koşum, test case'in belirli bir sürümde çalıştırılmasıdır. Her adım üç sonuçtan birini alır:

- **Geçti:** Gerçekleşen sonuç beklenenle aynı.
- **Kaldı:** Gerçekleşen sonuç farklı; defect açılır.
- **Bloke:** Adım koşulamıyor (ör. yetki yok, önceki adım başarısız, ortam hatası).

Koşum kaydı sürümü, koşan kişiyi ve zamanı içerir. Aynı test case farklı sürümlerde farklı sonuç verebilir; bu yüzden "TC-01 geçti" değil, "TC-01 v1.1'de kaldı" denir.

## Defect yaşam döngüsü

| Durum | Kim? | Sonraki adım |
|---|---|---|
| Yeni | Test eden (key user) | Teknik lidere atanır |
| Atandı | Teknik lider | Düzeltmeye başlanır |
| Düzeltiliyor | Teknik lider | Düzeltildi → Yeniden teste hazır, veya Tekrarlanamadı |
| Yeniden teste hazır | Test eden | Test yeniden koşulur; geçerse Kapandı, kalırsa Yeniden açıldı |
| Tekrarlanamadı | Test eden | Tanım düzeltilip yeniden açılır veya kapatılır |
| Kapandı / Yeniden açıldı | Test eden | Döngü biter veya yeniden atamayla tekrar başlar |

> [!UYARI]
> Düzelten kişi kendi düzeltmesini kapatmamalıdır. Bu, görevler ayrılığının test yönetimindeki karşılığıdır: bağımsız yeniden test olmadan "düzeldi" demek kanıt değildir.

### İyi defect kaydı

Defect kaydı, test case'in adımlarını ve test verisini taşımalı; beklenen ve gerçekleşen sonucu rakamla yazmalıdır. Yanlış gereksinime bağlanan veya belirsiz tarif edilen hata, geliştirici tarafından tekrarlanamaz ve zaman kaybettirir.

## Feature flag ve sürümler

Feature flag, bir işlevi kod değiştirmeden açıp kapatan ayardır. Ekipler yeni işlevi bayrakla yayına alır, sorun çıkarsa bayrağı kapatarak hızla geri döner. Bu eğitimde v1.1'deki hatalar da bayraklarla temsil edilir: teknik lider doğru tarif edilmiş bir hatayı düzelttiğinde ilgili bayrak kapanır.

## Ege Dağıtım'dan örnek

TC-02 v1.1 üzerinde koşuldu: 6 kolilik bulaşık deterjanı kaleminde ZKMP %10 uygulandı (beklenen: uygulanmamalı). Key user Oğuz Öztürk "Defect aç" ile DEF-002'yi oluşturdu; adımlar ve test verisi otomatik doldu, gereksinim REQ-02 seçildi, önem Orta verildi. Teknik lider düzeltince durum "Yeniden teste hazır" oldu. Oğuz TC-02'yi yeniden koştu, test geçti ve defect kapandı.

## İlgili araçlar

| Tür | Araç / Kod | Açıklama |
|---|---|---|
| Araç | SAP Cloud ALM – Test Management | Test case, koşum ve defect yönetimi |
| Araç | SAP Solution Manager – Test Suite / Defect Management | On-premise test ve hata yönetimi |
| T-code | `SU53` | Bloke adımlarda yetki hatasının kanıtı |
| T-code | `WE02` / `BD87` | Arayüz adımlarında IDoc kanıtı |
| T-code | `VA03` / `VL03N` / `VF03` | Sipariş, teslimat ve faturayı görüntüleyerek sonucu doğrulama |
| T-code | `MMBE` | Teslimat sonrası stok kontrolü |

## Sık yapılan hatalar

- **Belgeye güvenip ana kaydı kontrol etmemek:** Teslimat belgesi doğru görünse bile stok düşmemiş olabilir; stoğu stok ekranından kontrol et.
- **Bir defect'e birden çok hata yazmak:** Her hata ayrı kayıt olmalı; aksi halde kısmen düzelen kayıt kapatılamaz.
- **Yeniden test etmeden kapatmak:** Düzeltme başka bir yeri bozmuş olabilir; ilgili test case ve regresyon testleri koşulmalı.

> [!DENE]
> [v1.1 UAT turu senaryosunu](#/track/testing/scenarios/v11-uat) uygula: hataları bul, raporla, düzelttir ve yeniden test edip kapat.
