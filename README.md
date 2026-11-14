# Naseeb

Naseeb adalah simulasi kehidupan interaktif berbahasa Indonesia. Kamu membuat karakter yang baru melangkah ke hidup dewasa, lalu menentukan tindakannya dari satu bab ke bab berikutnya. Gemini menulis adegan dan dialog berdasarkan latar karakter, keputusanmu, serta konsekuensi yang sudah terjadi.

## Daftar isi

- [Fitur](#fitur)
- [Jalankan di komputer sendiri](#jalankan-di-komputer-sendiri)
- [Cara bermain](#cara-bermain)
- [Pasang sebagai aplikasi](#pasang-sebagai-aplikasi)
- [Konfigurasi dan deployment](#konfigurasi-dan-deployment)
- [Penyimpanan dan privasi](#penyimpanan-dan-privasi)
- [Struktur proyek](#struktur-proyek)
- [API](#api)
- [Pemecahan masalah](#pemecahan-masalah)

## Fitur

- Cerita berlatar Indonesia masa kini, dengan dialog langsung yang menyatu dengan adegan. Bab lanjutan mempertimbangkan pilihan, hubungan, dan kejadian sebelumnya.
- Pilih jawaban yang tersedia atau tulis tindakanmu sendiri. Dampaknya terlihat pada kesehatan, keuangan, karier, relasi, dan kebahagiaan karakter.
- Lihat keputusan dan dampaknya di **Linimasa**. Cerita tamat tersimpan di **Arsip Nasib**, lengkap dengan kartu nasib yang bisa diunduh sebagai PNG.
- Masuk dari perangkat lain dengan akun yang sama untuk melanjutkan progres. Setiap akun memakai API key Gemini miliknya sendiri (*Bring Your Own Key* atau BYOK).
- Pasang Naseeb dari browser sebagai aplikasi dengan ikon sendiri dan tampilan mandiri.

## Jalankan di komputer sendiri

Siapkan **Node.js 22.18 atau lebih baru** beserta npm. Node.js 24 disarankan. Akun Google dan akses ke Gemini API diperlukan untuk memainkan cerita. SQLite sudah tersedia melalui modul bawaan Node.js.

```bash
git clone https://github.com/mnasikin/naseeb-gemini.git
cd naseeb-gemini
npm install
npm run dev
```

Buka [http://localhost:3000](http://localhost:3000). Server dev melayani frontend dan API di alamat yang sama serta memuat ulang proses saat kode backend berubah.

| Perintah | Kegunaan |
| --- | --- |
| `npm run dev` | Menjalankan Express dengan Vite untuk pengembangan. |
| `npm run lint` | Memeriksa tipe TypeScript dengan `tsc --noEmit`. |
| `npm run build` | Membuat build frontend di `dist/`. |
| `npm run preview` | Melayani build dan API dari Express pada port 4173 secara default. Jalankan build terlebih dahulu. |
| `npm start` | Menjalankan Express. Gunakan `NODE_ENV=production` untuk menyajikan build dari `dist/`. |

## Cara bermain

1. Pilih **Buat akun baru**, lalu isi username 3–40 karakter dan PIN 6 digit. Naseeb tidak menyediakan reset PIN.
2. Buat API key di [Google AI Studio](https://aistudio.google.com/api-keys). Gunakan key dari proyek Free Tier jika tersedia untuk akunmu. Kuota dan biaya mengikuti proyek Google yang memiliki key tersebut. [Harga Gemini API](https://ai.google.dev/gemini-api/docs/pricing)
3. Masukkan key dan tekan **Test and Save**. Server mencoba satu permintaan singkat ke `gemini-3.1-flash-lite`. Key disimpan setelah permintaan berhasil. Menu **API key** bisa dipakai untuk mengganti atau menghapusnya.
4. Isi nama, gender, dan latar ekonomi karakter, lalu mulai cerita. Pilih salah satu jawaban atau masukkan pilihan sendiri. Setiap bab yang berhasil dibuat langsung tersimpan.
5. Kamu bisa menamatkan cerita dari antarmuka permainan. Cerita juga tamat saat kesehatan mencapai nol. Buka **Arsip Nasib** untuk melihat cerita selesai dan mengunduh kartu nasib.

Untuk pindah perangkat, buka alamat Naseeb yang sama lalu masuk dengan username dan PIN yang sama. Jika pernah bermain sebelum fitur akun tersedia, buat akun dari browser lama dan centang **Pindahkan progres dan arsip lama dari browser ini ke akun baru** saat opsi itu muncul. Data lama yang berhasil diimpor akan dibersihkan dari penyimpanan browser.

## Pasang sebagai aplikasi

- **Chrome atau Edge.** Buka Naseeb, lalu pilih opsi **Instal** dari bilah alamat atau menu browser jika tersedia. [Panduan instalasi aplikasi web](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Installing)
- **Safari di iPhone.** Buka menu **Bagikan**, pilih **Tambahkan ke Layar Utama**, lalu aktifkan **Buka sebagai App Web** jika opsi itu tampil. [Panduan Apple](https://support.apple.com/en-az/guide/iphone/iph42ab2f3a7/ios)

Pemasangan PWA memerlukan HTTPS atau alamat lokal `localhost` atau `127.0.0.1`. Saat koneksi terputus, Naseeb menampilkan layar offline dengan tombol **Coba lagi**. Login, sinkronisasi, dan pembuatan cerita memerlukan koneksi ke server. [Persyaratan instalasi PWA](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable)

## Konfigurasi dan deployment

Pengaturan bersifat opsional saat pengembangan lokal. Untuk mengubahnya, isi variabel yang diperlukan di `.env` berdasarkan [`.env.example`](.env.example), atau atur langsung di lingkungan server.

| Variabel | Default | Kegunaan |
| --- | --- | --- |
| `PORT` | `3000` | Port HTTP Express. Skrip preview memakai `4173` jika port belum ditentukan. |
| `NODE_ENV` | Mode pengembangan jika kosong | Nilai `production` menyajikan `dist/` dan mengaktifkan cookie sesi `Secure`. |
| `BYOK_DATA_DIR` | `.byok/` di root proyek | Direktori SQLite dan kunci enkripsi yang dibuat otomatis. Gunakan volume persisten di deployment. |
| `BYOK_ENCRYPTION_KEY` | Dibuat dan disimpan sebagai `gemini.key` di direktori data | Secret server sepanjang 64 karakter heksadesimal. Untuk membuatnya, jalankan `openssl rand -hex 32`. |
| `DISABLE_HMR` | Kosong | Nilai `true` menonaktifkan HMR dan pemantauan file Vite. |

Untuk produksi, jalankan perintah berikut di server setelah mengatur direktori data dan secret melalui lingkungan deployment.

```bash
npm install
npm run build
NODE_ENV=production npm start
```

Jalankan proses Node.js di belakang layanan HTTPS atau reverse proxy. Sajikan halaman, aset PWA, dan rute `/api/` dari domain yang sama. Seluruh aplikasi, termasuk rute API, dilayani oleh Express.

Pertahankan direktori data dan secret yang sama saat upgrade atau redeploy. Cadangkan SQLite secara konsisten, misalnya dengan menghentikan proses aplikasi sebelum menyalin file database. Simpan cadangan secret secara aman. Jika menggunakan secret yang dibuat otomatis, pertahankan file `gemini.key` saat memindahkan database.

## Penyimpanan dan privasi

| Data | Cara penyimpanan |
| --- | --- |
| Username dan Gemini API key | Dienkripsi dengan AES-256-GCM di SQLite. Setiap key terikat ke akun pemiliknya. |
| PIN | Disimpan sebagai hash satu arah dengan scrypt dan salt unik. Percobaan masuk dibatasi. |
| Sesi masuk | Browser memegang cookie sesi `HttpOnly`. Server menyimpan hash token sesi. |
| Progres dan arsip | SQLite menyimpan keadaan bab aktif, baris linimasa per pilihan, dan arsip cerita per akun. |
| Cache PWA | Hanya halaman offline. |

Saat menyimpan bab, server memperbarui progres dan linimasa dalam satu transaksi. Revisi progres mencegah tab atau perangkat dengan data lama menimpa bab yang lebih baru. **Main Baru** menghapus progres aktif dan mempertahankan arsip cerita yang sudah selesai.

Untuk membuat bab, server mengirim konteks karakter, adegan, dan riwayat pilihan yang relevan ke Gemini. Masukkan detail fiktif saat membuat karakter atau menulis pilihan sendiri. [Ketentuan Gemini API](https://ai.google.dev/gemini-api/terms)

## Struktur proyek

| Lokasi | Isi |
| --- | --- |
| [`src/`](src/) | Antarmuka React dan TypeScript, komponen permainan, serta tipe data bersama. |
| [`server.ts`](server.ts) | Server Express, rute akun dan permainan, skema respons Gemini, serta instruksi cerita. |
| [`account-store.ts`](account-store.ts) | Akun, sesi, pembatasan percobaan login, dan penyimpanan API key. |
| [`game-store.ts`](game-store.ts) | Transaksi SQLite untuk progres, linimasa, dan arsip. |
| [`legacy-game.ts`](legacy-game.ts) | Validasi data permainan lama saat impor. |
| [`public/`](public/) | Favicon, ikon aplikasi, manifest PWA, service worker, dan halaman offline. |

Frontend menggunakan React, Vite, Tailwind CSS, Motion, dan Lucide. Backend menggunakan Express, SQLite melalui `node:sqlite`, dan SDK Google Gen AI.

## API

Kirim data JSON dengan header `Content-Type: application/json`. Endpoint akun, permainan, dan key yang mengakses data pribadi memerlukan sesi masuk. Semua perubahan cerita di bawah ini menerima `revision` terbaru dari `GET /api/game` atau respons perubahan sebelumnya.

| Metode dan rute | Fungsi |
| --- | --- |
| `POST /api/account/register` | Buat akun dan mulai sesi dengan `username` dan `pin`. PIN dikirim sebagai string agar nol di depan tetap terbaca. |
| `POST /api/account/login` | Mulai sesi dengan `username` dan `pin`. |
| `POST /api/account/logout` | Akhiri sesi di browser ini. |
| `GET /api/account` | Muat profil akun, status key, dan data permainan. |
| `GET /api/game` | Muat `revision`, `activeSession`, dan `archives`. |
| `GET /api/gemini-key` | Periksa status `configured`. |
| `PUT /api/gemini-key` | Tes dan simpan `apiKey`. |
| `DELETE /api/gemini-key` | Hapus key dari akun. |
| `POST /api/story/start` | Mulai cerita dengan `revision`, `name`, `gender`, dan `familyClass`. |
| `POST /api/story/next` | Lanjutkan bab dengan `revision` dan `selectedAnswer`. |
| `POST /api/story/end` | Tamatkan cerita aktif dengan `revision`. |
| `POST /api/game/reset` | Kosongkan progres aktif dengan `revision`. |
| `DELETE /api/game/archives/:id` | Hapus satu arsip milik akun. |

Respons `409` saat memperbarui cerita berarti revisi sudah berubah atau sesi cerita perlu diatur ulang. Muat `GET /api/game` sebelum mengirim tindakan berikutnya. Respons `428` berarti akun belum punya Gemini API key.

## Pemecahan masalah

| Gejala | Yang perlu dicek |
| --- | --- |
| **Server akun Naseeb belum tersedia** | Jalankan `npm run dev` untuk pengembangan atau `npm run build` lalu `npm run preview`. Jika masih ada proses lama, hentikan dan jalankan ulang. |
| **Sudah masuk, lalu kembali ke form login** | Di produksi, buka aplikasi lewat HTTPS agar browser menerima cookie sesi. Pastikan browser mengizinkan cookie, lalu masuk lagi. |
| **Test and Save gagal** | Gunakan key lengkap dari AI Studio dan periksa apakah proyeknya punya akses ke `gemini-3.1-flash-lite`. Untuk HTTP 429 dari Gemini, cek kuota di AI Studio. [Batas penggunaan Gemini](https://ai.google.dev/gemini-api/docs/rate-limits) |
| **Progres hilang setelah deploy ulang** | Periksa apakah `BYOK_DATA_DIR` masih menunjuk volume yang sama dan secret enkripsi sesuai dengan database itu. |
| **Opsi instalasi belum muncul** | Periksa HTTPS, dukungan instalasi browser, dan apakah aplikasi sudah dipasang. Pada iPhone, gunakan menu Bagikan. |

Sebelum mengirim perubahan, jalankan `npm run lint` dan `npm run build`. Untuk perubahan pada alur pemain, cek pendaftaran, **Test and Save**, serta apakah bab terbaru bisa dibuka dari browser lain. Untuk perubahan PWA, cek pemasangan lewat browser dan muat ulang halaman dalam mode offline.
