const express=require('express');
const {pool,withTransaction}=require('../config/db');
const {authenticate,requireRoles}=require('../middleware/auth');
const {AppError,ok,asyncHandler}=require('../utils/http');
const {writeAudit}=require('../utils/audit');

const router=express.Router();
router.use(authenticate);
router.use('/staff',requireRoles('BOOK_STAFF'));

router.get('/staff/incidents',asyncHandler(async(req,res)=>{
  const {rows}=await pool.query(`SELECT i.*,m.full_name,m.institutional_id,c.barcode,b.title FROM book_incident i JOIN library_member m ON m.member_id=i.member_id JOIN book_copy c ON c.copy_id=i.copy_id JOIN book_title b ON b.book_id=c.book_id ORDER BY i.reported_at DESC`);
  ok(res,rows);
}));

router.post('/staff/incidents',asyncHandler(async(req,res)=>{
  const {institutionalId,barcode,incidentType}=req.body||{};
  if(!institutionalId||!barcode||!['LOST','DAMAGED'].includes(incidentType)) throw new AppError(400,'INVALID_INPUT','institutionalId, barcode, dan incidentType LOST/DAMAGED wajib diisi.');
  const result=await withTransaction(async(db)=>{
    const q=await db.query(`SELECT li.loan_item_id,l.loan_id,l.member_id,c.copy_id,c.status,m.full_name FROM loan_item li JOIN individual_loan l ON l.loan_id=li.loan_id JOIN book_copy c ON c.copy_id=li.copy_id JOIN library_member m ON m.member_id=l.member_id WHERE m.institutional_id=$1 AND c.barcode=$2 AND li.returned_at IS NULL FOR UPDATE OF l,c`,[institutionalId,barcode]);
    const item=q.rows[0];
    if(!item) throw new AppError(404,'ACTIVE_LOAN_ITEM_NOT_FOUND','Pinjaman aktif untuk buku tersebut tidak ditemukan.');
    const open=await db.query(`SELECT incident_id FROM book_incident WHERE copy_id=$1 AND status='OPEN' LIMIT 1`,[item.copy_id]);
    if(open.rows[0]) throw new AppError(409,'INCIDENT_ALREADY_OPEN','Eksemplar sudah memiliki insiden OPEN.');
    const i=await db.query(`INSERT INTO book_incident(member_id,copy_id,incident_type,created_by) VALUES($1,$2,$3,$4) RETURNING *`,[item.member_id,item.copy_id,incidentType,req.user.sub]);
    await db.query(`UPDATE book_copy SET status=$2,updated_at=now() WHERE copy_id=$1`,[item.copy_id,incidentType]);
    await db.query(`UPDATE individual_loan SET transaction_status='HILANG_RUSAK',updated_at=now() WHERE loan_id=$1`,[item.loan_id]);
    await writeAudit(db,{actorId:req.user.sub,action:'BOOK_INCIDENT_OPENED',objectType:'BOOK_INCIDENT',objectId:i.rows[0].incident_id,newValue:i.rows[0]});
    return i.rows[0];
  });
  ok(res,result,'Insiden buku dibuat.',201);
}));

router.post('/staff/incidents/:id/book-found',asyncHandler(async(req,res)=>{
  const {condition='GOOD',verificationResult='ACCEPTED'}=req.body||{};
  if(verificationResult!=='ACCEPTED') throw new AppError(422,'BOOK_FOUND_NOT_ACCEPTED','Buku ditemukan tetapi belum diterima; kewajiban belum dapat dibatalkan.');
  const result=await withTransaction(async(db)=>{
    const q=await db.query(`SELECT * FROM book_incident WHERE incident_id=$1 FOR UPDATE`,[req.params.id]);
    const incident=q.rows[0];
    if(!incident) throw new AppError(404,'INCIDENT_NOT_FOUND','Insiden tidak ditemukan.');
    if(incident.status!=='OPEN') throw new AppError(409,'INCIDENT_NOT_OPEN','Insiden tidak lagi OPEN.');
    const u=await db.query(`UPDATE book_incident SET status='RESOLVED',resolution_reason='BOOK_FOUND',resolved_at=now() WHERE incident_id=$1 RETURNING *`,[incident.incident_id]);
    await db.query(`UPDATE book_copy SET status='AVAILABLE',condition=$2,updated_at=now() WHERE copy_id=$1`,[incident.copy_id,condition]);
    const itemQ=await db.query(`UPDATE loan_item li SET returned_at=COALESCE(returned_at,now()),return_condition=$2,returned_by=$3 WHERE li.copy_id=$1 AND li.returned_at IS NULL RETURNING loan_id`,[incident.copy_id,condition,req.user.sub]);
    if(itemQ.rows[0]) {
      const remain=await db.query(`SELECT COUNT(*)::int total FROM loan_item WHERE loan_id=$1 AND returned_at IS NULL`,[itemQ.rows[0].loan_id]);
      if(remain.rows[0].total===0) await db.query(`UPDATE individual_loan SET transaction_status='DIKEMBALIKAN',updated_at=now() WHERE loan_id=$1`,[itemQ.rows[0].loan_id]);
    }
    await writeAudit(db,{actorId:req.user.sub,action:'BOOK_FOUND_VERIFIED',objectType:'BOOK_INCIDENT',objectId:incident.incident_id,oldValue:incident,newValue:u.rows[0]});
    return u.rows[0];
  });
  ok(res,result,'Buku ditemukan dan diterima; kewajiban penggantian dibatalkan.');
}));

router.post('/staff/incidents/:id/replacement',asyncHandler(async(req,res)=>{
  const {replacementBookTitle,replacementEdition,verificationResult='ACCEPTED'}=req.body||{};
  if(!replacementBookTitle) throw new AppError(400,'REPLACEMENT_BOOK_REQUIRED','Judul buku pengganti wajib diisi.');
  const result=await withTransaction(async(db)=>{
    const q=await db.query(`SELECT * FROM book_incident WHERE incident_id=$1 FOR UPDATE`,[req.params.id]);
    const incident=q.rows[0];
    if(!incident) throw new AppError(404,'INCIDENT_NOT_FOUND','Insiden tidak ditemukan.');
    const r=await db.query(`INSERT INTO book_replacement(incident_id,replacement_book_title,replacement_edition,verified_by,verification_result) VALUES($1,$2,$3,$4,$5) RETURNING *`,[incident.incident_id,replacementBookTitle,replacementEdition||null,req.user.sub,verificationResult]);
    if(verificationResult==='ACCEPTED') {
      await db.query(`UPDATE book_incident SET status='CLOSED',resolution_reason='REPLACED',resolved_at=now() WHERE incident_id=$1`,[incident.incident_id]);
      const itemQ=await db.query(`UPDATE loan_item li SET returned_at=COALESCE(returned_at,now()),return_condition=$2,returned_by=$3 WHERE li.copy_id=$1 AND li.returned_at IS NULL RETURNING loan_id`,[incident.copy_id,incident.incident_type==='LOST'?'LOST':'DAMAGED',req.user.sub]);
      if(itemQ.rows[0]) {
        const remain=await db.query(`SELECT COUNT(*)::int total FROM loan_item WHERE loan_id=$1 AND returned_at IS NULL`,[itemQ.rows[0].loan_id]);
        if(remain.rows[0].total===0) await db.query(`UPDATE individual_loan SET transaction_status='DIKEMBALIKAN',updated_at=now() WHERE loan_id=$1`,[itemQ.rows[0].loan_id]);
      }
    }
    await writeAudit(db,{actorId:req.user.sub,action:'BOOK_REPLACEMENT_VERIFIED',objectType:'BOOK_REPLACEMENT',objectId:r.rows[0].replacement_id,newValue:r.rows[0]});
    return r.rows[0];
  });
  ok(res,result,'Buku pengganti diverifikasi.',201);
}));

module.exports=router;
