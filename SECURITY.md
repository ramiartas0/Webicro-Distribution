# Security Policy / Güvenlik Politikası

Webicro Distribution, mobil uygulama yayınlama ve dağıtım süreçlerinin güvenliğini en üst düzeyde tutmayı taahhüt eder.

---

## 1. Desteklenen Sürümler (Supported Versions)

Aşağıdaki sürümler aktif olarak güvenlik güncellemeleri ve yamaları almaktadır:

| Sürüm                         | Destek Durumu                    |
| :---------------------------- | :------------------------------- |
| `1.0.x` (Public Beta / Main)  | :white_check_mark: Destekleniyor |
| `< 1.0.0` (Alpha Ön Sürümler) | :x: Desteklenmiyor               |

---

## 2. Güvenlik Mimarisi ve Tasarım İlkeleri (Security Architecture)

Webicro Distribution, kurumsal dağıtım boru hatlarında kritik mağaza anahtarlarını ve derleme süreçlerini korumak için aşağıdaki çok katmanlı savunma ilkelerini uygular:

1. **Yalnızca Yerel Ağ İzolasyonu (Local Loopback Binding):**
   - Web kontrol paneli ve API servisi asla `0.0.0.0` (tüm ağ arayüzlerinde) dinlemez.
   - Sunucu kesinlikle yalnızca `127.0.0.1` adresine bağlanır; aynı yerel ağdaki (Wi-Fi/LAN) yabancı cihazların erişimine tamamen kapalıdır.

2. **Tek Seferlik Oturum Tokenı (Cryptographic Session Token):**
   - Web paneli her başlatıldığında kriptografik olarak rastgele 24 baytlık (`hex`) bir oturum tokenı üretilir.
   - Web arayüzü bu token ile el sıkışır; token içermeyen tüm `/api/*` ve SSE (`/api/release/events`) istekleri `401 Unauthorized` ile reddedilir.

3. **DNS Rebinding & Host Başlığı Koruması:**
   - Gelen isteklerin `Host` başlığı doğrulanır; `localhost` veya `127.0.0.1` dışındaki istekler `403 Forbidden` ile engellenir.

4. **Sıkı Origin Doğrulaması (No CORS Wildcard):**
   - Genel `Access-Control-Allow-Origin: *` başlığı kaldırılmıştır. Yalnızca yerel kontrol paneli kökenine izin verilir. Bu sayede kötü niyetli web sitelerinin tarayıcı üzerinden yerel release API'sini tetiklemesi (CSRF) engellenir.

5. **Dizin Aşımı Koruması (Path Traversal Guard):**
   - Tüm proje dizini, simge ve dosya okuma işlemleri `isSafeProjectPath` filtresinden geçirilir.
   - Sistem kök dizinlerine (`/etc`, `/usr`, `~/.ssh` vb.) erişim kesin olarak engellenir.

6. **0600 Kimlik Bilgisi Dosya İzinleri (Strict File Permissions):**
   - `.release` dizini `0700` (`rwx------`), mağaza ve AI anahtarlarını saklayan `.release/credentials.json` dosyası ise `0600` (`rw-------`) izinleriyle diske yazılır.
   - Aynı bilgisayardaki diğer kullanıcıların bu dosyayı okuması işletim sistemi seviyesinde engellenir.
   - Ortam değişkenlerinden okunan geçici anahtarlar asla izinsiz olarak kalıcı diske taşınmaz.

7. **Fail-Closed Güvenlik ve Doğrulama Mimarisi:**
   - Flutter SDK eksikliği, kod analizi hataları, birim test başarısızlıkları, sürüm notu sınır aşımı ve Git push hatalarında boru hattı sahte başarı üretmez; işlemi derhal durdurur (`FAILED`).
   - `SecretScanner` ile sürüme dahil edilen dosyalardaki API anahtarları, özel anahtarlar ve servis hesabı sızıntıları taranır.

---

## 3. Güvenlik Açığı Bildirimi (Reporting a Vulnerability)

Webicro Distribution üzerinde bir güvenlik açığı tespit ettiyseniz, lütfen bunu herkese açık GitHub Issue'ları üzerinden **PAYLAŞMAYIN**.

Bunun yerine aşağıdaki adımları izleyin:

1. **İletişim:** Güvenlik açığı detaylarını ve yeniden üretim (reproduce) adımlarını [security@webicro.com](mailto:security@webicro.com) adresine iletin.
2. **İçerik:**
   - Açığın tanımı ve etkilediği bileşen (CLI, API, Çekirdek Orchestrator vb.)
   - Adım adım kanıt (PoC / Proof of Concept) veya örnek istekler
   - Potansiyel etki ve önerilen çözüm yolu (varsa)
3. **Yanıt Süresi:** Güvenlik ekibimiz bildiriminize 48 saat içinde yanıt verecek ve açığın doğrulanmasını takiben sorumlu açıklama (Responsible Disclosure) ilkeleri doğrultusunda en geç 7 iş günü içinde bir yama yayınlayacaktır.
