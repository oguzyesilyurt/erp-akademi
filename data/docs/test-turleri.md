## Amaç

SAP projelerinde kullanılan test türlerini, ne zaman ve kim tarafından yapıldıklarını ve bir test senaryosunun nasıl yazıldığını öğrenmek.

## Test türleri

| Test | Kim yapar? | Ne doğrulanır? |
|---|---|---|
| Birim testi (Unit test) | Danışman / geliştirici | Tek bir ayar, rapor veya geliştirme doğru çalışıyor mu? |
| Entegrasyon testi (SIT) | Proje ekibi + key user | Süreç modüller ve sistemler arasında uçtan uca akıyor mu? |
| Regresyon testi | Test ekibi | Yeni değişiklik var olan işleyişi bozdu mu? |
| Kullanıcı kabul testi (UAT) | İş birimi (key user'lar) | Sistem gerçek iş süreçlerini karşılıyor mu? |
| Performans testi | Teknik ekip | Beklenen hacimde yanıt süreleri kabul edilebilir mi? |
| Yetki testi | Test ekibi + güvenlik | Her rol yalnızca yapması gerekeni yapabiliyor mu? |

### Entegrasyon testi (SIT)

Entegrasyon testi süreci tek modülde değil, **uçtan uca** sınar: teklif CRM'de, sipariş ERP'de, teslimat depoda, fatura muhasebede. Arayüzler (IDoc, servis) gerçek akışla tetiklenir.

### Regresyon testi

Her yeni sürüm, düzeltme veya SAP güncellemesi sonrasında kritik süreçlerin hâlâ çalıştığı doğrulanır. Sık tekrarlandığı için **otomasyona** en uygun test türüdür.

## Test senaryosu nasıl yazılır?

İyi bir test senaryosu şunları içerir:

1. **Kimlik ve başlık:** Ör. "O2C-07 Kampanyalı teklif müdür onayına düşmeli"
2. **Ön koşullar:** Kullanıcı rolü, ana veri, sistem tarihi
3. **Test verisi:** Müşteri, ürün, miktar
4. **Adımlar:** Her adımda yapılacak işlem
5. **Beklenen sonuç:** Her adım için ölçülebilir sonuç
6. **Gerçekleşen sonuç ve durum:** Geçti / Kaldı / Engellendi

> [!ORNEK]
> **O2C-07** · Ön koşul: Denel Kaya (Satış Temsilcisi) oturumu, Bornova Market A segmenti, Kış Temizlik Kampanyası aktif.
> Adımlar: TM-2001 × 200, TM-2002 × 150, TM-2003 × 200 ile teklif oluştur ve kaydet.
> Beklenen: Toplam iskonto %17,2; durum "Onay bekliyor"; ilk adım "Müdür onayı", ikinci adım "Kredi onayı".

### Giriş ve çıkış kriterleri

- **Giriş kriteri:** Test ortamı hazır, ana veri yüklendi, senaryolar onaylandı.
- **Çıkış kriteri:** Kritik ve yüksek önemli açık hata yok, senaryoların belirlenen oranı geçti, iş birimi onay verdi.

## Ege Dağıtım'dan örnek

Yeni onay kuralı (iskonto %12 veya net 50.000 ₺ üzeri müdür onayı) canlıya alınmadan önce:

- **Birim testi:** Danışman, eşik değerlerini tek tek dener (%11,9 → onaysız, %12,1 → onaylı).
- **Entegrasyon testi:** Onaylanan teklif siparişe dönüşür, ERP'ye aktarılır, teslim edilir ve faturalanır.
- **Yetki testi:** Temsilcinin kendi teklifini onaylayamadığı doğrulanır.
- **UAT:** Key user Oğuz Öztürk, satış ekibiyle gerçek senaryoları yürütür ve kabul imzası verir.

## İlgili işlem kodları ve araçlar

| Tür | Kod / Araç | Açıklama |
|---|---|---|
| Araç | SAP Cloud ALM – Test Management | Test planı, senaryo ve hata takibi (bulut) |
| Araç | SAP Solution Manager – Test Suite | Test planı ve yürütme (on-premise) |
| T-code | `SECATT` | eCATT ile otomatik test senaryoları |
| T-code | `SU53` | Yetki testinde başarısız kontrolün analizi |
| T-code | `BD87` / `WE02` | Entegrasyon testinde IDoc kontrolü |
| T-code | `VA03` / `VF03` | Test sonuçlarını belge üzerinde doğrulama |

## Sık yapılan hatalar

- **Yalnızca "mutlu yol"u test etmek:** Hatalı veri, eşik değerleri ve yetkisiz kullanıcı senaryoları atlanır.
- **Test verisini her seferinde elle hazırlamak:** Tekrarlanabilir test verisi seti olmadan regresyon testi güvenilmez olur.
- **Beklenen sonucu belirsiz yazmak:** "Sistem doğru çalışmalı" ölçülemez; rakam ve durum yazılmalı.

> [!DENE]
> [Hata Avı görevlerinde](#/track/b2b-crm/tests) 8 teklifteki hataları bularak test gözünü geliştir.
