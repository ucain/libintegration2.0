const express = require('express');
const { pool, withTransaction } = require('../config/db');
const { authenticate, requireRoles } = require('../middleware/auth');
const { AppError, ok, asyncHandler } = require('../utils/http');
const { validateRoomInput } = require('../utils/businessRules');
const { writeAudit } = require('../utils/audit');
const { normalizeServiceDateTime, serviceDate } = require('../utils/date');

const router = express.Router();
router.use(authenticate);

router.get('/rooms', asyncHandler(async(req,res)=>{
  const {rows}=await pool.query(`SELECT * FROM discussion_room ORDER BY room_name`);
  ok(res,rows);
}));

router.get('/rooms/availability', asyncHandler(async(req,res)=>{
  const {startAt,endAt,participants}=req.query;
  if(!startAt||!endAt) throw new AppError(400,'TIME_REQUIRED','startAt dan endAt wajib diisi.');
  const normalizedStart=normalizeServiceDateTime(startAt), normalizedEnd=normalizeServiceDateTime(endAt);
  if(!normalizedStart||!normalizedEnd) throw new AppError(400,'INVALID_TIME','Format waktu tidak valid.');
  const {rows}=await pool.query(
    `SELECT r.*,
            NOT EXISTS(
              SELECT 1 FROM room_reservation rr
               WHERE rr.room_id=r.room_id
                 AND rr.status IN ('BOOKED','CHECKED_IN')
                 AND tstzrange(rr.start_at,rr.end_at,'[)') && tstzrange($1::timestamptz,$2::timestamptz,'[)')
            ) AS available
       FROM discussion_room r
      WHERE r.status='ACTIVE'
        AND ($3::int IS NULL OR r.capacity >= $3::int)
      ORDER BY r.room_name`,
    [normalizedStart,normalizedEnd,participants?Number(participants):null]
  );
  ok(res,rows);
}));

router.post('/room-reservations', requireRoles('STUDENT','LECTURER_EMPLOYEE'), asyncHandler(async(req,res)=>{
  const {roomId,startAt,endAt,participantCount}=req.body||{};
  if(!roomId||!startAt||!endAt||!participantCount) throw new AppError(400,'INVALID_INPUT','Ruang, waktu mulai, waktu selesai, dan jumlah peserta wajib diisi.');
  const normalizedStart=normalizeServiceDateTime(startAt), normalizedEnd=normalizeServiceDateTime(endAt);
  if(!normalizedStart||!normalizedEnd) throw new AppError(400,'INVALID_TIME','Format waktu tidak valid.');
  const result=await withTransaction(async(db)=>{
    const roomQ=await db.query(`SELECT * FROM discussion_room WHERE room_id=$1 FOR UPDATE`,[roomId]);
    const room=roomQ.rows[0];
    if(!room) throw new AppError(404,'ROOM_NOT_FOUND','Ruang tidak ditemukan.');
    if(room.status!=='ACTIVE') throw new AppError(422,'ROOM_UNAVAILABLE','Ruang tidak aktif.');
    validateRoomInput({now:new Date(),startAt:normalizedStart,endAt:normalizedEnd,participantCount:Number(participantCount),capacity:room.capacity});
    const conflict=await db.query(
      `SELECT 1 FROM room_reservation WHERE room_id=$1 AND status IN ('BOOKED','CHECKED_IN') AND tstzrange(start_at,end_at,'[)') && tstzrange($2::timestamptz,$3::timestamptz,'[)') LIMIT 1`,
      [roomId,normalizedStart,normalizedEnd]
    );
    if(conflict.rows[0]) throw new AppError(409,'ROOM_NOT_AVAILABLE','Ruang sudah dipesan pada slot tersebut.');
    const q=await db.query(`INSERT INTO room_reservation(member_id,room_id,start_at,end_at,participant_count,status) VALUES($1,$2,$3,$4,$5,'BOOKED') RETURNING *`,[req.user.sub,roomId,normalizedStart,normalizedEnd,participantCount]);
    await db.query(`INSERT INTO notification(member_id,event_type,reference_type,reference_id,title,message,status,sent_at) VALUES($1,'ROOM_BOOKED','ROOM_RESERVATION',$2,'Booking ruang berhasil',$3,'SENT',now())`,[req.user.sub,q.rows[0].room_reservation_id,`${room.room_name} berhasil dipesan.`]);
    await writeAudit(db,{actorId:req.user.sub,action:'ROOM_RESERVED',objectType:'ROOM_RESERVATION',objectId:q.rows[0].room_reservation_id,newValue:q.rows[0]});
    return {...q.rows[0],room_name:room.room_name};
  });
  ok(res,result,'Booking ruang berhasil.',201);
}));

router.get('/room-reservations/me', asyncHandler(async(req,res)=>{
  const {rows}=await pool.query(`SELECT rr.*,r.room_name,r.location FROM room_reservation rr JOIN discussion_room r ON r.room_id=rr.room_id WHERE rr.member_id=$1 ORDER BY rr.start_at DESC`,[req.user.sub]);
  ok(res,rows);
}));

router.delete('/room-reservations/:id', asyncHandler(async(req,res)=>{
  const {rows}=await pool.query(`UPDATE room_reservation SET status='CANCELLED' WHERE room_reservation_id=$1 AND member_id=$2 AND status='BOOKED' RETURNING *`,[req.params.id,req.user.sub]);
  if(!rows[0]) throw new AppError(404,'RESERVATION_NOT_FOUND','Reservasi tidak ditemukan atau tidak dapat dibatalkan.');
  await writeAudit(pool,{actorId:req.user.sub,action:'ROOM_RESERVATION_CANCELLED',objectType:'ROOM_RESERVATION',objectId:rows[0].room_reservation_id,newValue:rows[0]});
  ok(res,rows[0],'Reservasi ruang dibatalkan.');
}));

router.get('/staff/room-reservations', requireRoles('ROOM_STAFF'), asyncHandler(async(req,res)=>{
  const date=req.query.date||serviceDate();
  const {rows}=await pool.query(`SELECT rr.*,r.room_name,m.full_name,m.institutional_id FROM room_reservation rr JOIN discussion_room r ON r.room_id=rr.room_id JOIN library_member m ON m.member_id=rr.member_id WHERE rr.start_at::date=$1::date ORDER BY rr.start_at`,[date]);
  ok(res,rows);
}));

router.post('/staff/room-reservations/:id/check-in', requireRoles('ROOM_STAFF'), asyncHandler(async(req,res)=>{
  const {rows}=await pool.query(`UPDATE room_reservation SET status='CHECKED_IN',checkin_at=now() WHERE room_reservation_id=$1 AND status='BOOKED' RETURNING *`,[req.params.id]);
  if(!rows[0]) throw new AppError(409,'CHECKIN_NOT_ALLOWED','Reservasi tidak dapat di-check-in.');
  await writeAudit(pool,{actorId:req.user.sub,action:'ROOM_CHECKED_IN',objectType:'ROOM_RESERVATION',objectId:req.params.id,newValue:{checkinAt:rows[0].checkin_at}});
  ok(res,rows[0],'Check-in berhasil.');
}));

router.post('/staff/room-reservations/:id/key-out', requireRoles('ROOM_STAFF'), asyncHandler(async(req,res)=>{
  const {rows}=await pool.query(`INSERT INTO room_key_log(room_reservation_id,handed_out_by,handed_out_at) VALUES($1,$2,now()) RETURNING *`,[req.params.id,req.user.sub]);
  await writeAudit(pool,{actorId:req.user.sub,action:'ROOM_KEY_HANDED_OUT',objectType:'ROOM_KEY_LOG',objectId:rows[0].key_log_id,newValue:rows[0]});
  ok(res,rows[0],'Kunci dicatat sebagai diserahkan.',201);
}));

router.post('/staff/room-reservations/:id/check-out', requireRoles('ROOM_STAFF'), asyncHandler(async(req,res)=>{
  const {conditionNote='Baik'}=req.body||{};
  const result=await withTransaction(async(db)=>{
    const q=await db.query(`UPDATE room_reservation SET status='COMPLETED',checkout_at=now() WHERE room_reservation_id=$1 AND status='CHECKED_IN' RETURNING *`,[req.params.id]);
    if(!q.rows[0]) throw new AppError(409,'CHECKOUT_NOT_ALLOWED','Reservasi tidak dapat di-check-out.');
    const key=await db.query(`UPDATE room_key_log SET returned_to=$2,returned_at=now(),condition_note=$3 WHERE key_log_id=(SELECT key_log_id FROM room_key_log WHERE room_reservation_id=$1 AND returned_at IS NULL ORDER BY handed_out_at DESC LIMIT 1) RETURNING *`,[req.params.id,req.user.sub,conditionNote]);
    await writeAudit(db,{actorId:req.user.sub,action:'ROOM_CHECKED_OUT',objectType:'ROOM_RESERVATION',objectId:req.params.id,newValue:{checkoutAt:q.rows[0].checkout_at,conditionNote}});
    return {reservation:q.rows[0],keyLog:key.rows[0]||null};
  });
  ok(res,result,'Check-out dan pengembalian kunci selesai.');
}));

module.exports=router;
