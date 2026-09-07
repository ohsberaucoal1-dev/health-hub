# Integrasi aplikasi Health Hub

Backend Node.js menerima HTTP JSON dan menyimpan agregat harian ke SQLite lokal atau PostgreSQL ketika `DATABASE_URL` diatur. Dashboard disajikan dari origin yang sama. Kontrak ini perlu diimplementasikan di aplikasi pengirim; source code aplikasi Android Health Hub belum tersedia di proyek ini.

## Menjalankan lokal

Gunakan Node.js 24 atau lebih baru:

```powershell
npm.cmd run setup
npm.cmd start
```

Setup menghasilkan `.env` berisi API key acak profil `personal`; file yang sudah ada tidak ditimpa. Buka `.env` di editor lokal dan salin `api_key` ke aplikasi serta menu **Sumber data → Hubungkan API**. Jangan menaruh key dalam kode frontend, URL, screenshot, atau commit. Key dashboard disimpan hanya di memori tab dan dihapus saat putus koneksi/reload. Data server tidak disalin ke localStorage.

## Endpoint

| Metode | Path | Autentikasi | Fungsi |
|---|---|---|---|
| GET | `/api/health` | Tidak | Kesiapan server/database tanpa data pribadi |
| POST | `/api/v1/records` | Bearer API key | Kirim satu/banyak agregat harian, upsert per tanggal |
| GET | `/api/v1/records` | Bearer API key | Ambil riwayat profil pemilik key |
| GET | `/api/v1/records?from=2026-09-01&to=2026-09-07` | Bearer API key | Filter tanggal inklusif |
| GET | `/api/v1/status` | Bearer API key | Jumlah tanggal, tanggal terakhir, dan waktu penerimaan |

Gunakan header `Authorization: Bearer <API_KEY>` dan `Content-Type: application/json` untuk POST. Tidak menerima key di query string. Profil ditentukan oleh API key di server, bukan ID yang dikirim klien. Key yang sama memberikan izin baca dan tulis untuk satu profil; ini bukan sistem akun/login pengguna umum.

## Payload POST

Berikut contoh struktur, bukan data kesehatan asli atau skala default:

```json
{
  "source": "Health Hub",
  "fatigue_scale": { "name": "Nama indeks dari sumber", "min": 0, "max": 100 },
  "records": [
    { "date": "2026-09-07", "fatigue": 42, "sleep_minutes": 420, "steps": 6800, "resting_hr": 64 }
  ]
}
```

- `date`: tanggal kalender lokal pemilik data, `YYYY-MM-DD`. Server tidak menggeser zona waktu. Aplikasi bertanggung jawab menentukan tanggal agregat.
- `fatigue`: angka asli aplikasi. Skala wajib pada kiriman fatigue pertama; berikutnya boleh dihilangkan jika skala sudah tersimpan. Nama dan rentang instrumen tidak boleh berubah pada profil yang sama (409).
- `sleep_minutes`: tidur malam sebelum `date`, bukan hasil PSQI. Deduplikasi sesi dilakukan di aplikasi sebelum pengiriman.
- `steps`: langkah harian, angka bulat nonnegatif. Nol merupakan data sah.
- `resting_hr`: detak jantung **istirahat**, bukan rata-rata seluruh sampel HR.
- Field metrik yang **dihilangkan** mempertahankan nilai sebelumnya pada tanggal yang sama; **null eksplisit** mengosongkan metrik tersebut. Pada tanggal baru, metrik yang hilang menjadi null.
- Batch maksimum 3.660 tanggal unik dan 2 MB, tanpa kompresi. Total riwayat profil juga dibatasi 3.660 tanggal. Di batas riwayat, pembaruan tanggal lama tetap dapat diterima; tanggal baru memerlukan pengarsipan oleh pengelola.
- Semua catatan dalam satu batch disimpan secara atomik. Satu catatan tidak valid menyebabkan seluruh batch ditolak.
- Pengiriman ulang melakukan upsert `(profile_id, date)`. Tidak menambah duplikat. Bila beberapa kiriman mengubah field/tanggal yang sama, **kiriman terakhir yang diterima menang**; pengirim perlu mengurutkan antrean offline.
- Payload dengan `export_mode: "demo"` atau nama skala demo bawaan ditolak agar data ilustrasi tidak masuk sebagai data asli. Backend tidak bisa membuktikan asal wearable hanya dari label `source`; key adalah batas autentikasi.

Respons sukses:

```json
{ "accepted": 1, "inserted": 1, "updated": 0, "received_at": "2026-09-07T04:00:00.000Z", "profile_id": "personal" }
```

GET mengembalikan `source`, `fatigue_scale`, `records`, dan `sync` dengan `profile_id`, `records_count`, `latest_date`, `received_at`. Profil baru menghasilkan `records: []`, bukan demo. Waktu penerimaan bukan waktu sensor mengukur data.

## Contoh kirim dari PowerShell

Simpan ekspor **asli** sesuai kontrak dalam berkas lokal (di luar repositori publik), kemudian:

```powershell
# HEALTH_HUB_API_KEY diisi secara lokal, jangan commit nilainya.
$headers = @{ Authorization = "Bearer $env:HEALTH_HUB_API_KEY" }
Invoke-RestMethod -Uri 'http://localhost:3000/api/v1/records' -Method Post -Headers $headers -ContentType 'application/json' -InFile 'C:\path\ekspor-asli.json'
```

Di Android gunakan HTTP client pilihan aplikasi, URL server yang dapat dijangkau ponsel, body JSON di atas, dan Bearer key. `localhost` di ponsel menunjuk ponsel itu sendiri. Untuk pengujian LAN atur `HOST=0.0.0.0`, gunakan IP komputer dan port server, serta aturan firewall terbatas. Untuk penggunaan nyata gunakan HTTPS; jangan mengirim data kesehatan/API key melalui jaringan publik dengan HTTP.

## Error dan retry

| Status | Arti | Tindakan pengirim |
|---|---|---|
| 400 | JSON/query tidak valid | Perbaiki request |
| 401 | API key hilang/salah | Perbaiki kredensial |
| 409 | Konflik skala/batas riwayat | Periksa instrumen atau pengarsipan profil |
| 413 | Body terlalu besar | Pecah batch |
| 415 | Content type/kompresi tidak didukung | Gunakan JSON tanpa kompresi |
| 422 | Isi data tidak valid/demo | Perbaiki data sesuai pesan |
| 500 / koneksi terputus | Gagal sementara atau hasil kiriman belum diketahui | Retry payload yang sama dengan backoff |

## Konfigurasi dan deployment

`HEALTH_HUB_CLIENTS` adalah JSON array `[{"id":"personal","api_key":"KEY_ACAK_MINIMAL_32_KARAKTER"}]`. Buat key acak memakai `crypto.randomBytes(32).toString('base64url')`; placeholder dokumentasi bukan key siap pakai. ID/key wajib unik. Untuk mengganti key, ubah konfigurasi dengan **id profil yang sama** dan restart server; data profil tetap ada dan key lama berhenti berlaku. Tambahkan id/key berbeda untuk pemilik data lain.

Server lokal memerlukan **runtime Node.js 24.x dan disk persisten**. GitHub Pages/hosting statis tidak menjalankan API. Untuk SQLite, jalankan satu instance aplikasi dengan `DATABASE_PATH` pada volume persisten. Untuk Vercel, gunakan Functions dan PostgreSQL eksternal melalui `DATABASE_URL`, sesuai [panduan deployment](vercel.md). Konfigurasi produksi disimpan melalui secret manager/environment. Atur batas request/rate limit pada gateway hosting untuk akses internet. CORS lintas-origin tidak dibuka: dashboard dan API berasal dari origin yang sama; aplikasi native tidak memerlukan CORS.

SQLite menyimpan data di `data/health-hub.sqlite` secara default, termasuk file WAL ketika aktif. File ini **tidak dienkripsi oleh aplikasi**. Batasi izin filesystem, gunakan enkripsi disk sesuai lingkungan, dan buat backup konsisten melalui SQLite backup API atau saat server berhenti. Jangan menyalin file database aktif saja tanpa WAL. API tidak menyediakan penghapusan data server; penghapusan/pengarsipan dilakukan oleh pengelola dengan backup dan prosedur terpisah. Tombol Hapus data lokal hanya menghapus browser.

Backend ini belum di-deploy ke internet. Menjalankan server lokal dan menambahkan pengiriman HTTP pada aplikasi masih diperlukan untuk koneksi nyata.

Implementasi lokal memakai [SQLite bawaan Node.js](https://nodejs.org/api/sqlite.html); implementasi PostgreSQL menggunakan dependency `pg`. Jalankan `npm.cmd ci` setelah clone.
