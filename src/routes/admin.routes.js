const express=require('express');
const {pool}=require('../config/db');
const {authenticate,requireRoles}=require('../middleware/auth');
const {AppError,ok,asyncHandler}=require('../utils/http');
const {writeAudit}=require('../utils/audit');

const router=express.Router();
router.use(authenticate);

router.get('/reports/summary',requireRoles('LIBRARY_ADMIN','HEAD_UNIT'),asyncHandler(async(req,res)=>{
  const [loans,overdue,rooms,incidents,suggestions,exceptions]=await Promise.all([
    pool.query(`SELECT COUNT(*)::int total FROM individual_loan WHERE created_at >= date_trunc('month',now())`),
    pool.query(`SELECT COUNT(*)::int total FROM individual_loan WHERE transaction_status='TERLAMBAT'`),
    pool.query(`SELECT COUNT(*)::int total FROM room_reservation WHERE start_at >= date_trunc('month',now())`),
    pool.query(`SELECT COUNT(*)::int total FROM book_incident WHERE status='OPEN'`),
    pool.query(`SELECT COUNT(*)::int total FROM book_suggestion WHERE status IN ('DIAJUKAN','DITINJAU')`),
    pool.query(`SELECT COUNT(*)::int total FROM integration_sync_log WHERE status='FAILED'`)
  ]);
  ok(res,{monthlyTransactions:loans.rows[0].total,overdueLoans:overdue.rows[0].total,monthlyRoomReservations:rooms.rows[0].total,openIncidents:incidents.rows[0].total,pendingSuggestions:suggestions.rows[0].total,integrationExceptions:exceptions.rows[0].total});
}));

router.get('/audit',requireRoles('LIBRARY_ADMIN','HEAD_UNIT','SYSTEM_ADMIN'),asyncHandler(async(req,res)=>{
  const limit=Math.min(Number(req.query.limit||100),500);
  const {rows}=await pool.query(`SELECT a.*,m.full_name AS actor_name,m.institutional_id AS actor_institutional_id FROM audit_log a LEFT JOIN library_member m ON m.member_id=a.actor_id ORDER BY a.timestamp DESC LIMIT $1`,[limit]);
  ok(res,rows);
}));

router.get('/system/integrations',requireRoles('SYSTEM_ADMIN'),asyncHandler(async(req,res)=>{
  const {rows}=await pool.query(`SELECT * FROM integration_sync_log ORDER BY started_at DESC LIMIT 100`);
  ok(res,rows);
}));

router.get('/system/parameters',requireRoles('LIBRARY_ADMIN','SYSTEM_ADMIN'),asyncHandler(async(req,res)=>{
  const {rows}=await pool.query(`SELECT * FROM system_parameter ORDER BY parameter_key`);
  ok(res,rows);
}));

router.patch('/system/parameters/:key',requireRoles('LIBRARY_ADMIN'),asyncHandler(async(req,res)=>{
  const {value}=req.body||{};
  if(value===undefined||value===null||value==='') throw new AppError(400,'VALUE_REQUIRED','Nilai parameter wajib diisi.');
  const before=await pool.query(`SELECT * FROM system_parameter WHERE parameter_key=$1`,[req.params.key]);
  const {rows}=await pool.query(`UPDATE system_parameter SET parameter_value=$2,changed_by=$3,changed_at=now() WHERE parameter_key=$1 RETURNING *`,[req.params.key,String(value),req.user.sub]);
  if(!rows[0]) throw new AppError(404,'PARAMETER_NOT_FOUND','Parameter tidak ditemukan.');
  await writeAudit(pool,{actorId:req.user.sub,action:'SYSTEM_PARAMETER_CHANGED',objectType:'SYSTEM_PARAMETER',objectId:req.params.key,oldValue:before.rows[0],newValue:rows[0]});
  ok(res,rows[0],'Parameter diperbarui.');
}));

module.exports=router;
