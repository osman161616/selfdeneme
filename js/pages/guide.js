import { $$ } from '../util.js';

export async function render(host) {
  host.innerHTML = `<article class="guide">
  <div class="page-head"><div><h1>Rehber</h1><p>selfdeneme ile soru bankanızı kurmaktan karneyi yazdırmaya kadar her adım. İlk kez kullanıyorsanız baştan sona bir kez okumanız yeterli; sonra ihtiyaç duyduğunuz bölüme dönebilirsiniz.</p></div></div>
  <nav class="toc scroll" aria-label="Bölümler">
    <a href="#g-genel">Nasıl çalışır</a><a href="#g-banka">Soru bankası</a><a href="#g-kirp">Soru kırpma</a><a href="#g-toplu">Toplu yükleme</a><a href="#g-eski">Eski programdan geçiş</a><a href="#g-ogr">Öğrenciler</a><a href="#g-odev">Ödev</a><a href="#g-deneme">Deneme ve optik form</a><a href="#g-online">Online çözdürme</a><a href="#g-sinav">LGS ve YKS denemeleri</a><a href="#g-puan">Puan hesabı</a><a href="#g-okut">Formları okutma</a><a href="#g-analiz">Analiz ve karne</a><a href="#g-yedek">Yedek</a><a href="#g-sss">Sorunlar</a>
  </nav>

  <h2 id="g-genel">Nasıl çalışır?</h2>
  <p>selfdeneme kendi kendinize deneme ve ödev oluşturabileceğiniz bir platformdur: <b>bütün sorularınız, öğrenci listeniz ve sınav sonuçlarınız yalnızca kullandığınız tarayıcıda saklanır</b>. Hiçbir sunucuya yüklenmez, üyelik gerekmez. Bu yüzden:</p>
  <ul><li>Öğrenci bilgileri kurumunuzdan çıkmaz; kişisel verilerle ilgili ek bir yük oluşmaz.</li>
  <li>Verileriniz o bilgisayardaki o tarayıcıya bağlıdır. Başka bilgisayarda çalışmak ya da tarayıcı verilerini temizlemek istediğinizde <a href="#g-yedek">yedek dosyası</a> kullanırsınız.</li></ul>
  <p>Önerilen tarayıcılar: <b>Google Chrome</b> ya da <b>Microsoft Edge</b> (güncel sürüm). Firefox ve Safari de çalışır.</p>
  <p>Genel akış şöyledir:</p>
  <ol><li>Soru bankasını kurarsınız (sorular ders › konu › zorluk düzeninde).</li><li>Öğrencileri eklersiniz.</li><li>Ödev ya da deneme hazırlarsınız; program öğrencinin daha önce görmediği soruları seçer.</li><li>Denemede optik formları yazdırır, sınavdan sonra tarar ya da fotoğraflarsınız.</li><li>Sonuçlardan karne, sıralı liste ve seviye analizi alırsınız; zayıf konulara göre yeni ödev hazırlarsınız.</li></ol>

  <h2 id="g-banka">Soru bankası nasıl düzenlenir?</h2>
  <p>Her soru tek bir görseldir (PNG ya da JPG) ve dört bilgi taşır:</p>
  <div class="scroll"><table class="tbl"><thead><tr><th>Bilgi</th><th>Açıklama</th><th>Örnek</th></tr></thead><tbody>
  <tr><td><b>Ders</b></td><td>Ayarlar sayfasındaki ders listesinden seçilir ya da yeni yazılır.</td><td>Matematik</td></tr>
  <tr><td><b>Konu</b></td><td>Kazanım ya da ünite adı. Analizler konu bazında yapıldığı için aynı konuyu hep aynı yazın.</td><td>Üslü İfadeler</td></tr>
  <tr><td><b>Zorluk</b></td><td>1 (çok kolay) – 5 (çok zor). Emin değilseniz 3 verin; sınavlar yapıldıkça "Zorluk analizi" gerçek zorluğu önerir.</td><td>3</td></tr>
  <tr><td><b>Doğru cevap</b></td><td>A–E. Cevap anahtarları ve sınav değerlendirmesi buradan üretilir.</td><td>C</td></tr>
  </tbody></table></div>
  <p>Ayrıca her soru <b>yatay</b> (sayfa genişliğinde) ya da <b>dikey</b> (yarım sütun) yerleşir. Şıkları yan yana dizilmiş, geniş tablolu ya da grafikli sorular yatay; diğerleri dikey olmalıdır. Dikey sorular iki sütuna yerleştiği için sayfa tasarrufu sağlar.</p>
  <div class="tip"><b>Önemli:</b> Soru görseline <b>soru numarasını dahil etmeyin</b>. Program her belgede soruları kendisi numaralandırır; görselde eski numara kalırsa öğrenci iki numara görür.</div>
  <p>Zorluk ölçeğinin anlamı (sınavlardan sonra program da bu ölçeği kullanır):</p>
  <div class="scroll"><table class="tbl"><thead><tr><th class="num">Zorluk</th><th>Beklenen doğru oranı</th></tr></thead><tbody><tr><td class="num">1</td><td>%81–100</td></tr><tr><td class="num">2</td><td>%61–80</td></tr><tr><td class="num">3</td><td>%41–60</td></tr><tr><td class="num">4</td><td>%21–40</td></tr><tr><td class="num">5</td><td>%0–20</td></tr></tbody></table></div>

  <h2 id="g-kirp">Yöntem 1 · Soru kırpma aracı (önerilen)</h2>
  <p>Elinizdeki bir test kitabının PDF'inden, Word'de hazırladığınız sayfalardan (Word'de <i>Farklı kaydet › PDF</i>) ya da telefonla çektiğiniz sayfa fotoğraflarından soru üretmenin en hızlı yolu.</p>
  <ol><li><a href="#kirp">Soru Kırp</a> sayfasında <b>PDF aç</b> ya da <b>Görsel aç</b>'a basın. Birden fazla dosya seçebilirsiniz.</li>
  <li>Sağdaki panelde <b>ders</b> ve <b>konu</b>yu yazın, <b>zorluğu</b> seçin.</li>
  <li>Sayfada sorunun etrafına fareyle dikdörtgen çizin. Soru kökünden son şıkka kadar alın, soru numarasını dışarıda bırakın. Kenarlardaki boşluklar otomatik kırpılır.</li>
  <li>Doğru cevabı seçin (klavyede <span class="kbd">A</span>–<span class="kbd">E</span>) ve <span class="kbd">Enter</span> ile kaydedin.</li>
  <li>Bir sonraki soruyu çizin. Ders, konu ve zorluk korunur; yalnızca cevabı seçmeniz yeter. Sayfa değiştirmek için <span class="kbd">→</span> / <span class="kbd">←</span>.</li></ol>
  <p>Yanlış kaydettiğiniz soruyu "Sonuncuyu geri al" ile silebilir, daha sonra <a href="#banka">Soru Bankası</a>'nda üzerine tıklayıp ders, konu, zorluk ve cevabını düzeltebilirsiniz. Genişçe çizdiğiniz seçimler otomatik olarak yatay işaretlenir.</p>

  <h3 id="g-oto">Otomatik kesme (tüm PDF'i tek seferde)</h3>
  <p>Bilgisayarda hazırlanmış bir PDF'iniz varsa — MEB'in yayımladığı LGS soru kitapçıkları, ÖSYM soruları, yayınevi denemeleri ya da Word'den kaydettiğiniz testler — soruları tek tek çizmeniz gerekmez:</p>
  <ol><li>PDF'i <b>Soru Kırp</b>'ta açın ve üst çubuktaki <b>Otomatik kes</b>'e basın.</li>
  <li>Program soru numaralarını ("1.", "2)" …) bulur, her soruyu bir sonraki numaraya kadar keser. Şekiller, tablolar, grafikler sorunun içinde kalır; soru numarası, sayfa başlıkları, alt bilgi ve arka plandaki filigran (ör. MEB amblemi) temizlenir.</li>
  <li>Numaraların 1'den yeniden başladığı yerler ayrı test sayılır. Ders, sayfa başlığından tahmin edilir ("TÜRKÇE" → Türkçe). Kitapçığın sonunda cevap anahtarı varsa o da okunur; yoksa anahtarın ekran görüntüsünü testin anahtar kutusuna yapıştırabilirsiniz.</li>
  <li>İnceleme ekranında her test için <b>konu</b> yazın (gerekirse soru bazında değiştirin), cevapları kontrol edin. Anahtarı başka yerden alıyorsanız harfleri kutuya yapıştırmanız yeter (<code>ABDAC…</code> ya da <code>1-A 2-B …</code>).</li>
  <li>Yanlış kesilmiş bir soru görürseniz <b>Elle düzelt</b>'e basın: sayfa açılır, kutu hazır gelir; düzeltip <span class="kbd">Enter</span> ile kaydedersiniz.</li>
  <li><b>Seçilenleri bankaya kaydet</b> ile hepsini birden ekleyin.</li></ol>
  <p><b>Ortak köklü sorular:</b> "6. ve 7. soruları aşağıdaki bilgilere göre cevaplayınız." gibi bir girişle başlayan bilgi metni ya da tablo, gruptaki her sorunun üstüne eklenir; giriş cümlesi silinir (numaralar denemede değişeceği için). Böylece bu sorular bankada tek başına da anlaşılır.</p>
  <p><b>Yazı boyutu:</b> PDF'ten kesilen sorular denemede kitaptaki yazı boyutuyla basılır; dar ya da geniş kesilen sorular büyüyüp küçülmez. Hepsini sütun genişliğine büyütmek isterseniz Ayarlar'daki "Soruları sütun genişliğine büyüt" kutusunu işaretleyin.</p>
  <p><b>Çözümlü kitapçıklar:</b> Testten sonra gelen ve numaraları yine 1'den başlayan çözüm bölümleri ayrı tutulur: şıkları olmayan ya da "Cevap: B" / "Doğru cevap: C" satırı içeren bölümler <i>çözüm bölümü</i> sayılır, bankaya eklenmez ve aynı sayıda sorusu olan teste bağlanır. Kitapçıkta cevap anahtarı yoksa cevaplar bu çözümlerden alınır. Program bir bölümü yanlış sınıflandırırsa test başlığındaki <b>Soru testi / Çözüm bölümü</b> düğmesiyle değiştirebilirsiniz.</p>
  <p class="small muted">Taranmış (fotoğraf/tarama) PDF'lerde metin katmanı olmadığı için otomatik kesme çalışmaz; bunlarda elle kesme kullanılır. Telif hakkı size ait olmayan kaynaklardan aldığınız soruları yalnızca kendi öğrencilerinizle, kurum içinde kullanın.</p>

  <h2 id="g-toplu">Yöntem 2 · Hazır görselleri toplu yükleme</h2>
  <p>Soruları zaten tek tek görsel olarak kaydettiyseniz <a href="#banka">Soru Bankası › Toplu görsel ekle</a> ile bir konunun tüm sorularını birden ekleyin. Dosya adları şu kurala uyarsa cevaplar kendiliğinden tanınır:</p>
  <div class="scroll"><table class="tbl"><thead><tr><th>Dosya adı</th><th>Anlamı</th></tr></thead><tbody>
  <tr><td><code>uslu_ifadeler_07_c.png</code></td><td>Adın son harfi doğru cevaptır: <b>C</b></td></tr>
  <tr><td><code>soru12b.jpg</code></td><td>Doğru cevap <b>B</b></td></tr>
  <tr><td><code>y_grafik_soru_a.png</code></td><td>"y" ile başlıyor: "Dosya adına göre" seçilirse <b>yatay</b> yerleşir; cevap <b>A</b></td></tr>
  <tr><td><code>soru 4.png</code></td><td>Cevap tanınmaz; pencerede elle seçersiniz</td></tr></tbody></table></div>
  <p>Görseller beyaz zeminli ve okunaklı olmalı. Genişliği 800–2000 piksel arası idealdir; daha büyük görseller otomatik küçültülür.</p>

  <h2 id="g-eski">Yöntem 3 · Bilgisayardan hazır klasör olarak yükleme</h2>
  <p>Soru görsellerini bilgisayarınızda klasörlere ayırıp hepsini tek seferde içe aktarabilirsiniz. Klasörleri aşağıdaki gibi düzenleyin: en üstte <code>banka</code>, içinde <code>sorular</code>, onun içinde ders, konu ve zorluk (1–5) klasörleri. Sonra <a href="#banka">Soru Bankası › İçe aktar</a>'a basıp <code>banka</code> klasörünü seçin (isterseniz ZIP olarak sıkıştırıp onu da seçebilirsiniz):</p>
  <pre>banka/
└── sorular/
    └── Matematik/
        └── Üslü İfadeler/
            ├── 1/  dSORU01a.png  dSORU02d.png …
            ├── 2/  …
            └── 5/  ySORU07c.png …</pre>
  <p>Görselin adının <b>ilk harfi</b> sorunun nasıl yerleşeceğini söyler: <b>y</b> ile başlıyorsa yatay, <b>d</b> ile başlıyorsa dikey. Adın <b>son harfi</b> de doğru cevaptır. Örneğin <code>dSORUa.png</code> dikey yerleşen ve cevabı A olan bir sorudur; <code>ySORU07c.png</code> ise yatay yerleşir, cevabı C'dir.</p>
  <p>Eski masaüstü Ödev Programı'nın <code>banka</code> klasörü de tam bu düzende olduğu için doğrudan seçebilirsiniz; öğrenciler, sınavlar ve analizler de birlikte gelir. Aynı soru iki kez eklenmez, işlemi gönül rahatlığıyla tekrarlayabilirsiniz.</p>

  <h2 id="g-ogr">Öğrenciler</h2>
  <p><a href="#ogrenciler">Öğrenciler</a> sayfasında <b>Toplu ekle</b>'ye basıp e-Okul ya da Excel listenizden <b>numara, ad soyad, şube</b> sütunlarını kopyalayıp yapıştırın. Sütun sırası önemli değil. Şube <code>8A</code>, <code>8-B</code> gibi yazılabilir; sınıf düzeyi (8) şubeden otomatik çıkarılır.</p>
  <p>Öğrenci numarası her şeyin anahtarıdır: optik formdaki numara bu listeyle eşleşir, ödev geçmişi numaraya bağlıdır. Listede olmayan bir numara formda çıkarsa kontrol ekranında ad ve şubesini girmeniz istenir.</p>

  <h2 id="g-odev">Ödev hazırlama</h2>
  <h3>Elle seçim</h3>
  <ol><li><a href="#hazirla">Ödev ve Deneme</a> sayfasında soldan öğrencileri seçin. Şube düğmesi o şubenin tamamını seçer.</li>
  <li>Ders, konu, zorluk seçip <b>Ekle</b> ile tabloya satır ekleyin; "Verilecek" sütununa soru sayısını yazın. "Kullanılabilir" sütunu, seçili öğrencilerin henüz görmediği soru sayısıdır.</li>
  <li>"Her öğrenciye ayrı ödev" açıksa her öğrenci kendi görmediği sorulardan farklı bir ödev alır; kapalıysa herkese ortak ödev üretilir.</li>
  <li><b>Ödevi hazırla</b>'ya basın. PDF ve cevap anahtarı hazırlanır, sorular öğrencilerin geçmişine yazılır.</li></ol>
  <p>Program önce başka öğrencilerin görüp seçilenlerin görmediği soruları kullanır; böylece bankanın tamamı dengeli tüketilir. Yeni soru kalmadıysa "daha önce görülenlerle tamamla" seçeneği en eski görülen soruları kullanır.</p>
  <h3>Otomatik ödev</h3>
  <p>Her öğrencinin bütün sınavlarındaki sonuçlarına bakılır; her dersten doğru oranı en düşük konular seçilir. Soru zorluğu, öğrencinin o konudaki seviyesine göre ayarlanır. Böylece zorlanan öğrenciye kolay, iyi olana zor sorular gider. Özet dosyası hangi konunun neden verildiğini gösterir.</p>
  <h3>Analizden ödev</h3>
  <p><a href="#analiz">Seviye Analizi</a> sayfasında bir öğrenci ya da şube seçip <b>Bu analizden ödev hazırla</b>'ya basarsanız tablo, yanlış yapılan ders/konu/zorluklarla dolu gelir.</p>

  <h2 id="g-deneme">Deneme ve optik form</h2>
  <ol><li>Ödev ve Deneme sayfasında türü <b>Deneme sınavı</b> seçin, başlık verin, soru dağılımını tabloya girin.</li>
  <li><b>Denemeyi hazırla</b> ile üç dosya alırsınız: soru kitapçığı, cevap anahtarı (PDF ve CSV) ve optik formlar.</li>
  <li>Seçili öğrenciler için formlar <b>kişiye özel</b> basılır: ad, şube ve numara hazır gelir, numara kutucukları zaten doludur. İstediğiniz kadar boş form da ekleyebilirsiniz.</li></ol>
  <div class="tip"><b>Yazdırırken:</b> Formları <b>gerçek boyutta (%100)</b> yazdırın; "sayfaya sığdır" seçeneğini kapatın. Renkli ya da siyah-beyaz fark etmez. Formun dört köşesindeki siyah kareler kesilmemeli.</div>
  <p>Öğrencilere söyleyin: koyu kurşun kalem kullanın, daireyi tamamen doldurun, değiştirirken iyice silin, formu katlamayın. Boş formda numarayı sağa yaslı yazıp kodlasınlar.</p>
  <p>Başka bir yayının denemesini de değerlendirebilirsiniz: <a href="#sinavlar">Sınavlar › Sınav değerlendir</a>'de cevap anahtarını elle yazın ya da CSV yükleyin, ardından o anahtar için boş optik form yazdırın.</p>

  <h2 id="g-online">Online çözdürme: telefondan ya da bilgisayardan</h2>
  <p>Hazırladığınız her ödevi ve denemeyi kâğıt basmadan da çözdürebilirsiniz. Öğrenci linki açar, soruları telefonunda ya da bilgisayarında görür, cevabını işaretler ve gönderir. Optik form, tarama, kontrol ekranı yok; cevaplar doğrudan size gelir.</p>
  <ol><li><a href="#hazirla">Ödev ve Deneme › Hazırlanan belgeler</a>'de belgenin yanındaki <b>Online yayınla</b>'ya basın. (Ödevi ya da denemeyi hazırladığınız anda çıkan pencerede de aynı düğme var.)</li>
  <li>Başlangıç ve bitiş saatini, varsa süreyi seçin. LGS ve YKS denemelerinde resmî süre kendiliğinden gelir. Süre, öğrenci "Başla"ya bastığı anda işlemeye başlar; bitince cevaplar kendiliğinden gönderilir.</li>
  <li>Kimlerin çözebileceğini seçin. Öğrenci listesinden seçerseniz yalnızca o numaralar girebilir; öğrenci numarasını yazınca adını görür ve "Bu benim" der. "Linki alan herkes" seçeneğinde öğrenci numarasıyla birlikte adını ve şubesini kendisi yazar.</li>
  <li>Öğrencinin sonucunu ne zaman göreceğine karar verin: hemen, sınav bittikten sonra ya da hiç (siz paylaşırsınız). Deneme yapıyorsanız "bittikten sonra" seçin; yoksa ilk bitiren cevapları arkadaşlarına söyleyebilir.</li>
  <li><b>Yayınla</b>'ya basınca linki ve karekodu alırsınız. Linki WhatsApp grubuna atabilir ya da karekodu tahtaya yansıtabilirsiniz. Öğrenciler sitedeki <code>coz</code> sayfasına girip 8 haneli sınav koduyla da girebilir.</li></ol>
  <p>Sınav sürerken aynı penceredeki <b>Yenile</b> ile kaç öğrencinin gönderdiğini görürsünüz. Bitince <b>Sonuçları sınava aktar</b>'a basın; sonuçlar Sınavlar sayfasına optik formdan okunmuş gibi gelir, karne, sıralı liste ve seviye analizi her zamanki gibi çalışır. Geç gönderenler olursa bir kez daha aktarmanız yeterli, aynı öğrenci iki kez eklenmez.</p>
  <div class="tip"><b>Öğrenci açısından:</b> Cevaplar her işaretlemede telefona kaydedilir. İnternet giderse ya da sayfa kapanırsa linki yeniden açıp kaldığı yerden devam eder; süreli sınavlarda süre bu arada işlemeye devam eder. Her öğrenci sınavı bir kez gönderebilir. Yanlışlıkla gönderen ya da sorun yaşayan öğrenci için yönetim penceresindeki gönderenler listesinden <b>Yeniden çözsün</b>'e basabilirsiniz.</div>
  <p>Sonucu açık olan öğrenci gönderir göndermez netini, tahmini puanını, ders ders doğru-yanlışlarını ve hangi konularda zorlandığını görür; yanlış ve boş bıraktığı soruları doğru cevaplarıyla birlikte tek tek inceleyebilir. Okul bilgisayarında sırayla çözüyorlarsa sonuç ekranındaki "Bu cihazda başka bir öğrenci olarak gir" bağlantısını gösterin.</p>
  <p class="small muted">Online sınav için sunucuya yalnızca o sınavın soruları, cevap anahtarı ve seçtiğiniz öğrencilerin numarasıyla adının kısaltması ("Ali Y.") gider; soru bankanız gitmez. Sınav, bitiş saatinden 30 gün sonra sunucudan kendiliğinden silinir; isterseniz <b>Yayını kaldır</b> ile hemen de silebilirsiniz. Aktardığınız sonuçlar bilgisayarınızda kalır.</p>

  <h2 id="g-sinav">LGS ve YKS denemeleri</h2>
  <p>Deneme hazırlarken <b>Sınav türü</b> olarak LGS, TYT, AYT ya da YDT seçerseniz deneme resmî sınavla birebir aynı düzende olur: aynı testler, aynı sıra, aynı soru sayıları, aynı şık sayısı. Kitapçıkta her test yeni sayfada başlar ve numaralar test içinde sürer (TYT Sosyal Bilimler 1–25 gibi). Optik form da aynı düzende basılır.</p>
  <div class="scroll"><table class="tbl"><thead><tr><th>Sınav</th><th>Testler ve soru sayıları</th><th>Şık</th><th>Yanlış</th></tr></thead><tbody>
  <tr><td><b>LGS</b></td><td>Sözel: Türkçe 20, İnkılap Tarihi 10, Din Kültürü 10, Yabancı Dil 10 · Sayısal: Matematik 20, Fen Bilimleri 20 (toplam 90)</td><td>4</td><td>3 yanlış 1 doğru</td></tr>
  <tr><td><b>TYT</b></td><td>Türkçe 40 · Sosyal Bilimler 20 (Tarih 5, Coğrafya 5, Felsefe 5, Din Kültürü 5) · Temel Matematik 40 · Fen Bilimleri 20 (Fizik 7, Kimya 7, Biyoloji 6)</td><td>5</td><td>4 yanlış 1 doğru</td></tr>
  <tr><td><b>AYT</b></td><td>TDE-Sosyal-1 40 (Edebiyat 24, Tarih-1 10, Coğrafya-1 6) · Sosyal-2 40 (Tarih-2 11, Coğrafya-2 11, Felsefe Grubu 12, Din Kültürü 6) · Matematik 40 · Fen 40 (Fizik 14, Kimya 13, Biyoloji 13)</td><td>5</td><td>4 yanlış 1 doğru</td></tr>
  <tr><td><b>YDT</b></td><td>Yabancı Dil 80</td><td>5</td><td>4 yanlış 1 doğru</td></tr>
  </tbody></table></div>
  <p class="small muted">Kaynak: ÖSYM 2026-YKS Kılavuzu ve MEB 2026 LGS Kılavuzu. ÖSYM ve MEB, 2027 sınavları için yapı değişikliği açıklamadı.</p>
  <h3>Soru bankasında ders adları</h3>
  <p>Şablon, her bölüm için bankada şu ders adlarını arar: Türkçe, Türk Dili ve Edebiyatı, Tarih, Coğrafya, Felsefe (AYT Felsefe Grubu için Psikoloji, Sosyoloji, Mantık da olur), Din Kültürü ve Ahlak Bilgisi, Matematik ve Geometri (ikisi de Matematik testine girer), Fizik, Kimya, Biyoloji, İngilizce; LGS için T.C. İnkılap Tarihi ve Atatürkçülük ile Fen Bilimleri. Bankanızda farklı bir ad kullandıysanız şablon tablosundaki ders listesinden onu da seçebilirsiniz.</p>
  <p>AYT'de Tarih-1 ile Tarih-2 aynı "Tarih" dersinden gelir; hangi konuların hangisine gireceğini satırdaki konu seçimiyle belirlersiniz. Bir bölüme farklı konulardan soru koymak için o bölümün yanındaki <b>+</b> düğmesiyle satır ekleyin; satırların toplamı resmî sayıya eşit olmalıdır.</p>
  <h3>Din Kültürü muafiyeti</h3>
  <p>Öğrenci kaydında "Din Kültürü dersinden muaf" işaretli öğrenciler, ÖSYM'deki gibi TYT Sosyal'de 21–25. ve AYT Sosyal-2'de 41–46. ek Felsefe sorularını cevaplar; Din Kültürü soruları onlar için değerlendirilmez. Diğer öğrencilerde ek Felsefe soruları değerlendirilmez. LGS'de muaf öğrencinin bu testteki puanı, MEB'in kuralıyla diğer testlerdeki başarısından orantılanır.</p>
  <h3>AYT ve YDT için TYT eşleştirmesi</h3>
  <p>SAY, EA, SÖZ ve DİL puanlarının %40'ı TYT'den gelir. AYT ya da YDT denemesini değerlendirirken ya da sonradan sınavın <b>Cevap anahtarı ve ayarlar</b> sekmesinde, öğrencilerin girdiği bir TYT denemesini seçin. Program her öğrencinin o TYT'deki netlerini kullanır; o TYT'ye girmemiş öğrencinin AYT puanı hesaplanmaz.</p>
  <h3>Branş ve kısmi denemeler</h3>
  <p>Şablon tablosunun üstündeki <b>Branş / kısmi deneme</b> seçeneğiyle yalnızca istediğiniz testleri (örneğin TYT Türkçe + Temel Matematik ya da LGS sayısal oturumu) veya tek bir dersi (örneğin yalnızca TYT Fizik, AYT Biyoloji, LGS Fen) seçebilirsiniz. Şık sayısı, yanlış kuralı ve numaralandırma seçtiğiniz sınavdan gelir. "Soru sayıları resmî sayıda kalsın" seçeneğini kapatırsanız bölüm başına istediğiniz kadar soru koyabilirsiniz (örneğin 20 soruluk bir Fizik taraması).</p>
  <p>Tahmini puan yalnızca gerçekten hesaplanabildiğinde gösterilir: LGS'nin tamamı, TYT'nin tamamı ya da AYT'de bir puan türünün bütün testleri (SAY için Matematik + Fen gibi). Diğer branş denemelerinde sonuçlar toplam net ve doğru oranına göre sıralanır; karne, sıralı liste ve seviye analizi aynen çalışır.</p>
  <h3>Başka yayınların denemeleri</h3>
  <p><b>Cevap anahtarını görselden okutma:</b> Cevap anahtarı kutularının altındaki <b>Görselden oku</b> düğmesiyle anahtarın ekran görüntüsünü ya da fotoğrafını seçin; ya da görüntüyü kopyalayıp kutuya yapıştırın (Ctrl+V) veya sürükleyin. Program "1.A 2.D", "1-C", tablo hâlinde numara/harf, numarasız tek satır ya da tek sütun harf gibi yaygın düzenleri tanır; başlıktaki yazıları ("TEST 6", "TÜRKÇE") ayıklar. Okunan harfler görselin yanında gösterilir ve soru sayısıyla karşılaştırılır: okunamayan cevaplar <code>?</code> (ya da <code>-</code>) olarak gelir, kutuda düzeltirsiniz. Görsel bilgisayarınızda işlenir, hiçbir yere gönderilmez. En iyi sonuç için anahtarı ekranda büyütüp yalnızca o testi içine alan net bir görüntü alın.</p>
  <p>Bir yayınevinin hazır denemesini uyguladıysanız <b>Sınavlar › Sınav değerlendir › LGS / TYT / AYT / YDT cevap anahtarı gir</b> ile her testin cevaplarını art arda yazın. Ardından o anahtar için boş optik form yazdırıp okutabilirsiniz. Uygulamadığınız testleri boş bırakın. Yayının branş denemesi için <b>Tek ders (branş denemesi)</b> sekmesinde dersi seçip cevapları istediğiniz sayıda yazın.</p>

  <h2 id="g-puan">Puanlar nasıl hesaplanır?</h2>
  <p>Gerçek LGS ve YKS puanı, o yıl sınava giren herkesin ortalamasına ve standart sapmasına göre standartlaştırılır. Bu yüzden hiçbir deneme kesin puanı bilemez. selfdeneme, resmî kılavuzlardaki ağırlıklarla <b>tahmini puan</b> hesaplar:</p>
  <pre>Tahmini puan = 100 + 400 × Σ (testin ağırlığı × net ÷ soru sayısı)</pre>
  <ul><li><b>TYT:</b> Türkçe %33, Sosyal %17, Temel Matematik %33, Fen %17. Yani 1 Türkçe ya da Matematik neti 3,3; 1 Sosyal ya da Fen neti 3,4 puan.</li>
  <li><b>SAY / EA / SÖZ / DİL:</b> %40 TYT + %60 AYT ya da YDT. Örneğin SAY'da 1 AYT Matematik neti 3; 1 Fizik neti yaklaşık 2,86; 1 Kimya ya da Biyoloji neti yaklaşık 3,08 puan.</li>
  <li><b>LGS:</b> Türkçe, Matematik ve Fen katsayısı 4; İnkılap, Din ve Yabancı Dil 1. Tüm sorular doğru olursa 500.</li>
  <li><b>Yerleştirme puanı:</b> Öğrencinin diploma notu girildiyse YKS puanına OBP × 0,12 eklenir (OBP = diploma notu × 5). Geçen yıl yerleşmiş öğrenci için 0,06.</li>
  <li><b>0,5 net kuralı:</b> TYT puanı için Türkçe ya da Temel Matematikten, diğer puan türleri için ilgili testlerin birinden en az 0,5 net gerekir; yoksa puan "–" görünür.</li>
  <li><b>İptal edilen soru:</b> Herkese doğru sayılmaz. ÖSYM ve MEB'deki gibi değerlendirme dışı bırakılır; test kalan sorular üzerinden puanlanır.</li></ul>
  <p>Ayarlar sayfasında tüm ağırlıkları ve 1 netin her testteki değerini görebilirsiniz.</p>

  <h2 id="g-okut">Formları okutma</h2>
  <p><a href="#sinavlar">Sınavlar › Sınav değerlendir</a>'de denemeyi seçin ve formları ekleyin. Üç yol var:</p>
  <h3>Fotokopi makinesi / tarayıcı (en hızlı)</h3>
  <ul><li>Tüm formları belge besleyiciye koyun, <b>PDF olarak tara</b> deyin. 200–300 DPI, gri ya da siyah-beyaz yeterli.</li><li>Tek PDF içinde onlarca form olabilir; hepsi sırayla okunur. Kâğıdın ters ya da yan girmesi sorun değildir.</li></ul>
  <h3>Telefon fotoğrafı</h3>
  <ul><li>Formu düz, koyu olmayan bir zemine koyun; dört köşedeki siyah kareler kadrajda olsun.</li><li>Telefonu kâğıda paralel tutun, gölgenizi düşürmeyin, flaş kullanmayın.</li><li>Fotoğrafları bilgisayara aktarıp birden seçebilirsiniz.</li></ul>
  <h3>Kontrol ekranı</h3>
  <p>Program her formdan öğrenci numarasını ve cevapları okur. Emin olamadığı durumları işaretler: iki şık işaretli, silinmiş ama iz kalmış, çok silik işaret, numarası kayıtlı olmayan öğrenci, aynı numaranın iki formda geçmesi. Her biri için formdan kesilmiş görüntüyü görür, doğru şıkka tek tıkla düzeltirsiniz. <b>Sonraki sorunlu</b> düğmesi sizi uyarılı formlar arasında gezdirir.</p>
  <p>Optik okuyucu cihazınız varsa <b>Optik okuyucu dosyası</b> sekmesinden cihazın metin çıktısını (eski programdaki maskeyle) yükleyebilirsiniz. Az sayıda öğrenci için <b>Elle giriş</b> de var.</p>

  <h2 id="g-analiz">Analiz, karne ve listeler</h2>
  <ul><li><b>Sınav sayfası:</b> sıralama, ders ve şube ortalamaları, soru analizi (her şıkkın kaç kez işaretlendiği). Doğru oranı çok düşük ve tek bir yanlış şıkta toplanmış sorular "kontrol" olarak işaretlenir; cevap anahtarı hatası olabilir. Anahtarı düzeltirseniz ya da soruyu iptal ederseniz (değerlendirme dışı kalır) tüm sonuçlar anında yeniden hesaplanır.</li>
  <li><b>Karneler:</b> Deneme analiz karnesi; puan, ders tablosu, ders seviyeleri, soru soru cevaplar, konu analizi ve sınavın en zor soruları bölümlerinden istediklerinizi içerir. Bütün sınıfın karnesi tek PDF olarak gelir.</li>
  <li><b>Sıralı listeler:</b> kurum ve şube listeleri, Excel için CSV ve yazdırmak için PDF.</li>
  <li><b>Seviye Analizi:</b> bir öğrencinin, şubenin, sınıf düzeyinin ya da kurumun seçtiğiniz sınavlardaki ders ve konu seviyeleri, puan gidişatı ve öncelikli konuları. Buradan genel analiz karnesi ve öğrencinin yanlışlarından oluşan <b>hata testi</b> üretilir.</li></ul>
  <h3>Seviye nasıl hesaplanır?</h3>
  <p>Seviye yalnızca doğru sayısına değil, <b>hangi zorluktaki sorulara yanlış yapıldığına</b> bakar. Kolay sorularda yapılan yanlış seviyeyi çok, zor sorulardaki yanlış az düşürür. Sonuç 1 ile 5 arasındadır: 1–2 geliştirilmeli, 2–3 orta, 3–4 iyi, 4–5 çok iyi.</p>
  <h3>Zorluk analizi</h3>
  <p>Sınavlar biriktikçe <a href="#banka">Soru Bankası › Zorluk analizi</a> her sorunun gerçek doğru oranını hesaplar ve yeni zorluk önerir. Onayladığınız sorular "analiz edildi" olarak işaretlenir; ödev hazırlarken yalnızca analiz edilmiş soruları seçebilirsiniz.</p>

  <h2 id="g-yedek">Yedek ve bilgisayar değiştirme</h2>
  <p><a href="#ayarlar">Ayarlar ve Yedek › Yedek al</a> tüm soruları (görselleriyle), öğrencileri, sınavları ve ayarları tek bir <code>.zip</code> dosyasına koyar. Haftada bir yedek almanızı ve dosyayı USB bellekte ya da bulut klasörünüzde saklamanızı öneririz.</p>
  <p>Yeni bilgisayarda siteyi açın, <b>Yedekten geri yükle › Değiştir</b> deyin; kaldığınız yerden devam edersiniz. İki öğretmen aynı soru bankasını kullanacaksa biri yedek alıp diğeri <b>Birleştir</b> ile yükleyebilir.</p>
  <div class="tip">Tarayıcınızın "geçmişi temizle" ayarında <b>çerezler ve site verileri</b> seçiliyse selfdeneme verileri de silinir. Temizlemeden önce yedek alın.</div>

  <h2 id="g-sss">Sık karşılaşılan sorunlar</h2>
  <h3>"Köşe işaretleri bulunamadı"</h3>
  <p>Formun dört köşesindeki siyah karelerden biri kadrajın dışında, kesilmiş, üzeri yazılmış ya da çok bulanık. Yeniden tarayın ya da çekin. Kontrol ekranında cevapları elle de girebilirsiniz.</p>
  <h3>Çok sayıda belirsiz işaret çıkıyor</h3>
  <p>Öğrenciler kurşun kalemi çok hafif kullanmış ya da tarama çok açık. Tarayıcının kontrastını artırın ya da "koyu" ayarla tarayın. Fotoğrafta gölge olmamasına dikkat edin.</p>
  <h3>Numara kayıtlı değil</h3>
  <p>Öğrenci numarasını yanlış kodlamış ya da listede yok. Kontrol ekranında numarayı düzeltin; yeni öğrenciyse ad ve şubesini yazın.</p>
  <h3>Ödevde soru sayısı yetersiz</h3>
  <p>Seçili öğrenciler o konudaki soruların hepsini görmüş. Bankaya soru ekleyin, zorluğu "Tümü" yapın ya da "daha önce görülenlerle tamamla" seçeneğini açın.</p>
  <h3>Belge çok büyük</h3>
  <p>Ayarlar'da çözünürlüğü 150 DPI'a düşürün. 200 DPI çoğu yazıcı için yeterince nettir.</p>
  <h3>İndirme düğmesi çalışmıyor</h3>
  <p>Tarayıcınız açılır pencere ya da indirme izni soruyorsa izin verin. Gömülü bir önizlemede çalışıyorsanız siteyi kendi sekmesinde açın.</p>
  <p class="muted small" style="margin-top:40px">selfdeneme · tüm veriler cihazınızda kalır.</p>
  </article>`;
  $$('.toc a', host).forEach(a => a.addEventListener('click', e => { e.preventDefault(); const t = document.getElementById(a.getAttribute('href').slice(1)); if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' }); }));
  $$('a[href^="#g-"]', host).forEach(a => { if (a.closest('.toc')) return; a.addEventListener('click', e => { e.preventDefault(); const t = document.getElementById(a.getAttribute('href').slice(1)); if (t) t.scrollIntoView({ behavior: 'smooth' }); }); });
}
