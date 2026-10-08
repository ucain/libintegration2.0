# Sistem Informasi Operasional Perpustakaan PKN STAN

Versi 2.0 adalah baseline deployable untuk GitHub + Vercel + PostgreSQL managed database. Source code ini memperbaiki kegagalan login/server pada versi sebelumnya dan menambahkan konfigurasi database yang eksplisit, bootstrap/migration terkontrol, cookie session HttpOnly, hardening RBAC, timezone Asia/Jakarta, housekeeping yang kompatibel dengan Vercel, health/status endpoint, error diagnostics, serta CI.

## Penyebab utama error versi sebelumnya

Halaman login dapat tampil walaupun PostgreSQL belum terhubung. Saat `/api/v1/auth/mock-login` dipanggil, backend langsung men-query `library_member`. Jika `DATABASE_URL` belum tersedia pada deployment Vercel, database belum dibuat, atau `seed.sql` belum dijalankan, endpoint berakhir dengan HTTP 500 dan UI hanya menampilkan `Terjadi kesalahan pada server.`

Versi ini mengubah perilaku tersebut:

- `DATABASE_URL` wajib dan divalidasi;
- schema dapat di-bootstrap secara idempotent (`AUTO_MIGRATE=true`);
- dummy accounts dapat di-seed otomatis (`DEMO_MODE=true` + `AUTO_SEED_DEMO=true`);
- error konfigurasi database menjadi HTTP 503 dengan kode yang jelas;
- `/health` dan `/api/v1/system/status` tersedia untuk diagnosis;
- login memakai cookie HttpOnly, bukan token di `localStorage`;
- Node.js dipin ke `24.x` untuk deployment Vercel baru.

## Stack

- Runtime: Node.js 24
- Backend: Express.js
- Database: PostgreSQL (disarankan Neon via Vercel Marketplace)
- Front-end: HTML/CSS/Vanilla JavaScript SPA
- Auth sementara: Mock SSO + JWT pada HttpOnly cookie
- Authorization: role-based access control (RBAC)
- Hosting target: Vercel + GitHub
- Scheduler: lazy housekeeping + Vercel Cron fallback

## Fitur utama

- katalog judul dan eksemplar (`copy_id`);
- peminjaman/pengembalian individu oleh petugas;
- due date 14 hari kerja dengan hari pinjam sebagai hari ke-1;
- perpanjangan satu kali sebelum overdue;
- booking buku per copy, expiry 3 hari kalender;
- literatur kolektif per kelas dan assignment mahasiswa-copy;
- pengembalian kolektif hanya complete jika seluruh copy terkumpul;
- `collective_eligibility` diblokir per mahasiswa, bukan per kelas;
- denda individu/kolektif dan verifikasi pembayaran;
- insiden hilang/rusak, replacement, dan buku ditemukan kembali;
- booking ruang H-1, min 3 peserta, max 2 jam, blackout 12.00-13.00 WIB, no-show 15 menit;
- notification center;
- saran buku;
- library clearance;
- dashboard, laporan, audit trail, integration monitor.

## Menjalankan lokal dengan Docker

```bash
docker compose up --build
```

Buka `http://localhost:3000`.

## Menjalankan lokal tanpa Docker

Prasyarat: Node.js 24 dan PostgreSQL.

```bash
cp .env.example .env
npm install
npm run db:init
npm start
```

## Akun demo

Akun berikut tersedia hanya bila `DEMO_MODE=true` dan database telah di-seed.

| Role | Institutional ID |
|---|---|
| Mahasiswa | `230012345` |
| Mahasiswa BLOCKED kolektif | `230012349` |
| Dosen | `19870501` |
| Petugas Buku | `STF-BUKU-01` |
| Petugas Ruang | `STF-RUANG-01` |
| Admin Perpustakaan | `ADM-PERPUS-01` |
| Kepala Unit | `HEAD-PERPUS-01` |
| Admin Sistem | `SYS-ADMIN-01` |

## Environment variables untuk Vercel

Wajib untuk demo deployment:

```text
DATABASE_URL=<diisi otomatis/manual dari PostgreSQL provider>
JWT_SECRET=<random secret minimal 32 karakter>
DEMO_MODE=true
AUTO_MIGRATE=true
AUTO_SEED_DEMO=true
CRON_SECRET=<random secret>
```

Opsional:

```text
DATABASE_SSL=true
DB_POOL_MAX=3
APP_BASE_URL=https://domain-anda.vercel.app
```

Setelah schema dan seed sukses, `AUTO_MIGRATE` dapat diubah menjadi `false`. Untuk perubahan schema selanjutnya, jalankan migration secara eksplisit.

## Pemeriksaan deployment

Setelah deploy/redeploy:

1. `GET /health` harus menghasilkan `status: "ok"` dan `database: "ok"`.
2. `GET /api/v1/system/status` harus menunjukkan migrations `001-initial-schema` dan `002-production-hardening`.
3. `demoAccountsSeeded` harus `true` bila menggunakan dummy login.
4. Coba login `230012345`.

Jika `/health` menunjukkan `database: not-configured` atau `unavailable`, perbaiki database integration/environment variables sebelum men-debug UI.

## Deploy Vercel + GitHub (ringkas)

1. Buat repository GitHub dan push seluruh isi project ini.
2. Pada Vercel pilih **Add New → Project → Import Git Repository**.
3. Hubungkan PostgreSQL managed database. Jalur paling mudah: Vercel Marketplace → Neon → connect ke project.
4. Tambahkan environment variables di atas pada Production (dan Preview bila diperlukan).
5. Pastikan Node.js 24 digunakan. `package.json` sudah menetapkan `24.x`.
6. Deploy ulang setelah database/environment variable tersambung.
7. Periksa `/health` dan `/api/v1/system/status`.
8. Setelah bootstrap sukses, login memakai akun demo.

Penjelasan lengkap ada di `docs/VERCEL_GITHUB_DEPLOYMENT.md` dan `docs/IMPLEMENTATION_GUIDE.docx`.

## Struktur penting

```text
server.js                       # canonical Node/Express entrypoint
vercel.json                     # Cron fallback
src/config/env.js               # env validation
src/config/db.js                # PostgreSQL pool + WIB session timezone
src/db/bootstrap.js             # idempotent runtime bootstrap
src/middleware/dbReady.js       # database readiness gate
src/middleware/security.js      # same-origin protection
src/middleware/housekeepingTick.js
src/routes/auth.routes.js       # HttpOnly cookie login/logout
src/routes/cron.routes.js
db/schema.sql
db/migrations/002-production-hardening.sql
db/seed.sql
public/                         # UI
.github/workflows/ci.yml        # GitHub CI
```

## Batasan integrasi resmi

Source ini siap digunakan sebagai aplikasi operasional/demo yang di-host secara nyata, tetapi dua integrasi institusional tidak dapat dibuat tanpa credential/API resmi:

1. SSO PKN STAN. Selama belum tersedia, gunakan `DEMO_MODE=true`. Untuk penggunaan institusional, set `DEMO_MODE=false` setelah adapter SSO resmi selesai.
2. Payment gateway/QRIS resmi. Dalam demo mode, transaksi non-cash disimulasikan sukses lalu tetap harus diverifikasi petugas. Saat `DEMO_MODE=false`, pembayaran gateway ditolak sampai integrasi resmi tersedia.

Master data akademik dan kalender juga perlu diganti dari dummy/sinkronisasi simulasi menjadi interface resmi sebelum digunakan untuk data mahasiswa sebenarnya.

## Quality checks

```bash
npm run check
npm test
```

Versi ini memiliki unit test untuk timezone WIB, expiry 3 hari kalender, H-1 ruang, min peserta, max 2 jam, blackout 12.00-13.00 WIB, dan larangan booking ruang lintas tanggal.
