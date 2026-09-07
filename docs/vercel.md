# Deploy Health Hub ke Vercel

Deployment memuat frontend dan tiga Vercel Functions (`/api/health`, `/api/v1/records`, `/api/v1/status`). Data produksi disimpan di PostgreSQL eksternal, bukan file SQLite serverless.

## Environment wajib

- `DATABASE_URL`: URL PostgreSQL persisten, misalnya database khusus Health Hub dari Neon melalui Vercel Marketplace. Gunakan connection string dengan TLS yang diberikan penyedia. Jangan gunakan database proyek lain tanpa persetujuan pemiliknya.
- `HEALTH_HUB_CLIENTS`: JSON array profil dan API key acak seperti konfigurasi lokal. Simpan sebagai sensitive environment variable, bukan variabel frontend.

Atur keduanya untuk environment deployment yang dituju. Preview yang memerlukan API sebaiknya memakai database dan key terpisah dari produksi. Tanpa konfigurasi, API merespons 503; tidak ada fallback ke SQLite sementara.

## Build dan deploy

```powershell
npm.cmd ci
npm.cmd run check
npm.cmd run build
vercel.cmd link
# Hubungkan PostgreSQL khusus proyek, lalu atur environment melalui dashboard/CLI.
vercel.cmd deploy --prod
```

`vercel.json` memakai preset Other, Node.js 24.x, `dist` untuk lima aset publik, serta direktori `api` untuk Functions. Build tidak menyalin `.env`, database, cache browser, source backend, atau pengujian ke direktori publik. `.vercelignore` juga mengecualikan data lokal dari upload source.

Tabel `hh_profiles` dan `hh_daily_records` dibuat otomatis pada koneksi pertama dengan kunci migrasi transaksi. Upsert menggunakan penguncian per profil di PostgreSQL agar kiriman paralel dari beberapa instance tidak membuat duplikat atau melewati batas riwayat. API mematuhi kontrak yang sama seperti backend lokal. Batas payload aplikasi tetap 2 MB dan batas fungsi 30 detik.

## Verifikasi sebelum penggunaan

1. `GET /api/health` harus menghasilkan 200.
2. GET/POST data tanpa API key harus menghasilkan 401.
3. Hubungkan dashboard memakai API key profil; profil baru menampilkan server kosong.
4. Uji kiriman, pengiriman ulang, pembaruan, dan pembacaan ulang pada profil pengujian terpisah.
5. Pastikan `/.env`, `/data/health-hub.sqlite`, dan source backend tidak tersedia sebagai aset publik.

Pengujian database sungguhan tersedia melalui `TEST_DATABASE_URL` dan `node --test tests/postgres.test.cjs`. Tes hanya membuat profil sintetis ber-ID acak dan menghapus profil yang dibuatnya sendiri. Tanpa variabel tersebut, tes PostgreSQL ditandai skipped, bukan dianggap lulus.

## Data lokal

SQLite tetap digunakan untuk lokal jika `DATABASE_URL` tidak diatur. Deployment **tidak otomatis memindahkan data SQLite lokal**. Jika ada data asli, ekspor per profil dan kirim melalui API memakai profil/skala yang sesuai setelah database produksi siap. Jangan mengunggah file database ke GitHub atau direktori publik.

Referensi: [SQLite tidak menyediakan penyimpanan persisten di Vercel](https://vercel.com/kb/guide/is-sqlite-supported-in-vercel), [PostgreSQL pada Vercel](https://vercel.com/docs/postgres), [transaksi node-postgres](https://node-postgres.com/features/transactions).
