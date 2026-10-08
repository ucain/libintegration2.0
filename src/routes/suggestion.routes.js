const express=require('express');
const {pool}=require('../config/db');
const {authenticate,requireRoles}=require('../middleware/auth');
const {AppError,ok,asyncHandler}=require('../utils/http');
const {writeAudit}=require('../utils/audit');

const router=express.Router();
router.use(authenticate);

router.get('/suggestions/me',asyncHandler(async(req,res)=>{
  const {rows}=await pool.query(`SELECT * FROM book_suggestion WHERE member_id=$1 ORDER BY created_at DESC`,[req.user.sub]);
  ok(res,rows);
}));

router.post('/suggestions',requireRoles('STUDENT','LECTURER_EMPLOYEE'),asyncHandler(async(req,res)=>{
  const {title,author,isbn,publisher,edition,year,subject,reason,quantity=1}=req.body||{};
  if(!title||!author||!reason) throw new AppError(400,'REQUIRED_FIELD','Judul, penulis, dan alasan wajib diisi.');
  const dup=await pool.query(`SELECT suggestion_id,title,status FROM book_suggestion WHERE lower(title)=lower($1) AND lower(author)=lower($2) AND status NOT IN ('DITOLAK') LIMIT 1`,[title,author]);
  if(dup.rows[0]) throw new AppError(409,'DUPLICATE_SUGGESTION','Usulan serupa sudah ada.',dup.rows[0]);
  const {rows}=await pool.query(`INSERT INTO book_suggestion(member_id,title,author,isbn,publisher,edition,year,subject,reason,quantity) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,[req.user.sub,title,author,isbn||null,publisher||null,edition||null,year||null,subject||null,reason,quantity]);
  await writeAudit(pool,{actorId:req.user.sub,action:'BOOK_SUGGESTION_CREATED',objectType:'BOOK_SUGGESTION',objectId:rows[0].suggestion_id,newValue:rows[0]});
  ok(res,rows[0],'Usulan buku berhasil diajukan.',201);
}));

router.get('/admin/suggestions',requireRoles('LIBRARY_ADMIN'),asyncHandler(async(req,res)=>{
  const {rows}=await pool.query(`SELECT s.*,m.full_name,m.institutional_id FROM book_suggestion s JOIN library_member m ON m.member_id=s.member_id ORDER BY s.created_at DESC`);
  ok(res,rows);
}));

router.patch('/admin/suggestions/:id',requireRoles('LIBRARY_ADMIN'),asyncHandler(async(req,res)=>{
  const {status,reviewNote=null}=req.body||{};
  const allowed=['DITINJAU','DISETUJUI','DITOLAK','DALAM_PROSES_PENGADAAN','TERSEDIA'];
  if(!allowed.includes(status)) throw new AppError(422,'INVALID_SUGGESTION_STATUS','Status usulan tidak valid.');
  const {rows}=await pool.query(`UPDATE book_suggestion SET status=$2,review_note=$3,reviewed_by=$4,updated_at=now() WHERE suggestion_id=$1 RETURNING *`,[req.params.id,status,reviewNote,req.user.sub]);
  if(!rows[0]) throw new AppError(404,'SUGGESTION_NOT_FOUND','Usulan tidak ditemukan.');
  await pool.query(`INSERT INTO notification(member_id,event_type,reference_type,reference_id,title,message,status,sent_at) VALUES($1,'SUGGESTION_STATUS','BOOK_SUGGESTION',$2,'Status saran buku diperbarui',$3,'SENT',now())`,[rows[0].member_id,rows[0].suggestion_id,`Status usulan Anda: ${status}.`]);
  await writeAudit(pool,{actorId:req.user.sub,action:'BOOK_SUGGESTION_STATUS_CHANGED',objectType:'BOOK_SUGGESTION',objectId:rows[0].suggestion_id,newValue:{status,reviewNote}});
  ok(res,rows[0],'Status usulan diperbarui.');
}));

module.exports=router;
