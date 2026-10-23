# Akıllı WC Temizlik, Saha Denetimi, Olay Yönetimi ve Memnuniyet Takip Sistemi (v2.0)

Tek bir QR kod üzerinden çoklu rol yönlendirmesi (Zero-Friction Routing), dinamik SLA tolerans kural motoru, 4 katmanlı kapalı çevrim olay yaşam döngüsü ve 3 emojili kök neden analizi sunan kurumsal PWA platformu.

## 🚀 Yeni v2.0 Mimarisi ve Temel Özellikler

- **Sıfır Sürtünmeli Opaque QR Token:** Ardışık ve tahmin edilebilir ID'ler yerine kriptografik hash'li güvenli tokenlar (`/q/:token`). Yıpranan/çalınan etiketler anında sistemden iptal edilip yenilenebilir.
- **Dinamik SLA ve Tolerans Kural Motoru:** Mahale özel günlük periyodik saat slotları (`08:00, 10:00...`) ve dakika bazlı süre sapma toleransı ($\pm 15$ dk). Temizlik beyanlarında sunucu zamanıyla anlık $\Delta t$ hesaplaması:
  - *Zamanında* ($\Delta t = 0$)
  - *Plan Dışı* ($1 \le |\Delta t| \le \text{Tolerans}$)
  - *Yapılmadı / Gecikme* ($|\Delta t| > \text{Tolerans}$)
- **4 Kademeli Kapalı Çevrim Olay Yönetimi:**
  - 15 dakikalık korelasyon penceresi (mükerrer spam bilet açılışını engeller, sinyal sayısını artırır).
  - Şefe acil sesli siren uyarısı (Web Audio API) ve anlık bildirim (SSE/WebPush).
  - **2 Dakika Otopilot Eskalasyonu:** Asil şef 2 dakika içinde bilet atamazsa sistem olayı otomatik olarak **Yedek Şefe** devreder.
  - Görev atama (Dispatch) $\to$ Personel sahada müdahale $\to$ Şef yerinde doğrulama ve kapatma (Verify & Close).
- **Sürümlü Saha Denetim Checklisti (v1.2):** Puansız, 6 temel hijyen kriteri için ikili seçim (✓ Uygun / ✗ Uygun Değil). Herhangi bir uygunsuzlukta sistem **otomatik düzeltici iş emri** üretir.
- **KVKK ve Gizlilik Uyumlu Misafir Deneyimi:** Ziyaretçilere personel veya şef adı/sicili asla gösterilmez. Yalnızca son temizlik saati sunulur. 3 Emojili memnuniyet değerlendirmesi (😊 İyi, 😐 Orta, 😡 Kötü) ve 8 etiketli kök neden analiz paneli. 3 dakikalık kötüye kullanım kısıtlaması (`client_hash`).
- **WC Noktaları ve Güvenli QR Kod Yönetim Merkezi (Admin Paneli):**
  - **Yeni Mahal Ekleme:** Mahal adı, bina/blok, tolerans süresi ($\pm 10, \pm 15, \pm 20, \pm 30$ dk), temizlik vardiya şablonu (saat başı, 2 saatte bir, 3 vardiya) ve nöbetçi/yedek şef bilgileriyle tek tıkla yeni WC noktası tanımlama.
  - **Otomatik Kriptografik Opaque QR Üretimi:** Veritabanı ID'leri gizlenerek benzersiz `/q/:token` URL'i oluşturulur.
  - **Yazdırılabilir Yüksek Çözünürlüklü Saha QR Etiketi:** Fiziksel etiket baskısı için özel `@media print` stil şablonu, kurumsal başlık, ziyaretçi ve personel talimatları içeren vektörel QR sticker kartı.
  - **Token Yenileme (Revocation & Regeneration):** Sahada yıpranan, çizilen veya yetkisiz kopyalanan QR kodları tek tıkla iptal edilip anında yeni güvenli token atanabilir.
  - **Mahal Yönetimi ve Silme:** Sistemdeki tüm mahallerin canlı durumları, sorumlu şefleri ve planları tablo üzerinde izlenip yönetilebilir.
- **Kullanıcı Girişi ve Kayıt Modülü (Kimlik Doğrulama):**
  - **Giriş Yap:** Kullanıcı adı ve şifre ile güvenli oturum açma (JWT + yerel oturum tokenı).
  - **Kayıt Ol:** Ad Soyad, kullanıcı adı, şifre ve rol seçimi (Personel / Şef) ile sisteme yeni hesap açma.
  - **Hızlı Demo Girişi:** Test süreçlerini hızlandırmak için tek tıkla hazır hesaplarla (`kemal`/`123`, `ahmet`/`123`, `admin`/`123`) oturum açma kısayolları.
- **Admin Kullanıcı ve Personel Yönetim Merkezi:**
  - **Kayıtlı Kullanıcı Listesi:** Sisteme kaydolan tüm personellerin adı soyadı, kullanıcı adı, rolü ve kayıt tarihi tablo üzerinde görüntülenir.
  - **Yeni Kullanıcı Ekleme:** Yönetici panelinden şifre ve yetki belirleyerek anında yeni personel veya şef hesabı tanımlama.
  - **Kullanıcı Silme:** İşten ayrılan veya yetkisi kaldırılan personellerin hesaplarını güvenle sistemden silme (kendi aktif hesabını silme koruması dahil).
- **Analitik Yönetim Dashboard'u:**
  - 5 Temel KPI: Toplam Temizlik, Zamanında Uyum %, Plan Dışı %, Yapılmadı %, Memnuniyet (CSAT %).
  - Ortalama Müdahale Süresi (MTTR) ve Denetim Kapsama Oranı.
  - Şikayet Kök Neden Pareto Analizi (Bar grafiği).
  - Canlı Mahal Operasyon & Vardiya Matrisi.
  - Sistem Denetim İzi (Audit Trail) ve tek tıkla **CSV Rapor İndirme**.

---

## 🛠️ Teknoloji Yığını

- **Frontend:** React 18, Vite, Tailwind CSS, FontAwesome 6, `@zxing/browser` (Kamera QR okuyucu), `qrcode.react` (Yazdırılabilir QR etiketleri).
- **Backend:** NestJS 10, TypeORM, PostgreSQL 16 (Row-Level Security & Timescale uyumlu), Server-Sent Events (SSE), Web-Push (VAPID).
- **Kimlik Yönetimi:** Keycloak OIDC (OAuth2 Authorization Code + PKCE akışı).

---

## 💻 Kurulum Gerektirmeyen Çevrimdışı Demo (Windows & Mac)

Kurulum veya Docker bulunmayan ortamlarda tüm iş kurallarını (SLA motoru, sesli siren, olay atama, otomatik eskalasyon, 6 maddelik checklist ve yönetim dashboard'u) denemek için:
- Windows'ta: Proje klasöründeki **`Baslat.bat`** dosyasına çift tıklayın.
- Mac / Linux'ta: Tarayıcınızda doğrudan **`apps/web/public/index.html`** dosyasını açın.

Bu çevrimdışı referans prototip, `localStorage` üzerinde çalışan bağımsız durum makinesi ile tüm v2.0 kurallarını eksiksiz simüle eder.

---

## ⚙️ Yerel Geliştirme (Tam Yığın)

1. Depo bağımlılıklarını yükleyin:
   ```bash
   npm install
   ```
2. `.env.example` dosyasını `.env` olarak kopyalayın:
   ```bash
   cp .env.example .env
   ```
3. PostgreSQL ve Keycloak servislerini başlatın:
   ```bash
   docker compose up -d
   ```
4. Geliştirme sunucularını başlatın:
   ```bash
   npm run dev
   ```
5. Tarayıcıda açın:
   - Web Arayüzü: `http://localhost:5173`
   - API: `http://localhost:3000/api`
   - API Sağlık Kontrolü: `http://localhost:3000/api/health`
