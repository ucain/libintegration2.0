# Requirements Baseline

Dokumen ini merangkum rule yang dianggap fixed untuk implementasi sistem. Perubahan terhadap rule berikut harus diperlakukan sebagai change request, bukan perubahan implementasi informal.

## Individual circulation

- Transaksi fisik dilakukan oleh Petugas Peminjaman Buku.
- Mahasiswa tidak perlu login di meja sirkulasi; petugas scan KTM/input NIM dan barcode copy.
- Masa pinjam 14 hari kerja; tanggal pinjam dihitung sebagai hari ke-1 bila working day.
- Maksimal 2 copy aktif.
- Extension maksimal 1 kali 14 hari kerja dan hanya sebelum overdue.
- Mahasiswa INACTIVE tidak boleh membuat pinjaman baru.
- Copy harus `AVAILABLE` saat commit dan tidak boleh terikat dua transaksi aktif.
- Denda individual Rp1.000 per hari kerja keterlambatan per copy.

## Book reservation

- Booking pada `copy_id`.
- Hanya copy `AVAILABLE` yang dapat dibooking.
- Setelah petugas mengubah ke `READY_FOR_PICKUP`, batas pengambilan adalah 3 hari kalender.
- Setelah expired, reservation menjadi `EXPIRED` dan copy kembali `AVAILABLE`.

## Collective literature

- Header transaksi adalah kelas per academic period.
- Snapshot class membership dipertahankan untuk histori.
- Setiap copy di-assign kepada mahasiswa penerima.
- Kuota kolektif tidak mengurangi kuota individual.
- Pengembalian wajib kolektif dan tidak dapat `COMPLETED` sebelum seluruh expected copy ter-scan.
- Overdue workdays sama untuk seluruh kelas berdasarkan completion time.
- Total fine = expected book count × overdue workdays × Rp1.000.
- Mahasiswa yang memiliki kewajiban kolektif sebelumnya dapat `BLOCKED`; blokir hanya berlaku pada mahasiswa tersebut, bukan kelas baru.

## Library clearance

- Mahasiswa tingkat akhir memiliki status `CLEAR` / `NOT_CLEAR` berdasarkan kewajiban perpustakaan aktif.
- Status disiapkan untuk sinkronisasi ke sistem akademik.

## Fine & payment

- Payment dapat menggunakan cash/QRIS/gateway pada model data.
- Status payment tidak otomatis menyelesaikan kewajiban tanpa staff verification.

## Incident

- Lost/damaged disimpan sebagai incident.
- Penggantian dapat berupa buku yang sama/sejenis; edisi/cetakan lebih baru dapat diterima bila masih buku yang sama.
- Bila buku lama ditemukan, petugas harus memeriksa kondisi sebelum replacement obligation dibatalkan.
- Perubahan wajib tercatat di audit trail.

## Room

- Booking dilakukan anggota melalui akun.
- Maksimal H-1: implementasi memperbolehkan booking untuk hari ini atau paling jauh satu hari ke depan.
- Minimal 3 peserta, tidak melebihi kapasitas.
- Maksimal 2 jam.
- Blackout 12.00-13.00.
- Tidak boleh overlap.
- Belum check-in 15 menit setelah start → `NO_SHOW`.
- Key handover dan key return dicatat.

## Suggestion & notification

- Saran buku menggunakan form terstruktur dan duplicate check.
- Procurement berada di luar scope.
- Implementasi menggunakan notification center/in-app.
- Email/kanal eksternal masih mock.

## Batas implementasi tahap awal

- Mock SSO.
- Dummy institutional master, class, academic calendar, dan user.
- Mock payment gateway/reference.
- Belum terhubung ke layanan resmi PKN STAN.
