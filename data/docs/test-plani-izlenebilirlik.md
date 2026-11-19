## Amaç

Bir sürüm testinin nasıl planlandığını, giriş ve çıkış kriterlerinin nasıl belirlendiğini ve izlenebilirlik matrisiyle kapsamın nasıl kanıtlandığını öğrenmek.

## Test planı

Test planı, "neyi, nerede, ne zaman, kim ve hangi kurala göre test ediyoruz?" sorularının cevabıdır.

| Bölüm | İçerik | Ege Dağıtım v1.1 örneği |
|---|---|---|
| Kapsam | Test edilecek gereksinimler ve süreçler | REQ-01…REQ-10: fiyat, onay, kredi, teslimat, fatura, entegrasyon, yetki |
| Kapsam dışı | Bu turda test edilmeyecekler | Satın alma (MM) süreçleri |
| Ortam | Sürüm, mandant, test verisi | v1.1 UAT adayı, Ege Dağıtım ana verisi |
| Takvim | Test turları | 1. tur (hata bulma), düzeltme, 2. tur (yeniden test + regresyon) |
| Roller | Kim koşar, kim düzeltir, kim kapatır | Key user koşar ve kapatır, teknik lider düzeltir |
| Riskler | Değişen alanlar, bağımlılıklar | Sürüm notlarındaki 4 değişiklik öncelikli test edilir |

> [!IPUCU]
> Sürüm notları test önceliğinin en iyi kaynağıdır. "Kampanya motoru yeniden yazıldı" diyorsa kampanya kurallarını ilk turda sına.

## Giriş ve çıkış kriterleri

**Giriş kriterleri** teste başlamak için hazır olunması gerekenlerdir: test sürümü kurulu, ana veri yüklü, test case'ler süreç sahibince onaylı, bilinen engelleyici hata yok.

**Çıkış kriterleri** testin bitip bitmediğine karar verir:

- Tüm gereksinimler en az bir test case ile kapsandı.
- Tüm test case'ler en az bir kez koşuldu.
- Açık **Kritik** ve **Yüksek** önemli defect yok.
- Kalan düşük önemli defect'lerin sahibi ve hedef tarihi belli.
- Süreç sahibi kabul (sign-off) verdi.

> [!UYARI]
> Çıkış kriteri "test süresi doldu" olamaz. Takvim bitti diye açık kritik hatayla canlıya geçmek, cutover gecesinde geri dönüş riskini büyütür.

## İzlenebilirlik matrisi

İzlenebilirlik matrisi gereksinimden sonuca uzanan zinciri tek tabloda gösterir:

| Gereksinim | Test case | Son sonuç | Defect |
|---|---|---|---|
| REQ-02 Kampanya minimum miktar | TC-02 | Kaldı | DEF-002 · Yeniden teste hazır |
| REQ-04 Net 50.000 ₺ onay | TC-01 | Geçti | DEF-001 · Kapandı |
| REQ-07 Teslimatta stok düşmeli | — | Kapsanmadı | — |

Matris üç soruyu hemen cevaplar: **Neyi test etmedik?** (kapsanmayan gereksinim), **Ne çalışmıyor?** (kalan test), **Hangi hata hangi gereksinimi etkiliyor?** (defect bağlantısı).

## Ege Dağıtım'dan örnek

v1.1 sürümünde hazır gelen üç test case yalnızca teklif aşamasını sınar. Matriste REQ-07 (teslimatta stok) ve REQ-08 (fatura vadesi) "Kapsanmadı" görünür. Bu iki gereksinim için test case yazılmazsa, sipariş sonrası süreçteki iki hata canlıya kaçar. İzlenebilirlik matrisi bu boşluğu test başlamadan gösterir.

## İlgili araçlar

| Tür | Araç / Kod | Açıklama |
|---|---|---|
| Araç | SAP Cloud ALM – Requirements & Test Management | Gereksinim, test planı, koşum ve defect takibi (bulut) |
| Araç | SAP Solution Manager – Test Suite | Test planı, test paketleri ve koşum (on-premise) |
| Araç | SAP Solution Manager – Focused Build | Gereksinim → geliştirme → test izlenebilirliği |
| T-code | `SECATT` | eCATT ile otomatik regresyon testi |

> [!INFO]
> Araç kullanılabilirliği lisansa ve kuruluma bağlıdır; birçok proje Jira veya benzeri araçlarla da aynı yapıyı kurar. Önemli olan araç değil, gereksinim–test–sonuç–defect bağlantısının kurulmasıdır.

## Sık yapılan hatalar

- **Kapsamı test case sayısıyla ölçmek:** 50 test case'in hepsi aynı gereksinimi sınayabilir. Kapsam gereksinim bazında ölçülür.
- **Çıkış kriterini sonradan gevşetmek:** Kriterler test başlamadan süreç sahibiyle yazılı olarak belirlenmelidir.
- **Regresyonu unutmak:** Yalnızca değişen alanı test etmek, değişikliğin bozduğu eski işlevleri kaçırır.

> [!DENE]
> [Test Laboratuvarı'nda](#/track/testing/simulation) sürümü v1.1'e al ve İzlenebilirlik sekmesinde kapsanmayan gereksinimleri bul.
