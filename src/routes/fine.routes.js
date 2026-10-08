const express = require('express');
const { pool, withTransaction } = require('../config/db');
const { authenticate, requireRoles } = require('../middleware/auth');
const { AppError, ok, asyncHandler } = require('../utils/http');
const { writeAudit } = require('../utils/audit');
const { validateEnvironment } = require('../config/env');

const router = express.Router();
router.use(authenticate);

router.get('/fines/me', asyncHandler(async(req,res)=>{
  const {rows}=await pool.query(`SELECT f.*,p.payment_id,p.method,p.status AS payment_status,p.gateway_status,p.paid_at,p.staff_verified_at FROM fine f LEFT JOIN LATERAL (SELECT * FROM payment p2 WHERE p2.fine_id=f.fine_id ORDER BY created_at DESC LIMIT 1) p ON true WHERE f.member_id=$1 ORDER BY f.calculated_at DESC`,[req.user.sub]);
  ok(res,rows);
}));

router.post('/payments', asyncHandler(async(req,res)=>{
  const {fineId,method='QRIS'}=req.body||{};
  if(!fineId) throw new AppError(400,'FINE_ID_REQUIRED','fineId wajib diisi.');
  if(!['CASH','QRIS','GATEWAY'].includes(method)) throw new AppError(422,'INVALID_PAYMENT_METHOD','Metode pembayaran tidak valid.');
  const result=await withTransaction(async(db)=>{
    const q=await db.query(`SELECT * FROM fine WHERE fine_id=$1 FOR UPDATE`,[fineId]);
    const fine=q.rows[0];
    if(!fine) throw new AppError(404,'FINE_NOT_FOUND','Denda tidak ditemukan.');
    if(fine.member_id && fine.member_id!==req.user.sub && !req.user.roles.includes('BOOK_STAFF')) throw new AppError(403,'FORBIDDEN','Anda tidak berhak membayar kewajiban ini.');
    if(!fine.member_id && !req.user.roles.includes('BOOK_STAFF')) throw new AppError(403,'FORBIDDEN','Denda kolektif hanya dapat diproses oleh petugas yang berwenang.');
    if(['VERIFIED','WAIVED'].includes(fine.status)) throw new AppError(409,'FINE_ALREADY_SETTLED','Denda sudah selesai.');
    const env=validateEnvironment();
    if(method==='CASH' && !req.user.roles.includes('BOOK_STAFF')) throw new AppError(403,'CASH_STAFF_ONLY','Pembayaran tunai hanya dapat dicatat oleh petugas.');
    if(method!=='CASH' && !env.demoMode) throw new AppError(503,'PAYMENT_GATEWAY_NOT_CONFIGURED','Payment gateway resmi belum dikonfigurasi.');
    const gatewayStatus=method==='CASH'?null:'SUCCESS';
    const status='SUCCESS';
    const ref=method==='CASH'?null:`DEMO-${Date.now()}`;
    const p=await db.query(`INSERT INTO payment(fine_id,method,amount,gateway_reference,gateway_status,paid_at,status) VALUES($1,$2,$3,$4,$5,now(),$6) RETURNING *`,[fineId,method,fine.amount,ref,gatewayStatus,status]);
    await db.query(`UPDATE fine SET status='PAID_UNVERIFIED' WHERE fine_id=$1`,[fineId]);
    await writeAudit(db,{actorId:req.user.sub,action:'PAYMENT_RECORDED',objectType:'PAYMENT',objectId:p.rows[0].payment_id,newValue:p.rows[0]});
    return p.rows[0];
  });
  ok(res,result,'Pembayaran tercatat dan tetap memerlukan verifikasi petugas.',201);
}));

router.get('/staff/fines', requireRoles('BOOK_STAFF'), asyncHandler(async(req,res)=>{
  const {rows}=await pool.query(`SELECT f.*,m.full_name,m.institutional_id,p.payment_id,p.method,p.status AS payment_status,p.gateway_status,p.paid_at FROM fine f LEFT JOIN library_member m ON m.member_id=f.member_id LEFT JOIN LATERAL (SELECT * FROM payment p2 WHERE p2.fine_id=f.fine_id ORDER BY created_at DESC LIMIT 1) p ON true ORDER BY f.calculated_at DESC`);
  ok(res,rows);
}));

router.post('/staff/payments/:paymentId/verify', requireRoles('BOOK_STAFF'), asyncHandler(async(req,res)=>{
  const result=await withTransaction(async(db)=>{
    const q=await db.query(`SELECT p.*,f.status AS fine_status FROM payment p JOIN fine f ON f.fine_id=p.fine_id WHERE p.payment_id=$1 FOR UPDATE OF p,f`,[req.params.paymentId]);
    const p=q.rows[0];
    if(!p) throw new AppError(404,'PAYMENT_NOT_FOUND','Pembayaran tidak ditemukan.');
    if(p.status!=='SUCCESS') throw new AppError(422,'PAYMENT_NOT_SUCCESS','Pembayaran belum berstatus SUCCESS.');
    const u=await db.query(`UPDATE payment SET status='VERIFIED',staff_verified_by=$2,staff_verified_at=now() WHERE payment_id=$1 RETURNING *`,[p.payment_id,req.user.sub]);
    await db.query(`UPDATE fine SET status='VERIFIED' WHERE fine_id=$1`,[p.fine_id]);
    await writeAudit(db,{actorId:req.user.sub,action:'PAYMENT_VERIFIED',objectType:'PAYMENT',objectId:p.payment_id,newValue:u.rows[0]});
    return u.rows[0];
  });
  ok(res,result,'Pembayaran diverifikasi petugas.');
}));

module.exports=router;
