const express = require('express');
const { pool, withTransaction } = require('../config/db');
const { authenticate, requireRoles } = require('../middleware/auth');
const { AppError, ok, asyncHandler } = require('../utils/http');
const { writeAudit } = require('../utils/audit');
const { serviceDate } = require('../utils/date');

const router = express.Router();
router.use(authenticate);

router.get('/reservations/me', asyncHandler(async(req,res)=>{
  const {rows}=await pool.query(
    `SELECT r.*,c.barcode,b.title,b.author FROM book_reservation r JOIN book_copy c ON c.copy_id=r.copy_id JOIN book_title b ON b.book_id=c.book_id WHERE r.member_id=$1 ORDER BY r.requested_at DESC`,
    [req.user.sub]
  );
  ok(res,rows);
}));

router.post('/reservations', requireRoles('STUDENT','LECTURER_EMPLOYEE'), asyncHandler(async(req,res)=>{
  const {copyId}=req.body||{};
  if(!copyId) throw new AppError(400,'COPY_ID_REQUIRED','copyId wajib diisi.');
  const result=await withTransaction(async(db)=>{
    const memberQ=await db.query('SELECT * FROM library_member WHERE member_id=$1 FOR UPDATE',[req.user.sub]);
    if(!memberQ.rows[0] || memberQ.rows[0].member_status!=='ACTIVE') throw new AppError(422,'MEMBER_INACTIVE','Anggota tidak aktif.');
    const copyQ=await db.query(`SELECT c.*,b.title FROM book_copy c JOIN book_title b ON b.book_id=c.book_id WHERE c.copy_id=$1 FOR UPDATE OF c`,[copyId]);
    const copy=copyQ.rows[0];
    if(!copy) throw new AppError(404,'COPY_NOT_FOUND','Eksemplar tidak ditemukan.');
    if(copy.status!=='AVAILABLE') throw new AppError(409,'COPY_NOT_AVAILABLE','Eksemplar tidak tersedia untuk dibooking.');
    const rQ=await db.query(`INSERT INTO book_reservation(member_id,copy_id,status) VALUES($1,$2,'REQUESTED') RETURNING *`,[req.user.sub,copyId]);
    await db.query(`UPDATE book_copy SET status='RESERVED',updated_at=now() WHERE copy_id=$1`,[copyId]);
    await writeAudit(db,{actorId:req.user.sub,action:'BOOK_RESERVED',objectType:'BOOK_RESERVATION',objectId:rQ.rows[0].reservation_id,newValue:{copyId,title:copy.title}});
    return {...rQ.rows[0],title:copy.title,barcode:copy.barcode};
  });
  ok(res,result,'Booking buku berhasil dibuat.',201);
}));

router.delete('/reservations/:reservationId', asyncHandler(async(req,res)=>{
  const result=await withTransaction(async(db)=>{
    const q=await db.query(`SELECT * FROM book_reservation WHERE reservation_id=$1 AND member_id=$2 FOR UPDATE`,[req.params.reservationId,req.user.sub]);
    const r=q.rows[0];
    if(!r) throw new AppError(404,'RESERVATION_NOT_FOUND','Booking tidak ditemukan.');
    if(!['REQUESTED','READY_FOR_PICKUP'].includes(r.status)) throw new AppError(409,'RESERVATION_NOT_CANCELLABLE','Booking tidak dapat dibatalkan.');
    const u=await db.query(`UPDATE book_reservation SET status='CANCELLED' WHERE reservation_id=$1 RETURNING *`,[r.reservation_id]);
    await db.query(`UPDATE book_copy SET status='AVAILABLE',updated_at=now() WHERE copy_id=$1 AND status='RESERVED'`,[r.copy_id]);
    await writeAudit(db,{actorId:req.user.sub,action:'BOOK_RESERVATION_CANCELLED',objectType:'BOOK_RESERVATION',objectId:r.reservation_id,oldValue:r,newValue:u.rows[0]});
    return u.rows[0];
  });
  ok(res,result,'Booking dibatalkan.');
}));

router.get('/staff/reservations', requireRoles('BOOK_STAFF'), asyncHandler(async(req,res)=>{
  const {rows}=await pool.query(`SELECT r.*,m.full_name,m.institutional_id,c.barcode,b.title FROM book_reservation r JOIN library_member m ON m.member_id=r.member_id JOIN book_copy c ON c.copy_id=r.copy_id JOIN book_title b ON b.book_id=c.book_id WHERE r.status IN ('REQUESTED','READY_FOR_PICKUP') ORDER BY r.requested_at`);
  ok(res,rows);
}));

router.post('/staff/reservations/:reservationId/ready', requireRoles('BOOK_STAFF'), asyncHandler(async(req,res)=>{
  const result=await withTransaction(async(db)=>{
    const q=await db.query(`SELECT * FROM book_reservation WHERE reservation_id=$1 FOR UPDATE`,[req.params.reservationId]);
    const r=q.rows[0];
    if(!r) throw new AppError(404,'RESERVATION_NOT_FOUND','Booking tidak ditemukan.');
    if(r.status!=='REQUESTED') throw new AppError(409,'INVALID_RESERVATION_STATUS','Booking tidak berstatus REQUESTED.');
    const u=await db.query(`UPDATE book_reservation SET status='READY_FOR_PICKUP',ready_at=now(),expires_at=now()+interval '3 days' WHERE reservation_id=$1 RETURNING *`,[r.reservation_id]);
    await db.query(`INSERT INTO notification(member_id,event_type,reference_type,reference_id,title,message,status,sent_at) VALUES($1,'BOOK_READY','BOOK_RESERVATION',$2,'Buku siap diambil','Buku yang Anda booking siap diambil dalam 3 hari kalender.','SENT',now())`,[r.member_id,r.reservation_id]);
    await writeAudit(db,{actorId:req.user.sub,action:'BOOK_RESERVATION_READY',objectType:'BOOK_RESERVATION',objectId:r.reservation_id,newValue:u.rows[0]});
    return u.rows[0];
  });
  ok(res,result,'Booking ditandai siap diambil.');
}));

router.post('/staff/reservations/:reservationId/convert-to-loan', requireRoles('BOOK_STAFF'), asyncHandler(async(req,res)=>{
  const result=await withTransaction(async(db)=>{
    const q=await db.query(`SELECT r.*,m.institutional_id,c.status AS copy_status FROM book_reservation r JOIN library_member m ON m.member_id=r.member_id JOIN book_copy c ON c.copy_id=r.copy_id WHERE r.reservation_id=$1 FOR UPDATE OF r,c`,[req.params.reservationId]);
    const r=q.rows[0];
    if(!r) throw new AppError(404,'RESERVATION_NOT_FOUND','Booking tidak ditemukan.');
    if(r.status!=='READY_FOR_PICKUP') throw new AppError(409,'INVALID_RESERVATION_STATUS','Booking belum siap diambil.');
    if(r.expires_at && new Date(r.expires_at).getTime() <= Date.now()) {
      await db.query(`UPDATE book_reservation SET status='EXPIRED' WHERE reservation_id=$1`,[r.reservation_id]);
      await db.query(`UPDATE book_copy SET status='AVAILABLE',updated_at=now() WHERE copy_id=$1 AND status='RESERVED'`,[r.copy_id]);
      throw new AppError(409,'RESERVATION_EXPIRED','Booking telah melewati batas pengambilan 3 hari kalender.');
    }
    if(r.copy_status!=='RESERVED') throw new AppError(409,'COPY_STATE_MISMATCH','Status eksemplar tidak konsisten dengan booking.');
    const active=await db.query(`SELECT COUNT(*)::int total FROM loan_item li JOIN individual_loan l ON l.loan_id=li.loan_id WHERE l.member_id=$1 AND li.returned_at IS NULL`,[r.member_id]);
    if(active.rows[0].total>=2) throw new AppError(422,'LOAN_LIMIT_REACHED','Kuota pinjaman aktif sudah penuh.');
    const { calculateNthWorkingDay } = require('../utils/businessRules');
    const loanDate=serviceDate();
    const dueDate=await calculateNthWorkingDay(db,loanDate,14,true);
    const lq=await db.query(`INSERT INTO individual_loan(member_id,loan_date,due_date,created_by) VALUES($1,$2,$3,$4) RETURNING *`,[r.member_id,loanDate,dueDate,req.user.sub]);
    await db.query(`INSERT INTO loan_item(loan_id,copy_id) VALUES($1,$2)`,[lq.rows[0].loan_id,r.copy_id]);
    await db.query(`UPDATE book_copy SET status='BORROWED',updated_at=now() WHERE copy_id=$1`,[r.copy_id]);
    await db.query(`UPDATE book_reservation SET status='CONVERTED_TO_LOAN' WHERE reservation_id=$1`,[r.reservation_id]);
    await writeAudit(db,{actorId:req.user.sub,action:'RESERVATION_CONVERTED_TO_LOAN',objectType:'BOOK_RESERVATION',objectId:r.reservation_id,newValue:{loanId:lq.rows[0].loan_id,dueDate}});
    return lq.rows[0];
  });
  ok(res,result,'Booking dikonversi menjadi pinjaman.');
}));

module.exports=router;
