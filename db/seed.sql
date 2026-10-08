-- Roles
INSERT INTO role(role_id, role_name, description) VALUES
('10000000-0000-0000-0000-000000000001','STUDENT','Mahasiswa'),
('10000000-0000-0000-0000-000000000002','LECTURER_EMPLOYEE','Dosen/Pegawai'),
('10000000-0000-0000-0000-000000000003','BOOK_STAFF','Petugas Peminjaman Buku'),
('10000000-0000-0000-0000-000000000004','ROOM_STAFF','Petugas Ruang/Resepsionis'),
('10000000-0000-0000-0000-000000000005','LIBRARY_ADMIN','Admin Perpustakaan'),
('10000000-0000-0000-0000-000000000006','HEAD_UNIT','Kepala Unit Perpustakaan'),
('10000000-0000-0000-0000-000000000007','SYSTEM_ADMIN','Admin Sistem / Unit Sistem Informasi')
ON CONFLICT (role_name) DO NOTHING;

-- Dummy users / members
INSERT INTO library_member(member_id,institutional_id,full_name,email,member_type,member_status,collective_eligibility) VALUES
('20000000-0000-0000-0000-000000000001','230012345','Maura Putri','maura.demo@pknstan.local','STUDENT','ACTIVE','ELIGIBLE'),
('20000000-0000-0000-0000-000000000002','230012349','Nanda Rahma','nanda.demo@pknstan.local','STUDENT','ACTIVE','BLOCKED'),
('20000000-0000-0000-0000-000000000003','230012350','Raka Aditya','raka.demo@pknstan.local','STUDENT','ACTIVE','ELIGIBLE'),
('20000000-0000-0000-0000-000000000004','230099999','Mahasiswa Tidak Aktif','inactive.demo@pknstan.local','STUDENT','INACTIVE','ELIGIBLE'),
('20000000-0000-0000-0000-000000000005','19870501','Budi Santoso','budi.demo@pknstan.local','LECTURER','ACTIVE','ELIGIBLE'),
('20000000-0000-0000-0000-000000000006','STF-BUKU-01','Agus Supriyadi','agus.staff@pknstan.local','STAFF','ACTIVE','ELIGIBLE'),
('20000000-0000-0000-0000-000000000007','STF-RUANG-01','Sinta Dewi','sinta.staff@pknstan.local','STAFF','ACTIVE','ELIGIBLE'),
('20000000-0000-0000-0000-000000000008','ADM-PERPUS-01','Rina Kurnia','rina.admin@pknstan.local','STAFF','ACTIVE','ELIGIBLE'),
('20000000-0000-0000-0000-000000000009','HEAD-PERPUS-01','Dedi Pratama','dedi.head@pknstan.local','STAFF','ACTIVE','ELIGIBLE'),
('20000000-0000-0000-0000-000000000010','SYS-ADMIN-01','Admin Sistem','sysadmin@pknstan.local','STAFF','ACTIVE','ELIGIBLE')
ON CONFLICT (institutional_id) DO NOTHING;

INSERT INTO user_role(member_id,role_id)
SELECT m.member_id, r.role_id FROM library_member m JOIN role r ON
  (m.institutional_id='230012345' AND r.role_name='STUDENT') OR
  (m.institutional_id='230012349' AND r.role_name='STUDENT') OR
  (m.institutional_id='230012350' AND r.role_name='STUDENT') OR
  (m.institutional_id='230099999' AND r.role_name='STUDENT') OR
  (m.institutional_id='19870501' AND r.role_name='LECTURER_EMPLOYEE') OR
  (m.institutional_id='STF-BUKU-01' AND r.role_name='BOOK_STAFF') OR
  (m.institutional_id='STF-RUANG-01' AND r.role_name='ROOM_STAFF') OR
  (m.institutional_id='ADM-PERPUS-01' AND r.role_name='LIBRARY_ADMIN') OR
  (m.institutional_id='HEAD-PERPUS-01' AND r.role_name='HEAD_UNIT') OR
  (m.institutional_id='SYS-ADMIN-01' AND r.role_name='SYSTEM_ADMIN')
ON CONFLICT DO NOTHING;

INSERT INTO academic_period(period_id,academic_year,semester,uas_regular_end_date) VALUES
('30000000-0000-0000-0000-000000000001','2026/2027','GASAL','2027-01-05'),
('30000000-0000-0000-0000-000000000002','2025/2026','GENAP','2026-06-25')
ON CONFLICT (academic_year,semester) DO NOTHING;

INSERT INTO class_master(class_id,period_id,class_name,program,concentration) VALUES
('31000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','D4 Akuntansi 2A','D4 Akuntansi Sektor Publik','Akuntansi'),
('31000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000001','D4 Manajemen Keuangan 2B','D4 Manajemen Keuangan Negara','Manajemen Keuangan')
ON CONFLICT DO NOTHING;

INSERT INTO class_member(class_id,member_id) VALUES
('31000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001'),
('31000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000002'),
('31000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000003')
ON CONFLICT DO NOTHING;

INSERT INTO book_title(book_id,isbn,title,author,edition,publisher,publication_year,category) VALUES
('40000000-0000-0000-0000-000000000001','9780134474021','Accounting Information Systems','Romney, Steinbart, Summers, Wood','15th','Pearson',2021,'Accounting'),
('40000000-0000-0000-0000-000000000002','9781119606169','Pengantar Akuntansi','Weygandt, Kimmel, Kieso','14th','Wiley',2020,'Accounting'),
('40000000-0000-0000-0000-000000000003','9781292409188','Management Information Systems','Laudon & Laudon','17th','Pearson',2022,'Information Systems'),
('40000000-0000-0000-0000-000000000004','9780135166307','Database Systems','Thomas Connolly & Carolyn Begg','6th','Pearson',2019,'Information Systems'),
('40000000-0000-0000-0000-000000000005','9780135974445','Clean Architecture','Robert C. Martin','1st','Pearson',2017,'Software Engineering')
ON CONFLICT DO NOTHING;

INSERT INTO book_copy(copy_id,book_id,barcode,location,condition,status) VALUES
('41000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','BK00129','Rak A-01','GOOD','AVAILABLE'),
('41000000-0000-0000-0000-000000000002','40000000-0000-0000-0000-000000000001','BK00130','Rak A-01','GOOD','AVAILABLE'),
('41000000-0000-0000-0000-000000000003','40000000-0000-0000-0000-000000000002','BK00201','Rak A-02','GOOD','AVAILABLE'),
('41000000-0000-0000-0000-000000000004','40000000-0000-0000-0000-000000000002','BK00202','Rak A-02','GOOD','MAINTENANCE'),
('41000000-0000-0000-0000-000000000005','40000000-0000-0000-0000-000000000003','BK00301','Rak B-01','GOOD','AVAILABLE'),
('41000000-0000-0000-0000-000000000006','40000000-0000-0000-0000-000000000004','BK00401','Rak B-03','GOOD','AVAILABLE'),
('41000000-0000-0000-0000-000000000007','40000000-0000-0000-0000-000000000005','BK00501','Rak C-01','GOOD','AVAILABLE')
ON CONFLICT (barcode) DO NOTHING;

INSERT INTO discussion_room(room_id,room_name,capacity,status,location) VALUES
('50000000-0000-0000-0000-000000000001','Ruang 1',9,'ACTIVE','Lantai 1'),
('50000000-0000-0000-0000-000000000002','Ruang 2',7,'ACTIVE','Lantai 1'),
('50000000-0000-0000-0000-000000000003','Ruang 3',7,'ACTIVE','Lantai 1'),
('50000000-0000-0000-0000-000000000004','Ruang 4',9,'ACTIVE','Lantai 2'),
('50000000-0000-0000-0000-000000000005','Ruang 7 - Lesehan',20,'ACTIVE','Lantai 2'),
('50000000-0000-0000-0000-000000000006','Ruang 9',7,'ACTIVE','Lantai 2')
ON CONFLICT DO NOTHING;

-- Working calendar: weekdays are working days. Institutional holidays can be overridden below.
INSERT INTO working_calendar(calendar_date,is_working_day,event_type,description)
SELECT d::date,
       CASE WHEN EXTRACT(ISODOW FROM d) IN (6,7) THEN false ELSE true END,
       CASE WHEN EXTRACT(ISODOW FROM d) IN (6,7) THEN 'WEEKEND' ELSE 'WORKDAY' END,
       CASE WHEN EXTRACT(ISODOW FROM d) IN (6,7) THEN 'Akhir pekan' ELSE 'Hari kerja' END
FROM generate_series('2026-01-01'::date,'2028-12-31'::date,'1 day') AS d
ON CONFLICT (calendar_date) DO NOTHING;

UPDATE working_calendar SET is_working_day=false,event_type='HOLIDAY',description='Tahun Baru' WHERE calendar_date IN ('2027-01-01','2028-01-01');
UPDATE working_calendar SET is_working_day=false,event_type='HOLIDAY',description='Hari Libur Dummy' WHERE calendar_date='2026-12-25';

INSERT INTO system_parameter(parameter_key,parameter_value) VALUES
('INDIVIDUAL_LOAN_WORKDAYS','14'),
('INDIVIDUAL_MAX_ACTIVE_COPIES','2'),
('INDIVIDUAL_EXTENSION_MAX_COUNT','1'),
('FINE_PER_OVERDUE_WORKDAY','1000'),
('BOOK_RESERVATION_EXPIRY_CALENDAR_DAYS','3'),
('ROOM_MAX_DURATION_MINUTES','120'),
('ROOM_MIN_PARTICIPANTS','3'),
('ROOM_NO_SHOW_MINUTES','15'),
('ROOM_BLACKOUT_START','12:00'),
('ROOM_BLACKOUT_END','13:00'),
('ROOM_MAX_ADVANCE_DAYS','1')
ON CONFLICT (parameter_key) DO UPDATE SET parameter_value=EXCLUDED.parameter_value;

INSERT INTO integration_sync_log(sync_id,source_system,started_at,finished_at,record_count,status,error_summary) VALUES
('60000000-0000-0000-0000-000000000001','MASTER_DATA_PKN_STAN',now()-interval '1 hour',now()-interval '59 minutes',10,'SUCCESS',NULL),
('60000000-0000-0000-0000-000000000002','ACADEMIC_CALENDAR',now()-interval '30 minutes',now()-interval '29 minutes',1096,'SUCCESS',NULL)
ON CONFLICT DO NOTHING;

INSERT INTO notification(notification_id,member_id,event_type,title,message,status,sent_at) VALUES
('70000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','WELCOME','Selamat datang','Akun demo Anda siap digunakan pada sistem perpustakaan.','SENT',now())
ON CONFLICT DO NOTHING;

-- Sample operational data for a richer demo
UPDATE book_copy SET status='BORROWED' WHERE copy_id='41000000-0000-0000-0000-000000000003';
INSERT INTO individual_loan(loan_id,member_id,loan_date,due_date,period_status,transaction_status,created_by) VALUES
('80000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',current_date-1,current_date+18,'NORMAL','DIPINJAM','20000000-0000-0000-0000-000000000006')
ON CONFLICT DO NOTHING;
INSERT INTO loan_item(loan_item_id,loan_id,copy_id) VALUES
('81000000-0000-0000-0000-000000000001','80000000-0000-0000-0000-000000000001','41000000-0000-0000-0000-000000000003')
ON CONFLICT DO NOTHING;

UPDATE book_copy SET status='RESERVED' WHERE copy_id='41000000-0000-0000-0000-000000000005';
INSERT INTO book_reservation(reservation_id,member_id,copy_id,requested_at,ready_at,expires_at,status) VALUES
('82000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','41000000-0000-0000-0000-000000000005',now()-interval '1 day',now(),now()+interval '3 days','READY_FOR_PICKUP')
ON CONFLICT DO NOTHING;

INSERT INTO room_reservation(room_reservation_id,member_id,room_id,start_at,end_at,participant_count,status) VALUES
('83000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000002',(current_date+1)+time '09:00',(current_date+1)+time '10:00',5,'BOOKED')
ON CONFLICT DO NOTHING;

INSERT INTO book_suggestion(suggestion_id,member_id,title,author,isbn,publisher,edition,year,subject,reason,quantity,status) VALUES
('84000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','Audit Sistem Informasi Modern','Penulis Dummy',NULL,'Penerbit Demo','1',2026,'Audit SI','Mendukung referensi pembelajaran dan tugas akademik.',2,'DIAJUKAN')
ON CONFLICT DO NOTHING;

INSERT INTO fine(fine_id,source_type,source_id,member_id,overdue_workdays,amount,status) VALUES
('85000000-0000-0000-0000-000000000001','INDIVIDUAL_LOAN','85000000-0000-0000-0000-000000000099','20000000-0000-0000-0000-000000000001',2,2000,'UNPAID')
ON CONFLICT DO NOTHING;

INSERT INTO library_clearance(clearance_id,member_id,period_id,status,reason) VALUES
('86000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','NOT_CLEAR','Masih terdapat kewajiban perpustakaan aktif.')
ON CONFLICT (member_id,period_id) DO NOTHING;
