## Amaç

SAP projelerinde kullanılan SAP Activate metodolojisinin fazlarını, cutover (canlıya geçiş) planını ve hypercare dönemini öğrenmek.

## SAP Activate

SAP Activate, SAP S/4HANA projeleri için SAP'nin önerdiği metodolojidir. Üç temel üzerine kurulur: **SAP Best Practices** (hazır süreç içeriği), **rehberli yapılandırma** ve **çevik (agile) proje yönetimi**.

### Fazlar

| Faz | Odak | Tipik çıktılar |
|---|---|---|
| Discover | Çözümü keşfetme, iş gerekçesi | Değer analizi, kapsam fikri |
| Prepare | Projeyi başlatma | Proje planı, ekip, sistem erişimi |
| Explore | Fit-to-standard atölyeleri | Süreç tasarımı, gap (fark) listesi, backlog |
| Realize | Yapılandırma, geliştirme, test | Ayarlar, geliştirmeler, entegrasyon testi, veri yükleme provaları |
| Deploy | Canlıya hazırlık ve geçiş | UAT, son kullanıcı eğitimi, cutover, canlıya geçiş, hypercare |
| Run | Sürekli işletim ve iyileştirme | Destek, optimizasyon, yeni sürümler |

Fazlar arasında **kalite kapıları** (quality gate) vardır; bir faz kriterleri karşılanmadan sonraki faza geçilmez.

### Fit-to-standard

Explore fazında SAP'nin standart süreçleri iş birimine **canlı sistemde** gösterilir. Amaç önce standarda uymak, gerçekten gerekli farklar için geliştirme yapmaktır. Bu yaklaşım eski "fit-gap" yönteminden farklı olarak "standart sürecin neresi bize uymuyor?" sorusundan başlar.

## Cutover

Cutover, eski sistemden yeni sisteme geçişin **saat saat** planlandığı dönemdir. Tipik cutover planı:

1. **Dondurma:** Eski sistemde ana veri ve belirli işlemler durdurulur.
2. **Veri taşıma:** Açık kalemler, stoklar, açık siparişler, ana veri yeni sisteme yüklenir.
3. **Mutabakat:** Taşınan veri eski sistemle karşılaştırılır (stok miktarı, açık bakiye toplamı).
4. **Doğrulama (smoke test):** Kritik işlemler canlı sistemde bir kez denenir.
5. **Go / No-go kararı:** Kontrol listesine göre canlıya geçiş kararı verilir.

> [!UYARI]
> Cutover planında geri dönüş (rollback) adımları da yazılı olmalıdır. "Canlıya geçemezsek ne yaparız?" sorusunun cevabı önceden belli olmalıdır.

Veri taşıma S/4HANA'da çoğunlukla **SAP S/4HANA Migration Cockpit** ile yapılır; taşıma en az bir kez provası yapılarak (mock load) denenir.

## Hypercare

Canlıya geçişten sonraki ilk haftalarda proje ekibi yoğun destek verir. Bu döneme **hypercare** denir:

- Günlük hata ve talep toplantıları
- Arayüz ve iş akışı monitörlerinin sık kontrolü
- Ay sonu kapanışının ilk kez yeni sistemde yapılması
- Destek sorumluluğunun kalıcı destek ekibine devri

## Ege Dağıtım'dan örnek

Ege Dağıtım'ın CRM–ERP projesinde:

- **Explore:** Teklif onay kuralı (%12 / 50.000 ₺) fit-to-standard atölyesinde netleşti; kampanya iskontosu için şirkete özel ZKMP koşul türü kararlaştırıldı.
- **Realize:** Onay akışı ve sipariş aktarımı yapılandırıldı, entegrasyon testi yapıldı.
- **Deploy:** Key user Oğuz Öztürk UAT'yi yönetti; cutover hafta sonunda açık siparişler ve müşteri bakiyeleri taşındı.
- **Hypercare:** İlk hafta Aktarım Monitörü günde üç kez kontrol edildi; aday müşterilerden gelen aktarım hataları için ana veri açılış süreci hızlandırıldı.

## İlgili araçlar

| Tür | Kod / Araç | Açıklama |
|---|---|---|
| Araç | SAP Activate Roadmap Viewer | Faz bazında görev ve şablonlar |
| Araç | SAP Cloud ALM | Proje, test ve canlı izleme (bulut) |
| Araç | SAP Solution Manager | Proje ve test yönetimi (on-premise) |
| Araç | SAP S/4HANA Migration Cockpit | Veri taşıma (Fiori uygulaması olarak) |
| T-code | `LTMOM` | Migration Cockpit taşıma nesnesi modelleyici |
| T-code | `SPRO` | Realize fazında yapılandırma |

## Sık yapılan hatalar

- **Explore'u kısaltmak:** Netleşmeyen süreçler Realize'da değişiklik talebi olarak geri döner.
- **Veri taşıma provasını atlamak:** İlk deneme cutover gecesine kalır; mutabakat tutmaz.
- **Hypercare'i erken bitirmek:** İlk ay sonu kapanışı ve ilk tam fatura dönemi görülmeden destek devredilmemelidir.

> [!DENE]
> [Kampanyalı teklifi uçtan uca onaylat](#/track/b2b-crm/scenarios/uctan-uca-onay) senaryosunu bir UAT senaryosu gibi yürüt ve her adımın sonucunu not et.
