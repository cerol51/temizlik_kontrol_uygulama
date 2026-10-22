# Proje Kuralları ve Geliştirme Talimatları (AGENTS.md)

## Otomatik GitHub Senkronizasyonu (Zorunlu Kural)
Kullanıcı talimatı doğrultusunda:
- Kod tabanında, belgelerde veya dosyalarda yapılan her geliştirme, ekleme, hata düzeltmesi veya güncelleme sonrasında değişiklikler derhal Git'e commit edilmeli ve GitHub uzak sunucusuna (`origin main` -> `cerol51/temizlik_kontrol_uygulama`) push edilmelidir.
- Commit mesajları yapılan işi net ve anlaşılır şekilde ifade eden Türkçe mesajlar olmalıdır (örnek: `feat(web): ...`, `fix(api): ...`, `docs: ...`).
- Hassas bilgiler (.env, credentials vb.) asla commit edilmemeli, `.gitignore` kurallarına titizlikle uyulmalıdır.
