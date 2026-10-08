# Deployment GitHub → Vercel → PostgreSQL

## 1. Persiapan GitHub

Buat repository baru, misalnya `pknstan-library-system`, kemudian dari folder project:

```bash
git init
git add .
git commit -m "Initial production-ready library system"
git branch -M main
git remote add origin https://github.com/USERNAME/pknstan-library-system.git
git push -u origin main
```

Jangan commit `.env`. File tersebut sudah ada di `.gitignore`.

## 2. Import repository ke Vercel

- Buka Vercel Dashboard.
- Add New → Project.
- Pilih repository GitHub.
- Framework Preset dapat dibiarkan Other/auto-detected.
- Jangan mengubah entrypoint. Vercel dapat mendeteksi Node/Express server dari `server.js`.
- Node runtime sudah dipin ke `24.x` melalui `package.json`.

## 3. Hubungkan PostgreSQL

Disarankan menggunakan Neon dari Vercel Marketplace karena paling sederhana untuk aplikasi Node/PostgreSQL serverless.

- Buka project Vercel.
- Storage/Marketplace → Neon.
- Create/connect database.
- Pastikan resource ditautkan ke environment Production. Bila Preview juga akan dipakai, tautkan juga Preview.
- Setelah integration tersambung, pastikan `DATABASE_URL` tersedia di Project Settings → Environment Variables.

Alternatif: Supabase Postgres/Aurora PostgreSQL/provider lain. Selama menyediakan PostgreSQL connection string, isi ke `DATABASE_URL`.

## 4. Environment Variables

Tambahkan sebagai Secret pada Vercel:

### `JWT_SECRET`
Buat random secret, contoh dengan Node:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

### Untuk demo deployment

```text
DEMO_MODE=true
AUTO_MIGRATE=true
AUTO_SEED_DEMO=true
```

### Cron

```text
CRON_SECRET=<random secret lain>
```

### Opsional

```text
DATABASE_SSL=true
DB_POOL_MAX=3
APP_BASE_URL=https://nama-project.vercel.app
```

Jangan menaruh secret di source code/GitHub.

## 5. Redeploy

Perubahan environment/database integration baru berlaku pada deployment baru. Lakukan Redeploy atau push commit baru ke GitHub.

## 6. Bootstrap database

Pada request API pertama dengan `AUTO_MIGRATE=true`, aplikasi:

1. memvalidasi `DATABASE_URL`;
2. mengambil PostgreSQL advisory lock;
3. membuat migration registry;
4. menjalankan `db/schema.sql` satu kali;
5. menjalankan `002-production-hardening.sql` satu kali;
6. bila `DEMO_MODE=true` dan `AUTO_SEED_DEMO=true`, mengisi akun/data dummy bila belum ada.

Migration menggunakan checksum. File migration yang pernah diterapkan tidak boleh diedit; buat migration baru untuk perubahan selanjutnya.

## 7. Verifikasi

Buka:

```text
https://DOMAIN/health
```

Expected:

```json
{
  "status": "ok",
  "database": "ok"
}
```

Kemudian:

```text
https://DOMAIN/api/v1/system/status
```

Pastikan:

```text
database = ok
demoAccountsSeeded = true
001-initial-schema = applied
002-production-hardening = applied
```

Lalu buka halaman utama dan login dengan `230012345`.

## 8. Jika login menampilkan error server

Periksa dalam urutan ini.

### A. `/health`

- `not-configured`: `DATABASE_URL` tidak ada pada deployment.
- `unavailable`: URL/SSL/network database bermasalah.
- `ok`: lanjut ke system status.

### B. `/api/v1/system/status`

- `ENVIRONMENT_INVALID`: periksa `JWT_SECRET`, `DATABASE_URL`.
- `DATABASE_SCHEMA_MISSING`: aktifkan `AUTO_MIGRATE=true` atau jalankan `npm run db:migrate` dari environment yang terhubung DB.
- `demoAccountsSeeded=false`: set `DEMO_MODE=true`, `AUTO_SEED_DEMO=true`, lalu redeploy; atau jalankan `npm run db:seed`.

### C. Vercel Logs

Vercel Dashboard → project → Logs. Gunakan `X-Request-Id` yang ditampilkan UI untuk mencocokkan request gagal.

## 9. Sesudah deployment berhasil

Untuk lingkungan yang lebih ketat:

```text
AUTO_MIGRATE=false
AUTO_SEED_DEMO=false
```

Jangan mematikan `DEMO_MODE` sebelum SSO resmi sudah diimplementasikan, karena mock login akan otomatis dinonaktifkan.

## 10. Cron/housekeeping

`vercel.json` memakai cron harian sebagai fallback yang kompatibel dengan deployment dasar. Aplikasi juga mempunyai lazy housekeeping setiap ±5 menit saat ada traffic API, sehingga status overdue/no-show/booking expiry tidak bergantung pada proses Node `setInterval` yang tidak cocok untuk serverless hosting.

Pada Vercel Pro/Enterprise, cron dapat dinaikkan menjadi contoh:

```json
{
  "path": "/api/cron/housekeeping",
  "schedule": "*/15 * * * *"
}
```

## 11. GitHub continuous deployment

Setelah repository terhubung ke Vercel:

- push ke branch production memicu deployment baru;
- pull request mendapatkan Preview Deployment bila diaktifkan;
- `.github/workflows/ci.yml` menjalankan syntax check dan unit test di GitHub Actions.

## 12. Sebelum data nyata PKN STAN

Wajib selesaikan minimal:

- integrasi SSO resmi;
- sinkronisasi master mahasiswa/dosen/pegawai;
- sinkronisasi kelas dan kalender akademik;
- kebijakan backup/restore managed DB;
- konfigurasi payment resmi bila digunakan;
- privacy review dan retention data;
- UAT petugas perpustakaan;
- vulnerability/dependency scanning;
- logging/monitoring dan incident response;
- review hak akses oleh Unit Sistem Informasi.
