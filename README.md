# Health Hub — Dashboard analisis berbasis riset

Website dan backend berbahasa Indonesia berdasarkan dua dokumen Markdown dalam folder ini. Node.js 24.x, SQLite untuk lokal, dan PostgreSQL untuk Vercel. Jalankan `npm.cmd ci` setelah clone untuk memasang dependency.

## Menjalankan

Jalankan `npm.cmd run setup` sekali untuk membuat `.env` dan API key acak, lalu `npm.cmd start`. Buka http://localhost:3000. Di menu **Sumber data**, masukkan `api_key` dari `.env` untuk membaca data profil dari server. Aplikasi Health Hub mengirim data ke `POST /api/v1/records` dengan Bearer key yang sama. Jangan unggah `.env` atau database ke GitHub.

Jalankan `npm.cmd run check` untuk pemeriksaan sintaks, analisis, dan pengujian integrasi HTTP/database.

## Fitur

- Ringkasan fatigue dari sumber, tidur, langkah, dan HR istirahat.
- Perbandingan terhadap rata-rata nilai yang tersedia pada tujuh hari kalender sebelumnya; hari terpilih dikecualikan.
- Grafik 7/30 hari dengan dua sumbu, tabel riwayat, dan ekspor JSON.
- Impor JSON dengan validasi skala, tanggal, duplikasi dan nilai hilang.
- Delapan kartu referensi dan penjelasan batas interpretasi riset.
- Penyimpanan lokal, penghapusan data, serta mode demo berlabel.
- API penerima JSON dengan autentikasi API key dan isolasi data per profil.
- SQLite persisten, transaksi batch, upsert per tanggal, dan pemeriksaan konflik skala.
- Dashboard membaca server setiap 30 detik saat terhubung; status kegagalan dan waktu penerimaan ditampilkan.
- Tampilan responsif untuk desktop dan ponsel.

## Integrasi Health Hub

Backend penerima tersedia. Source code aplikasi Android dan contoh kiriman aslinya belum diberikan; **aplikasi perlu mengirim HTTP POST sesuai kontrak JSON ini**. Lihat [dokumentasi API](docs/api.md) untuk endpoint, autentikasi, contoh request, error, retry, dan deployment.

`source` harus `Health Hub`. `records` berisi satu agregat per tanggal dengan `date` (YYYY-MM-DD), `fatigue`, `sleep_minutes`, `steps`, dan `resting_hr`. Metrik yang tidak tersedia diisi `null` atau dihilangkan. Fatigue numerik wajib memiliki `fatigue_scale` berisi `name`, `min`, dan `max` dari sumber. Tidak ada rentang skor bawaan untuk data asli. `sleep_minutes` adalah tidur malam sebelumnya, `resting_hr` khusus detak jantung istirahat, bukan rerata seluruh sampel HR.

Website tidak membaca Health Connect langsung. Sumber harus mengagregasikan sesi tidur dan mencegah duplikasi sebelum mengirim. Tidak ada input angka manual atau pembuatan skor fatigue dari sensor. Payload dibatasi 2 MB dan 3.660 hari; total riwayat per profil maksimal 3.660 tanggal. API memperbarui tanggal yang sudah ada. Field yang dihilangkan mempertahankan nilai lama, sedangkan null eksplisit mengosongkannya. Impor berkas tetap tersedia untuk analisis lokal dan tidak otomatis dikirim ke server.

## Metode dan referensi

Analisis deskriptif tidak menetapkan batas ringan/sedang/berat, tidak menguji korelasi, dan tidak mendiagnosis. Durasi tidur tidak diperlakukan sebagai hasil PSQI. Angka FAS, IFRC, reaction timer, dan indeks wearable tidak disamakan. Persentase populasi, p-value dan odds ratio tidak dijadikan bobot skor.

Referensi bersumber dari `ringkasan-jurnal-kelelahan-kualitas-tidur.md`; keputusan desain mengacu pada `landasan-riset-ke-desain-health-hub.md`. Halaman penerbit artikel Pardyani & Susilowati (2024) dan Budiawan dkk. (2016) ditemukan dan ditautkan. Naskah asli delapan jurnal tidak tersedia di folder; detail lainnya ditandai sebagai ringkasan pengguna. Klaim sintesis “7 dari 8 signifikan” tidak diulang karena sebagian studi deskriptif dan sebagian meneliti luaran berbeda.

## Privasi

Data kiriman API disimpan di SQLite server berdasarkan profil pemilik key. API key dashboard hanya berada di memori tab, dan hasil GET API tidak disalin ke localStorage. Impor berkas disimpan di localStorage browser. Tombol Hapus data lokal tidak menghapus database server. Keduanya tidak dienkripsi oleh aplikasi. Gunakan HTTPS dan penyimpanan server yang terlindungi untuk deployment. Google Fonts digunakan untuk tipografi; font sistem menjadi cadangan jika offline.

## Hosting

Repositori GitHub menyimpan source code; GitHub Pages tidak menjalankan backend Node.js. Konfigurasi Vercel tersedia dengan PostgreSQL persisten melalui `DATABASE_URL` dan API key melalui environment. Lihat [panduan Vercel](docs/vercel.md). Server lokal tetap dapat menggunakan SQLite. Source aplikasi Android belum disertakan; aplikasi pengirim harus mengikuti [kontrak API](docs/api.md).
