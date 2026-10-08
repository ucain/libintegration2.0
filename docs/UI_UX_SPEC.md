# UI/UX Specification

## Prinsip desain

Antarmuka mempertahankan pola rancangan: header gelap, aksen emas, card ringkasan, search bar, status badge, sidebar berbasis role, worklist, progress indicator, modal/action confirmation, dan validation feedback.

Design token implementasi:

- Navy: `#103F63`
- Dark navy: `#0B304D`
- Gold: `#D3A719`
- Background: `#F4F6F8`
- Surface: `#FFFFFF`
- Primary text: `#1E293B`
- Secondary text: `#64748B`
- Success, warning, danger, dan info digunakan sebagai semantic status color.

Warna di atas adalah token implementasi, bukan klaim warna resmi institusi.

## Pola layout

Desktop menggunakan fixed header + sidebar + content canvas. Portal mahasiswa responsif untuk mobile. Portal petugas diprioritaskan desktop karena proses scan, worklist, dan transaksi meja layanan.

## Information architecture per role

### Mahasiswa / Dosen-Pegawai
Mahasiswa: Beranda, Katalog, Pinjaman Saya, Booking Buku, Literatur Kolektif, Ruang Diskusi, Denda/Kewajiban, Saran Buku, Notifikasi, Library Clearance.

Dosen/Pegawai: Beranda, Katalog, Pinjaman Saya, Booking Buku, Ruang Diskusi, Denda/Kewajiban, Saran Buku, Notifikasi.

### Petugas Peminjaman Buku
Beranda, Peminjaman Individu, Pengembalian, Booking Buku, Perpanjangan, Literatur Kolektif, Denda & Pembayaran, Insiden Buku.

### Petugas Ruang
Beranda, Reservasi Hari Ini, Check-in, Check-out, key handling.

### Admin Perpustakaan
Beranda, Koleksi, Saran Buku, Laporan, Audit Trail.

### Kepala Unit
Dashboard Manajerial, Laporan, Audit Trail.

### Admin Sistem
Integration Monitor dan Audit Trail.

## UX rules penting

1. Booking buku hanya menampilkan action aktif pada copy `AVAILABLE`.
2. Peminjaman fisik tidak tersedia di portal mahasiswa; transaksi dibuat petugas.
3. Due date tidak dapat diinput manual oleh front-end.
4. Return kolektif menampilkan progress dan tombol completion tetap disabled sebelum seluruh copy terkumpul.
5. Status payment dan service verification ditampilkan terpisah.
6. Error validasi ditampilkan sebagai toast dan tidak mengubah state UI seolah transaksi berhasil.
7. Identitas peminjam lain tidak ditampilkan di katalog/portal anggota.
8. Kepala Unit memiliki tampilan read-only pada data transaksi.

## User flow utama

### Individual loan
Mahasiswa mengambil buku → Petugas scan KTM/NIM → Backend validasi status/kuota → Petugas scan copy → Backend lock copy → Konfirmasi → Loan + loan item dibuat → copy `BORROWED` → notifikasi dibuat.

### Book reservation
Anggota membuka katalog → melihat copies → memilih copy `AVAILABLE` → backend lock copy → reservation `REQUESTED` + copy `RESERVED` → petugas mark `READY_FOR_PICKUP` → expiry 3 hari kalender → jika diambil, convert to loan; jika tidak, `EXPIRED` dan copy `AVAILABLE`.

### Collective return
Petugas membuka transaksi kelas → scan copy satu per satu → progress meningkat → sebelum jumlah return = expected, completion tidak dapat dilakukan → setelah lengkap, backend menghitung overdue workdays dan total fine → transaksi `COMPLETED`.

### Room reservation
Anggota pilih waktu + peserta → backend validasi H-1, min 3, kapasitas, <=2 jam, blackout, overlap → `BOOKED` → petugas check-in → key out → check-out + key return → `COMPLETED`; jika tidak hadir 15 menit setelah start, housekeeping mengubah ke `NO_SHOW`.

## Wireframe ringkas

### Dashboard anggota

```text
+---------------------------------------------------------------+
| PKN STAN | Perpustakaan                         Bell  User     |
+-------------+-------------------------------------------------+
| Beranda     | Selamat datang                                  |
| Katalog     | [ Cari judul/penulis/ISBN ................ ]     |
| Pinjaman    |                                                 |
| Booking     | [Pinjaman] [Booking] [Denda] [Ruang]           |
| Ruang       |                                                 |
| ...         | Pinjaman saya              Kalender layanan      |
|             | +----------------------+   +------------------+  |
|             | | judul | due | status |   |      month       |  |
|             | +----------------------+   +------------------+  |
+-------------+-------------------------------------------------+
```

### Peminjaman individu oleh petugas

```text
+--------------------------------------------------------------+
| Peminjaman individu mahasiswa                               |
| 1. Identifikasi anggota                                     |
| [ Scan KTM / input NIM             ] [Validasi]             |
| Nama | Status | kuota aktif                                  |
|                                                              |
| 2. Scan eksemplar                                           |
| [ Barcode scanner                   ] [Tambahkan]            |
| Judul | barcode | AVAILABLE                                  |
|                                                              |
| Ringkasan transaksi                   [Konfirmasi pinjaman]  |
+--------------------------------------------------------------+
```

### Return kolektif

```text
+--------------------------------------------------------------+
| Literatur kolektif per kelas                                |
| Kelas | Anggota | Expected copy | Due date                   |
|                                                              |
| Status pengembalian                                          |
| [##############################--] 96.7%                     |
| 29 dari 30 copy terkumpul                                    |
| BELUM DAPAT DISELESAIKAN                                     |
| Missing: NIM | barcode | judul                               |
|                                                              |
| [Scan barcode]                          [Proses saat lengkap] |
+--------------------------------------------------------------+
```
