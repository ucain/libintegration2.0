# Release Notes v2.0 — Vercel/GitHub hardening

Versi ini mengganti baseline deployment awal yang masih berperilaku seperti prototype lokal.

Perubahan utama:

- Runtime dinaikkan ke Node.js 24.x untuk deployment Vercel baru.
- Server root `server.js` dibuat sebagai canonical entrypoint Vercel.
- PostgreSQL managed database diwajibkan melalui `DATABASE_URL`, dengan pool yang dibatasi untuk hosted/serverless.
- Database readiness, migration registry, checksum migration, advisory lock, dan optional demo seed ditambahkan.
- Login berpindah dari token browser/localStorage ke JWT dalam HttpOnly secure cookie.
- Pesan error API memiliki `code` dan `requestId` agar dapat dicocokkan dengan Vercel Logs.
- Security headers, same-origin validation, rate limiting, RBAC, dan database constraints diperkuat.
- Housekeeping tidak lagi memakai `setInterval`; status expiry/no-show/overdue dijalankan serverless-safe melalui lazy tick dan Vercel Cron fallback.
- Perhitungan tanggal/jam operasional distandardisasi ke Asia/Jakarta.
- Unique constraint/index ditambahkan untuk mencegah double booking dan duplikasi transaksi kritis.
- Collective eligibility dan library clearance dikoreksi agar kewajiban satu mahasiswa tidak memblokir mahasiswa lain.
- Penyelesaian insiden buku kini juga menyelesaikan loan item terkait agar kewajiban tidak menggantung.
- CI GitHub menjalankan syntax check dan unit test pada Node 24.

## Perhatian untuk deployment lama

Jangan sekadar mengganti file front-end. Redeploy seluruh repository dan pastikan environment variables Production sudah terisi. Bila database lama belum memiliki registry migration, bootstrap akan menerapkan migration awal/hardening secara terkontrol. Backup database sebelum migrasi pada lingkungan yang sudah memiliki data penting.
