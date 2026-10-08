const express = require('express');
const { pool, withTransaction } = require('../config/db');
const { authenticate, requireRoles } = require('../middleware/auth');
const { AppError, ok, asyncHandler } = require('../utils/http');
const { calculateNthWorkingDay, countOverdueWorkdays } = require('../utils/businessRules');
const { writeAudit } = require('../utils/audit');
const { serviceDate } = require('../utils/date');

const router = express.Router();
router.use(authenticate);

router.post('/staff/loans', requireRoles('BOOK_STAFF'), asyncHandler(async (req, res) => {
  const { institutionalId, copyIds = [], barcodes = [] } = req.body || {};
  if (!institutionalId || ((!Array.isArray(copyIds) || copyIds.length === 0) && (!Array.isArray(barcodes) || barcodes.length === 0))) {
    throw new AppError(400,'INVALID_INPUT','Institutional ID dan minimal satu copyId atau barcode wajib diisi.');
  }

  const loan = await withTransaction(async (db) => {
    const memberQ = await db.query(`SELECT * FROM library_member WHERE institutional_id=$1 FOR UPDATE`,[institutionalId]);
    const member = memberQ.rows[0];
    if (!member) throw new AppError(404,'MEMBER_NOT_FOUND','Anggota tidak ditemukan.');
    if (member.member_status !== 'ACTIVE') throw new AppError(422,'MEMBER_INACTIVE','Anggota tidak aktif dan tidak dapat meminjam.');

    let copiesQ;
    if (Array.isArray(barcodes) && barcodes.length) {
      const uniqueBarcodes=[...new Set(barcodes.map(String))];
      if(uniqueBarcodes.length!==barcodes.length) throw new AppError(422,'DUPLICATE_COPY','Barcode yang sama tidak boleh dimasukkan dua kali.');
      copiesQ=await db.query(`SELECT * FROM book_copy WHERE barcode = ANY($1::text[]) FOR UPDATE`,[uniqueBarcodes]);
      if(copiesQ.rows.length!==uniqueBarcodes.length) throw new AppError(404,'COPY_NOT_FOUND','Salah satu barcode eksemplar tidak ditemukan.');
    } else {
      const uniqueCopyIds=[...new Set(copyIds)];
      if(uniqueCopyIds.length!==copyIds.length) throw new AppError(422,'DUPLICATE_COPY','Copy yang sama tidak boleh dimasukkan dua kali.');
      copiesQ=await db.query(`SELECT * FROM book_copy WHERE copy_id = ANY($1::uuid[]) FOR UPDATE`,[uniqueCopyIds]);
      if(copiesQ.rows.length!==uniqueCopyIds.length) throw new AppError(404,'COPY_NOT_FOUND','Salah satu eksemplar tidak ditemukan.');
    }
    const selectedCopies=copiesQ.rows;
    const selectedCopyIds=selectedCopies.map(c=>c.copy_id);

    const activeQ = await db.query(`SELECT COUNT(*)::int total FROM loan_item li JOIN individual_loan l ON l.loan_id=li.loan_id WHERE l.member_id=$1 AND li.returned_at IS NULL`,[member.member_id]);
    if (activeQ.rows[0].total + selectedCopyIds.length > 2) throw new AppError(422,'LOAN_LIMIT_REACHED','Maksimal dua eksemplar aktif per anggota.');
    const invalid = selectedCopies.find(c => c.status !== 'AVAILABLE');
    if (invalid) throw new AppError(409,'COPY_NOT_AVAILABLE',`Eksemplar ${invalid.barcode} tidak tersedia.`);

    const loanDate = serviceDate();
    const dueDate = await calculateNthWorkingDay(db,loanDate,14,true);
    const loanQ = await db.query(`INSERT INTO individual_loan(member_id,loan_date,due_date,created_by) VALUES($1,$2,$3,$4) RETURNING *`,[member.member_id,loanDate,dueDate,req.user.sub]);
    for (const copy of selectedCopies) {
      await db.query(`INSERT INTO loan_item(loan_id,copy_id) VALUES($1,$2)`,[loanQ.rows[0].loan_id,copy.copy_id]);
      await db.query(`UPDATE book_copy SET status='BORROWED',updated_at=now() WHERE copy_id=$1`,[copy.copy_id]);
    }
    await db.query(`INSERT INTO notification(member_id,event_type,reference_type,reference_id,title,message,status,sent_at) VALUES($1,'LOAN_CREATED','INDIVIDUAL_LOAN',$2,'Peminjaman berhasil',$3,'SENT',now())`,[member.member_id,loanQ.rows[0].loan_id,`Peminjaman tercatat. Jatuh tempo ${dueDate}.`]);
    await writeAudit(db,{actorId:req.user.sub,action:'INDIVIDUAL_LOAN_CREATED',objectType:'INDIVIDUAL_LOAN',objectId:loanQ.rows[0].loan_id,newValue:{memberId:member.member_id,copyIds:selectedCopyIds,barcodes:selectedCopies.map(c=>c.barcode),dueDate}});
    return { ...loanQ.rows[0], member: { memberId:member.member_id, institutionalId:member.institutional_id, fullName:member.full_name }, copies:selectedCopies.map(c=>({copyId:c.copy_id,barcode:c.barcode})) };
  });
  ok(res,loan,'Peminjaman berhasil.',201);
}));

router.post('/staff/returns', requireRoles('BOOK_STAFF'), asyncHandler(async (req,res) => {
  const { institutionalId, barcode, condition='GOOD' } = req.body || {};
  if (!institutionalId || !barcode) throw new AppError(400,'INVALID_INPUT','Institutional ID dan barcode wajib diisi.');

  const result = await withTransaction(async (db) => {
    const q = await db.query(
      `SELECT li.loan_item_id,li.copy_id,l.*,m.member_id,m.full_name,c.barcode,b.title
         FROM loan_item li
         JOIN individual_loan l ON l.loan_id=li.loan_id
         JOIN library_member m ON m.member_id=l.member_id
         JOIN book_copy c ON c.copy_id=li.copy_id
         JOIN book_title b ON b.book_id=c.book_id
        WHERE m.institutional_id=$1 AND c.barcode=$2 AND li.returned_at IS NULL
        FOR UPDATE OF li,l,c`,[institutionalId,barcode]
    );
    const item=q.rows[0];
    if(!item) throw new AppError(404,'ACTIVE_LOAN_ITEM_NOT_FOUND','Loan item aktif tidak ditemukan.');

    const today = serviceDate();
    const overdue = await countOverdueWorkdays(db,item.due_date,today);
    await db.query(`UPDATE loan_item SET returned_at=now(),return_condition=$2,returned_by=$3 WHERE loan_item_id=$1`,[item.loan_item_id,condition,req.user.sub]);
    await db.query(`UPDATE book_copy SET status=$2,condition=$3,updated_at=now() WHERE copy_id=$1`,[item.copy_id,condition==='DAMAGED'?'DAMAGED':'AVAILABLE',condition==='DAMAGED'?'DAMAGED':condition]);

    const remainQ = await db.query(`SELECT COUNT(*)::int total FROM loan_item WHERE loan_id=$1 AND returned_at IS NULL`,[item.loan_id]);
    if(remainQ.rows[0].total===0) await db.query(`UPDATE individual_loan SET transaction_status='DIKEMBALIKAN',updated_at=now() WHERE loan_id=$1`,[item.loan_id]);

    let fine=null;
    if(overdue>0){
      const fineQ=await db.query(`INSERT INTO fine(source_type,source_id,member_id,overdue_workdays,amount,status) VALUES('INDIVIDUAL_LOAN',$1,$2,$3,$4,'UNPAID') ON CONFLICT(source_type,source_id) DO UPDATE SET overdue_workdays=EXCLUDED.overdue_workdays,amount=EXCLUDED.amount RETURNING *`,[item.loan_item_id,item.member_id,overdue,overdue*1000]);
      fine=fineQ.rows[0];
    }
    await writeAudit(db,{actorId:req.user.sub,action:'INDIVIDUAL_RETURN_PROCESSED',objectType:'LOAN_ITEM',objectId:item.loan_item_id,newValue:{condition,overdueWorkdays:overdue,fineAmount:fine?Number(fine.amount):0}});
    return { item:{loanItemId:item.loan_item_id,barcode:item.barcode,title:item.title}, overdueWorkdays:overdue, fine };
  });
  ok(res,result,'Pengembalian berhasil diproses.');
}));

router.post('/loans/:loanId/extensions', asyncHandler(async (req,res) => {
  const result=await withTransaction(async(db)=>{
    const loanQ=await db.query(`SELECT * FROM individual_loan WHERE loan_id=$1 AND member_id=$2 FOR UPDATE`,[req.params.loanId,req.user.sub]);
    const loan=loanQ.rows[0];
    if(!loan) throw new AppError(404,'LOAN_NOT_FOUND','Pinjaman tidak ditemukan.');
    if(['DIKEMBALIKAN','HILANG_RUSAK'].includes(loan.transaction_status)) throw new AppError(422,'LOAN_NOT_ACTIVE','Pinjaman tidak aktif.');
    const approvedQ=await db.query(`SELECT COUNT(*)::int total FROM loan_extension WHERE loan_id=$1 AND status='APPROVED'`,[loan.loan_id]);
    if(approvedQ.rows[0].total>=1) throw new AppError(422,'EXTENSION_LIMIT_REACHED','Pinjaman sudah pernah diperpanjang.');
    const today=serviceDate();
    if(today>String(loan.due_date).slice(0,10)) throw new AppError(422,'LOAN_ALREADY_OVERDUE','Pinjaman yang sudah overdue tidak dapat diperpanjang.');
    const existing=await db.query(`SELECT * FROM loan_extension WHERE loan_id=$1 AND status='REQUESTED'`,[loan.loan_id]);
    if(existing.rows[0]) throw new AppError(409,'EXTENSION_ALREADY_REQUESTED','Permintaan perpanjangan sudah ada.');
    const extQ=await db.query(`INSERT INTO loan_extension(loan_id) VALUES($1) RETURNING *`,[loan.loan_id]);
    await writeAudit(db,{actorId:req.user.sub,action:'LOAN_EXTENSION_REQUESTED',objectType:'LOAN_EXTENSION',objectId:extQ.rows[0].extension_id,newValue:extQ.rows[0]});
    return extQ.rows[0];
  });
  ok(res,result,'Permintaan perpanjangan dikirim.',201);
}));

router.get('/staff/extensions', requireRoles('BOOK_STAFF'), asyncHandler(async(req,res)=>{
  const {rows}=await pool.query(`SELECT e.*,m.full_name,m.institutional_id,l.due_date,b.title,c.barcode FROM loan_extension e JOIN individual_loan l ON l.loan_id=e.loan_id JOIN library_member m ON m.member_id=l.member_id JOIN loan_item li ON li.loan_id=l.loan_id JOIN book_copy c ON c.copy_id=li.copy_id JOIN book_title b ON b.book_id=c.book_id WHERE e.status='REQUESTED' ORDER BY e.requested_at`);
  ok(res,rows);
}));

router.post('/staff/extensions/:extensionId/approve', requireRoles('BOOK_STAFF'), asyncHandler(async(req,res)=>{
  const result=await withTransaction(async(db)=>{
    const q=await db.query(`SELECT e.*,l.due_date,l.loan_id,l.transaction_status FROM loan_extension e JOIN individual_loan l ON l.loan_id=e.loan_id WHERE e.extension_id=$1 FOR UPDATE`,[req.params.extensionId]);
    const ext=q.rows[0];
    if(!ext) throw new AppError(404,'EXTENSION_NOT_FOUND','Permintaan perpanjangan tidak ditemukan.');
    if(ext.status!=='REQUESTED') throw new AppError(409,'INVALID_EXTENSION_STATUS','Permintaan sudah diproses.');
    const today=serviceDate();
    if(today>String(ext.due_date).slice(0,10)) throw new AppError(422,'LOAN_ALREADY_OVERDUE','Pinjaman sudah overdue.');
    const newDue=await calculateNthWorkingDay(db,String(ext.due_date).slice(0,10),14,false);
    const u=await db.query(`UPDATE loan_extension SET status='APPROVED',approved_by=$2,approved_at=now(),new_due_date=$3 WHERE extension_id=$1 RETURNING *`,[ext.extension_id,req.user.sub,newDue]);
    await db.query(`UPDATE individual_loan SET due_date=$2,period_status='PERPANJANGAN',updated_at=now() WHERE loan_id=$1`,[ext.loan_id,newDue]);
    await writeAudit(db,{actorId:req.user.sub,action:'LOAN_EXTENSION_APPROVED',objectType:'LOAN_EXTENSION',objectId:ext.extension_id,newValue:{newDueDate:newDue}});
    return u.rows[0];
  });
  ok(res,result,'Perpanjangan disetujui.');
}));

router.post('/staff/extensions/:extensionId/reject', requireRoles('BOOK_STAFF'), asyncHandler(async(req,res)=>{
  const {note=null}=req.body||{};
  const {rows}=await pool.query(`UPDATE loan_extension SET status='REJECTED',approved_by=$2,approved_at=now(),note=$3 WHERE extension_id=$1 AND status='REQUESTED' RETURNING *`,[req.params.extensionId,req.user.sub,note]);
  if(!rows[0]) throw new AppError(404,'EXTENSION_NOT_FOUND','Permintaan tidak ditemukan atau sudah diproses.');
  await writeAudit(pool,{actorId:req.user.sub,action:'LOAN_EXTENSION_REJECTED',objectType:'LOAN_EXTENSION',objectId:rows[0].extension_id,newValue:{note}});
  ok(res,rows[0],'Perpanjangan ditolak.');
}));

module.exports=router;
