# Dari Riset ke Desain: Landasan Ilmiah untuk Health Hub

Dokumen ini menjembatani temuan pada `ringkasan-jurnal-kelelahan-kualitas-tidur.md`
dengan keputusan desain di `prompt-bangun-health-hub.md` / `spesifikasi-health-hub.md`.
Tujuannya: menunjukkan *mengapa* keputusan produk yang sudah diambil masuk akal
secara ilmiah, dan di mana ada celah yang perlu dipertimbangkan.

---

## 1. Peta Temuan Riset → Keputusan Desain

| Temuan Riset | Implikasi | Keputusan Desain di Health Hub |
|---|---|---|
| Kualitas tidur adalah determinan kelelahan paling konsisten di 7 dari 8 studi (konstruksi, industri, masinis, pasien kanker, pasien postoperasi) | Tidur bukan metrik pelengkap — ia metrik inti untuk memahami kondisi tubuh pengguna sehari-hari | Tidur dijadikan salah satu dari hanya 3 tipe data yang dibaca (bersama langkah & detak jantung), bukan opsional |
| Kualitas tidur paling berpengaruh **sebelum** aktivitas dimulai (studi masinis, artikel #4) | Data tidur perlu tersedia dan akurat di *awal hari*, bukan hanya sebagai ringkasan retrospektif | Dashboard menampilkan "data hari ini" — termasuk tidur malam sebelumnya — sebagai tampilan utama, bukan hanya tren mingguan |
| Tidur di Health Connect tersimpan sebagai sesi multi-stage (`SLEEP_SESSION`), bukan satu angka (temuan teknis, bukan dari jurnal, tapi krusial agar data tidur di atas benar-benar akurat) | Jika hanya query satu tipe data, hasil bisa nihil meski data ada | Spesifikasi mewajibkan permintaan **dua** tipe: `SLEEP_SESSION` **dan** `SLEEP_ASLEEP`, digabung di lapisan agregasi menjadi `sleep_minutes` |
| Efek kualitas tidur terhadap kelelahan bersifat **dose-dependent** dan personal (OR 3,6–3,9 pada studi nyeri-tidur; bervariasi antar individu) | Angka tidur mentah kurang bermakna tanpa konteks tren personal | Dashboard menyediakan **tren mingguan dan bulanan**, bukan cuma angka satu malam — supaya pengguna melihat pola, bukan snapshot |
| Gangguan tidur sering *tidak disadari* pengguna sampai terjadi akumulasi (kelelahan kronis, penurunan kewaspadaan) — lihat studi masinis dan pekerja konstruksi | Aplikasi consumer perlu jujur ketika data tidak lengkap, bukan diam-diam kosong, agar user tidak salah asumsi "tidurnya baik" padahal datanya memang tidak masuk | Persyaratan eksplisit: **status sinkronisasi yang jujur** di dashboard ("Sleep: menunggu sinkronisasi dari Zepp") — bukan layar kosong tanpa keterangan |
| Studi berulang kali menunjukkan sumber gangguan tidur bervariasi (nyeri, stres kerja, shift, lingkungan) dan **tidak bisa diperbaiki lewat pencatatan manual** — masalahnya ada di kondisi nyata, bukan di data | Mengizinkan input manual berisiko membuat pengguna "mengarang" angka yang menutupi masalah nyata alih-alih mendorong perbaikan kondisi sesungguhnya (mis. memperbaiki koneksi Zepp / kebiasaan tidur) | Larangan keras input manual di spesifikasi: kegagalan data harus diarahkan ke perbaikan koneksi sumber (Zepp → Health Connect), bukan ditutupi dengan entry manual |
| Studi pada usia berbeda-beda (konstruksi: usia muda paling rentan kelelahan tinggi; industri: usia tidak signifikan) → efek usia tidak seragam, tapi tren personal tetap relevan bagi semua kelompok usia | Perbandingan absolut antar-pengguna tidak bermakna karena baseline berbeda-beda per individu | Fokus UI pada tren personal (hari ini vs. rata-rata pribadi), bukan skor komparatif atau ranking terhadap norma populasi |

---

## 2. Mengapa 3 Tipe Data Ini Cukup (dan Tidak Lebih)

Spesifikasi membatasi Fase 1 hanya pada **langkah, detak jantung, tidur**. Ini selaras
dengan riset:

- **Tidur** — determinan kelelahan paling kuat dan paling konsisten di seluruh studi.
- **Detak jantung** — proksi umum untuk beban fisiologis akut; relevan sebagai
  pelengkap konteks (mis. HR istirahat yang naik bisa mengindikasikan pemulihan
  yang belum optimal, konsisten dengan gambaran "beban fisik + tidur buruk =
  kelelahan" di studi pekerja konstruksi dan produksi beton).
- **Langkah** — proksi aktivitas fisik harian; beberapa studi (mis. produksi beton,
  pekerja konstruksi) menyinggung beban kerja fisik sebagai faktor risiko, meski
  hasilnya tidak selalu signifikan secara statistik.

Riset **tidak** memberi alasan kuat untuk menambah tipe data lain di Fase 1 (mis.
SpO2, HRV, suhu tubuh) — determinan yang paling didukung bukti justru sudah ada
dalam scope: tidur.

---

## 3. Celah yang Riset *Tidak* Bisa Isi (Perlu Kehati-hatian Produk)

Beberapa hal penting untuk disadari agar aplikasi tidak salah representasi terhadap
temuan riset:

1. **Studi-studi ini adalah studi observasional pada populasi khusus** (pekerja
   konstruksi, pasien kanker, masinis) — bukan studi pada pengguna aplikasi
   konsumen umum. Health Hub **tidak boleh mengklaim** "tidur burukmu
   menyebabkan kelelahan X%" secara kausal ke pengguna individu; itu generalisasi
   berlebihan dari data agregat penelitian ke individu.
2. **Kelelahan dalam riset ini diukur dengan kuesioner klinis** (FAS, IFRC), bukan
   dari sensor wearable. Health Hub tidak mengukur "kelelahan" secara langsung —
   ia hanya menampilkan data mentah (tidur, langkah, detak jantung). Jangan
   membuat skor "tingkat kelelahan" buatan aplikasi yang terkesan medis/diagnostik.
3. Karena Health Hub **tanpa backend dan tanpa AI/analisis**, ia tidak dapat
   mereplikasi model statistik dari studi (regresi logistik ordinal, dsb). Perannya
   terbatas pada visibilitas data mentah + tren — bukan interpretasi klinis.

---

## 4. Rekomendasi Non-Scope (Dicatat, Bukan untuk Dikerjakan Sekarang)

Sesuai instruksi untuk tidak menambah scope, poin berikut **hanya dicatat sebagai
referensi masa depan**, bukan untuk dieksekusi dalam Fase 1–4:

- Menyorot pola sirkadian (jam tidur & bangun) mengingat temuan gangguan ritme
  sirkadian berhubungan signifikan dengan kelelahan (studi PT APAC Inti Corpora).
- Kontekstualisasi tren mingguan dengan penanda hari kerja berturut-turut, mengingat
  temuan bahwa hari kerja berturut-turut meningkatkan kelelahan (tinjauan literatur
  pekerja konstruksi).

Kedua ide ini **tidak diimplementasikan sekarang** — hanya dicatat agar tidak hilang
untuk pertimbangan pasca Fase 4.

---

## 5. Ringkasan Satu Paragraf

Riset yang dirangkum menunjukkan tidur adalah prediktor kelelahan yang paling kuat
dan paling konsisten dibanding faktor lain seperti usia, beban kerja, atau kebiasaan
makan — ini memvalidasi keputusan Health Hub menjadikan tidur sebagai salah satu
dari tiga metrik inti, menanganinya dengan detail teknis khusus (dua tipe data Health
Connect), dan menolak jalan pintas input manual yang bisa menutupi masalah nyata.
Namun karena riset ini berbasis kuesioner klinis pada populasi khusus, Health Hub
harus tetap membatasi diri sebagai *penyaji data mentah dan tren* — bukan alat
diagnosis kelelahan.
