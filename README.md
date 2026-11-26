# selfdeneme.com

Kendi soru bankasından ödev ve deneme hazırlama, optik form okuma (tarayıcı ya da telefon fotoğrafı) ve seviye analizi.
Sunucu tarafı yoktur: tüm veriler kullanıcının tarayıcısında (IndexedDB) saklanır.

## Yayına alma

Bu klasör statik bir sitedir; derleme adımı yoktur. Klasörün içeriğini herhangi bir statik barındırma hizmetine yükleyin:

- **Cloudflare Pages / Netlify / Vercel:** Klasörü sürükle-bırak ile yükleyin, ardından alan adı ayarlarından `selfdeneme.com` adresini bağlayın.
- **Kendi sunucunuz (nginx, Apache) ya da paylaşımlı hosting:** Dosyaları `public_html` (ya da kök dizin) içine kopyalayın.

Gereksinimler:

- Site **HTTPS** üzerinden sunulmalıdır (alan adı bağlayınca bu hizmetler sertifikayı otomatik verir).
- `index.html` dosyayı çift tıklayarak (`file://`) açıldığında çalışmaz; tarayıcılar modül dosyalarını yalnızca bir web sunucusundan yükler. Yerelde denemek için klasörde `python3 -m http.server` çalıştırıp `http://localhost:8000` adresini açın.
- `.mjs` dosyaları `application/javascript` (ya da `text/javascript`) MIME türüyle sunulmalıdır. Yukarıdaki hizmetlerin hepsi bunu varsayılan olarak yapar; Apache kullanıyorsanız `.htaccess` içine `AddType application/javascript .mjs` ekleyin.

## Klasör yapısı

```
index.html          giriş sayfası
css/app.css         görünüm
js/                 uygulama (ES modülleri)
  main.js           yönlendirme ve açılış
  db.js             yerel veritabanı (IndexedDB)
  scoring.js        puan, net, sıralama, seviye hesapları
  layout.js         soru kitapçığı dizgisi
  omr.js            optik form üretimi ve okuma
  reports.js        karneler ve sıralı listeler
  importers.js      eski program aktarımı, yedek
  pages/            ekranlar
vendor/             pdf-lib, JSZip, pdf.js (yerel kopyalar)
```

Harici bağımlılık yalnızca Google Fonts'tur; erişilemezse sistem yazı tipleri kullanılır.
