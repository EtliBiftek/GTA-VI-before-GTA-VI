# Neon Coast

Küçültülmüş, stilize bir **İstanbul**'da (Boğaz, Haliç, iki yaka, köprüler) geçen özgün bir açık dünya aksiyon oyunu.
Tarayıcıda, Android'de (APK) ve Windows'ta (EXE) çalışır.

- Üçüncü şahıs kamera, yaya ve araç kullanımı, araç çalma
- Trafik, yayalar, polis ve 5 yıldızlı aranma sistemi
- Silahlar, toplanabilir eşyalar, silah dükkânı
- Hikâye görevleri ve yan işler, otomatik kayıt
- Gece/gündüz döngüsü, prosedürel şehir, prosedürel ses ve radyo
- Dokunmatik kontroller (mobil), klavye + fare, oyun kolu

Tüm modeller, dokular ve sesler kodla üretilir; harici varlık dosyası yoktur.

## İndirme

Her `push` işleminde GitHub Actions hem **APK** hem **EXE** derler
(`.github/workflows/build.yml`):

- **Actions → Build (APK + EXE) → ilgili çalıştırma → Artifacts**:
  `NeonCoast-android-apk`, `NeonCoast-windows-exe`
- Varsayılan dala yapılan push'larda ayrıca **Releases → latest** altında
  `NeonCoast.apk` ve `NeonCoast-win-x64.exe` yayınlanır.

APK, depodaki herkese açık bir test anahtarıyla imzalanır (yalnızca elle kurulum içindir,
mağaza anahtarı değildir); Android'de "bilinmeyen kaynaklardan yükleme" izni gerekir.

## Kontroller

| Eylem | Klavye / Fare | Dokunmatik |
| --- | --- | --- |
| Hareket / direksiyon | W A S D | Sol joystick |
| Bakış | Fare | Ekranın sağ yarısını sürükle |
| Ateş / nişan | Sol tık / sağ tık | ATEŞ / nişan düğmeleri |
| Koş | Shift | Koş düğmesi |
| Zıpla / el freni | Space | Zıpla / el freni düğmesi |
| Araca bin / in | F | Araç düğmesi |
| Silah değiştir | Q / E, 1–9, tekerlek | Silah düğmesi |
| Şarjör | R | Şarjör düğmesi |
| Korna / kamera / radyo | H / C / T | İlgili düğmeler |
| Harita | M | Harita düğmesi |
| Duraklat | Esc / P | Duraklat düğmesi |

Windows sürümünde `F11` tam ekranı açıp kapatır.

## Geliştirme

```bash
npm install
npm run dev            # http://localhost:5173
npm run build          # dist/
npm run electron       # masaüstü kabuğu (önce build)
npm run android:sync   # web paketini android/ projesine kopyalar
cd android && ./gradlew assembleRelease   # APK (Android SDK + JDK 21 gerekir)
npm run dist:win       # release/NeonCoast-win-x64.exe (Windows'ta)
```

Kod yapısı ve modül sözleşmesi: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).
