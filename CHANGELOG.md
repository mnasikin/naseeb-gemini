# Changelog

Catatan perubahan Naseeb berdasarkan versi dan tanggal rilis. Commit `f447207` menjadi baseline **Initial release**, termasuk seluruh perubahan sebelumnya.

## 0.1.1 — 2026-11-25

### Diubah

- Panjang narasi mengikuti kebutuhan adegan tanpa jumlah paragraf minimum. Tindakan rutin dan percakapan sederhana cukup beberapa kalimat, sementara momen penting dapat memakai ruang lebih panjang.
- Sapaan dalam dialog, opsi, dan epilog menyesuaikan usia, kedekatan, serta peran lawan bicara. Gaya gue/lo digunakan saat sesuai, dengan sapaan aku/Bu/Pak atau saya/Bapak/Ibu untuk konteks keluarga dan situasi formal.
- Pilihan tindakan lebih beragam, termasuk spontan, iseng, santai, menghindar, dan impulsif yang tetap sesuai adegan. Urutan dan nuansa opsi divariasikan antar giliran.

### Diperbaiki

- Guardrail mengurangi kecenderungan mengarahkan seluruh opsi ke karier, pengembangan diri, atau hidup ideal. Pilihan santai atau ngawur mengikuti niat pemain tanpa selalu berubah menjadi peluang sukses atau ceramah motivasi.
- Dampak pilihan dapat negatif, netral, positif, atau campuran sesuai kejadian. Bonus tidak diberikan otomatis, kerugian tidak selalu ditebus dengan kenaikan aspek lain, dan istirahat tidak otomatis dihukum karena tidak produktif.

## 0.1.0 — 2026-11-18

### Ditambahkan

- Opsi **Random** saat membuat karakter untuk mengundi latar ekonomi Lower, Middle, atau Upper. Hasil undian menentukan statistik awal dan konteks cerita.
- Konteks sisa seluruh poin untuk Gemini, mencakup Kesehatan, Keuangan, Karier, Relasi, Kebahagiaan, dan Chemistry per tokoh. Konteks ini dipakai saat memulai cerita, melanjutkan bab, dan membuat epilog.
- Pencatatan alasan kejadian besar untuk perubahan statistik dan Chemistry yang melebihi 5 poin.

### Diubah

- Perubahan poin rutin dibatasi antara **-5 sampai +5**. Kejadian besar dapat mengubah aspek yang relevan hingga **-25 sampai +25**, dengan alasan kejadian yang disertakan dalam respons Gemini.
- Keterangan pilihan baru menampilkan perkiraan angka, seperti **Kesehatan -5, Relasi +3**, termasuk perubahan Chemistry per tokoh. Perkiraan dihitung dari kondisi akhir bab dan dijadikan acuan saat pilihan dilanjutkan.
- Perubahan poin dan perkiraan dampak pilihan disesuaikan dengan batas skor **0–100**.
- Impor progres lama menerima perubahan Chemistry hingga 25 poin.
- Vite yang dijalankan melalui `server.ts` menerima semua host pada mode pengembangan.

### Diperbaiki

- Instruksi kesehatan menyesuaikan gejala dengan sisa poin, aktivitas, dan kejadian sebelumnya. Lembur rutin saat kesehatan masih tinggi diarahkan menghasilkan kelelahan yang masuk akal. Narasi tidak boleh menyatakan karakter meninggal selama kesehatan masih di atas nol.
- Dialog berpetik tunggal dinormalisasi menjadi petik dua melengkung **“…”** pada hasil cerita baru dan tampilan cerita tersimpan, termasuk epilog. Apostrof dalam kata serta isi kode Markdown tetap dipertahankan.

## 0.0.0 — Initial release — 2026-11-15

Baseline rilis awal menggunakan commit [`f447207`](https://github.com/mnasikin/naseeb-gemini/commit/f4472076aefb7d31c554b12600fca78d644b3b96).

### Ditambahkan

- Simulasi kehidupan interaktif berlatar Indonesia masa kini dengan Gemini, pembuatan karakter, empat pilihan tindakan, dan jawaban bebas.
- Guardrail cerita untuk bahasa kasual, dialog natural, kesinambungan keputusan, callback, konsekuensi yang masuk akal, dan hubungan yang berkembang mengikuti pilihan pemain. Panjang cerita mengikuti kebutuhan adegan.
- Statistik Kesehatan, Keuangan, Karier, Relasi, dan Kebahagiaan, dengan Chemistry romantis dicatat terpisah per tokoh.
- Akun dengan username dan PIN enam digit, input PIN per kotak, serta progres yang dapat dilanjutkan dari perangkat lain.
- BYOK Gemini dengan **Test and Save** melalui panggilan API langsung. Username dan API key dienkripsi di SQLite, sedangkan PIN disimpan sebagai hash.
- Penyimpanan progres, linimasa, dan arsip cerita per akun di SQLite, perlindungan konflik revisi, serta impor progres lama dari browser.
- Epilog dan kartu nasib yang dapat diunduh sebagai PNG.
- Dukungan Markdown untuk cerita dan epilog.
- Favicon, ikon aplikasi, PWA yang dapat dipasang, dan halaman offline.
- README untuk instalasi, konfigurasi, deployment, API, penyimpanan, dan pemecahan masalah, beserta `.env.example` dan aturan `.gitignore`.
