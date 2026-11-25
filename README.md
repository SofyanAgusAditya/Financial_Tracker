# Financial Tracker (Android Offline-First)

Aplikasi pencatat keuangan pribadi berbasis Android yang berjalan **100% offline** tanpa server backend maupun akun cloud. Dibangun menggunakan React, TypeScript, Vite, dan Capacitor 8 dengan penyimpanan lokal SQLite serta keamanan PIN dan Biometrik perangkat.

## Fitur Utama

- **100% Offline & Lokal (SQLite):** Seluruh data transaksi, kategori, anggaran, dan jadwal berulang tersimpan langsung di database internal perangkat (`@capacitor-community/sqlite`), dengan fallback `localStorage` untuk pengujian di browser.
- **Keamanan PIN & Biometrik:** Dilindungi PIN 6 digit (di-hash menggunakan `SHA-256` + _random salt_) serta autentikasi sidik jari / biometrik bawaan Android (`@capgo/capacitor-native-biometric`).
- **Mobile-First Portrait UI:** Dioptimalkan khusus untuk layar smartphone (`360px–430px`) dengan dukungan _Safe Area_ status bar/navigation bar, tema Terang/Gelap, serta navigasi tombol _Back_ Android bertingkat (`@capacitor/app`).
- **Dwibahasa (ID / EN) & Mata Uang IDR:** Mendukung pergantian bahasa Indonesia (default) dan Inggris secara _real-time_ dengan pemformatan titik pemisah ribuan otomatis pada seluruh input nominal Rupiah.
- **Backup & Restore JSON:** Mendukung ekspor cadangan data `.json` melalui menu _Share_ bawaan Android (`@capacitor/filesystem` & `@capacitor/share`), pemulihan data dari file JSON, serta reset data mulai dari nol.

## Teknologi yang Digunakan

- **Frontend:** React 19, TypeScript, Tailwind CSS, Vite
- **Mobile Runtime:** Capacitor 8 (Android)
- **Plugin Native:**
  - `@capacitor-community/sqlite` — Database lokal SQLite
  - `@capgo/capacitor-native-biometric` — Autentikasi sidik jari / biometrik
  - `@capacitor/app` — Penanganan tombol/gestur _Back_ Android
  - `@capacitor/filesystem` & `@capacitor/share` — Ekspor backup JSON ke Android Share Sheet

## Menjalankan di Mode Pengembangan (Browser)

```bash
npm install
npm run dev
```

## Build APK Android (CLI Hemat RAM)

Pastikan **OpenJDK 21** dan **Android SDK** (`platforms;android-36`, `build-tools;36.0.0`) sudah terpasang:

```bash
npm run build
npx cap sync android
cd android && ./gradlew assembleDebug --no-daemon --max-workers=2
```

File APK hasil kompilasi akan tersedia di:
`android/app/build/outputs/apk/debug/app-debug.apk`
