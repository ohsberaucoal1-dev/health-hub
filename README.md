# Health Hub — Dashboard analisis berbasis riset

Website berbahasa Indonesia berdasarkan dua dokumen Markdown dalam folder ini. Tidak membutuhkan instalasi dependency.

## Menjalankan

Jalankan `npm.cmd start` di PowerShell, lalu buka http://localhost:3000. Alternatif: `node server.js`. Halaman `index.html` juga bisa dibuka langsung, tetapi server lokal disarankan agar penyimpanan browser konsisten.

Jalankan `npm.cmd run check` untuk pemeriksaan sintaks dan pengujian logika data.

## Fitur

- Ringkasan fatigue dari sumber, tidur, langkah, dan HR istirahat.
- Perbandingan terhadap rata-rata nilai yang tersedia pada tujuh hari kalender sebelumnya; hari terpilih dikecualikan.
- Grafik 7/30 hari dengan dua sumbu, tabel riwayat, dan ekspor JSON.
- Impor JSON dengan validasi skala, tanggal, duplikasi dan nilai hilang.
- Delapan kartu referensi dan penjelasan batas interpretasi riset.
- Penyimpanan lokal, penghapusan data, serta mode demo berlabel.
- Tampilan responsif untuk desktop dan ponsel.

## Integrasi Health Hub

Belum tersedia API maupun contoh ekspor asli aplikasi. Integrasi saat ini melalui **kontrak JSON yang diusulkan**, bukan klaim dukungan terhadap format ekspor bawaan Health Hub. Contoh dapat diunduh di halaman Sumber data. Sesuaikan eksportir aplikasi dengan kontrak ini atau buat adaptor setelah format aslinya tersedia.

`source` harus `Health Hub`. `records` berisi satu agregat per tanggal dengan `date` (YYYY-MM-DD), `fatigue`, `sleep_minutes`, `steps`, dan `resting_hr`. Metrik yang tidak tersedia diisi `null` atau dihilangkan. Fatigue numerik wajib memiliki `fatigue_scale` berisi `name`, `min`, dan `max` dari sumber. Tidak ada rentang skor bawaan untuk data asli. `sleep_minutes` adalah tidur malam sebelumnya, `resting_hr` khusus detak jantung istirahat, bukan rerata seluruh sampel HR.

Website tidak membaca Health Connect langsung. Sumber harus mengagregasikan sesi tidur dan mencegah duplikasi sebelum mengekspor. Tidak ada input angka manual atau pembuatan skor fatigue dari sensor. Berkas dibatasi 2 MB dan 3.660 hari. Tidak ada pembaruan otomatis; impor ulang untuk memperbarui data.

## Metode dan referensi

Analisis deskriptif tidak menetapkan batas ringan/sedang/berat, tidak menguji korelasi, dan tidak mendiagnosis. Durasi tidur tidak diperlakukan sebagai hasil PSQI. Angka FAS, IFRC, reaction timer, dan indeks wearable tidak disamakan. Persentase populasi, p-value dan odds ratio tidak dijadikan bobot skor.

Referensi bersumber dari `ringkasan-jurnal-kelelahan-kualitas-tidur.md`; keputusan desain mengacu pada `landasan-riset-ke-desain-health-hub.md`. Halaman penerbit artikel Pardyani & Susilowati (2024) dan Budiawan dkk. (2016) ditemukan dan ditautkan. Naskah asli delapan jurnal tidak tersedia di folder; detail lainnya ditandai sebagai ringkasan pengguna. Klaim sintesis “7 dari 8 signifikan” tidak diulang karena sebagian studi deskriptif dan sebagian meneliti luaran berbeda.

## Privasi

Data diolah di browser dan data impor disimpan di localStorage, tanpa dikirim ke server. Penyimpanan tersebut tidak dienkripsi. Google Fonts digunakan untuk tipografi; font sistem menjadi cadangan jika offline. Mode demo sementara tidak menimpa data impor tersimpan. Gunakan Hapus data lokal untuk menghapus impor pada perangkat bersama.
