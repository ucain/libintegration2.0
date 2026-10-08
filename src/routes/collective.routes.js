const express = require('express');
const { pool, withTransaction } = require('../config/db');
const { authenticate, requireRoles } = require('../middleware/auth');
const { AppError, ok, asyncHandler } = require('../utils/http');
const { calculateNthWorkingDay, countOverdueWorkdays } = require('../utils/businessRules');
const { writeAudit } = require('../utils/audit');
const { serviceDate } = require('../utils/date');

const router = express.Router();
router.use(authenticate);
router.use(requireRoles('BOOK_STAFF'));

router.get('/classes', asyncHandler(async(req,res)=>{
  const {rows}=await pool.query(
    `SELECT cm.class_id,cm.class_name,cm.program,cm.concentration,ap.academic_year,ap.semester,ap.uas_regular_end_date,
            COUNT(cmem.member_id)::int AS member_count
       FROM class_master cm
       JOIN academic_period ap ON ap.period_id=cm.period_id
       LEFT JOIN class_member cmem ON cmem.class_id=cm.class_id
      GROUP BY cm.class_id,ap.period_id
      ORDER BY ap.academic_year DESC,cm.class_name`
  );
  ok(res,rows);
}));

router.get('/classes/:classId/eligibility', asyncHandler(async(req,res)=>{
  const {rows}=await pool.query(
    `SELECT m.member_id,m.institutional_id,m.full_name,m.member_status,m.collective_eligibility
       FROM class_member cm JOIN library_member m ON m.member_id=cm.member_id
      WHERE cm.class_id=$1 ORDER BY m.full_name`,[req.params.classId]
  );
  ok(res,rows);
}));

router.post('/loans', asyncHandler(async(req,res)=>{
  const {classId,assignments}=req.body||{};
  if(!classId || !Array.isArray(assignments) || assignments.length===0) throw new AppError(400,'INVALID_INPUT','classId dan assignments wajib diisi.');
  const result=await withTransaction(async(db)=>{
    const classQ=await db.query(`SELECT cm.*,ap.uas_regular_end_date FROM class_master cm JOIN academic_period ap ON ap.period_id=cm.period_id WHERE cm.class_id=$1 FOR UPDATE OF cm`,[classId]);
    const klass=classQ.rows[0];
    if(!klass) throw new AppError(404,'CLASS_NOT_FOUND','Kelas tidak ditemukan.');

    const memberIds=[...new Set(assignments.map(a=>a.memberId))];
    const copyIds=[...new Set(assignments.map(a=>a.copyId))];
    if(memberIds.length!==assignments.length) throw new AppError(422,'DUPLICATE_MEMBER_ASSIGNMENT','Satu mahasiswa hanya boleh menerima satu copy pada transaksi ini.');
    if(copyIds.length!==assignments.length) throw new AppError(422,'DUPLICATE_COPY_ASSIGNMENT','Satu copy hanya boleh ditetapkan satu kali.');

    const membersQ=await db.query(`SELECT m.member_id,m.full_name,m.collective_eligibility,m.member_status FROM library_member m JOIN class_member cm ON cm.member_id=m.member_id WHERE cm.class_id=$1 AND m.member_id=ANY($2::uuid[])`,[classId,memberIds]);
    if(membersQ.rows.length!==memberIds.length) throw new AppError(422,'MEMBER_NOT_IN_CLASS','Salah satu mahasiswa bukan anggota snapshot kelas tersebut.');
    const blocked=membersQ.rows.filter(m=>m.collective_eligibility==='BLOCKED' || m.member_status!=='ACTIVE');
    if(blocked.length) throw new AppError(422,'MEMBER_COLLECTIVE_BLOCKED','Terdapat mahasiswa yang tidak eligible. Hanya mahasiswa tersebut yang diblokir; kelas tidak diblokir.',blocked.map(b=>({memberId:b.member_id,fullName:b.full_name,eligibility:b.collective_eligibility,status:b.member_status})));

    const copiesQ=await db.query(`SELECT * FROM book_copy WHERE copy_id=ANY($1::uuid[]) FOR UPDATE`,[copyIds]);
    if(copiesQ.rows.length!==copyIds.length) throw new AppError(404,'COPY_NOT_FOUND','Salah satu copy tidak ditemukan.');
    const unavailable=copiesQ.rows.filter(c=>c.status!=='AVAILABLE');
    if(unavailable.length) throw new AppError(409,'COPY_NOT_AVAILABLE','Terdapat copy yang tidak tersedia.',unavailable.map(c=>({copyId:c.copy_id,barcode:c.barcode,status:c.status})));

    const loanDate=serviceDate();
    const dueDate=await calculateNthWorkingDay(db,String(klass.uas_regular_end_date).slice(0,10),14,false);
    const loanQ=await db.query(`INSERT INTO collective_loan(class_id,expected_book_count,loan_date,due_date,created_by) VALUES($1,$2,$3,$4,$5) RETURNING *`,[classId,assignments.length,loanDate,dueDate,req.user.sub]);
    for(const a of assignments){
      await db.query(`INSERT INTO collective_loan_item(collective_loan_id,member_id,copy_id) VALUES($1,$2,$3)`,[loanQ.rows[0].collective_loan_id,a.memberId,a.copyId]);
      await db.query(`UPDATE book_copy SET status='BORROWED',updated_at=now() WHERE copy_id=$1`,[a.copyId]);
    }
    await writeAudit(db,{actorId:req.user.sub,action:'COLLECTIVE_LOAN_CREATED',objectType:'COLLECTIVE_LOAN',objectId:loanQ.rows[0].collective_loan_id,newValue:{classId,expectedBookCount:assignments.length,dueDate}});
    return loanQ.rows[0];
  });
  ok(res,result,'Peminjaman kolektif berhasil dibuat.',201);
}));

router.get('/loans/:collectiveLoanId', asyncHandler(async(req,res)=>{
  const loanQ=await pool.query(
    `SELECT cl.*,cm.class_name,cm.program,
            COUNT(cli.collective_item_id)::int AS expected_items,
            COUNT(cli.collective_item_id) FILTER(WHERE cli.item_status='RETURNED')::int AS returned_items
       FROM collective_loan cl JOIN class_master cm ON cm.class_id=cl.class_id LEFT JOIN collective_loan_item cli ON cli.collective_loan_id=cl.collective_loan_id
      WHERE cl.collective_loan_id=$1 GROUP BY cl.collective_loan_id,cm.class_id`,[req.params.collectiveLoanId]
  );
  if(!loanQ.rows[0]) throw new AppError(404,'COLLECTIVE_LOAN_NOT_FOUND','Transaksi kolektif tidak ditemukan.');
  const itemsQ=await pool.query(
    `SELECT cli.*,m.institutional_id,m.full_name,c.barcode,b.title FROM collective_loan_item cli JOIN library_member m ON m.member_id=cli.member_id JOIN book_copy c ON c.copy_id=cli.copy_id JOIN book_title b ON b.book_id=c.book_id WHERE cli.collective_loan_id=$1 ORDER BY m.full_name`,[req.params.collectiveLoanId]
  );
  const missing=itemsQ.rows.filter(i=>i.item_status!=='RETURNED');
  ok(res,{...loanQ.rows[0],items:itemsQ.rows,missing});
}));

router.post('/loans/:collectiveLoanId/scan-return', asyncHandler(async(req,res)=>{
  const {barcode}=req.body||{};
  if(!barcode) throw new AppError(400,'BARCODE_REQUIRED','Barcode wajib diisi.');
  const result=await withTransaction(async(db)=>{
    const q=await db.query(
      `SELECT cli.*,c.barcode,c.status,b.title,m.full_name FROM collective_loan_item cli JOIN book_copy c ON c.copy_id=cli.copy_id JOIN book_title b ON b.book_id=c.book_id JOIN library_member m ON m.member_id=cli.member_id WHERE cli.collective_loan_id=$1 AND c.barcode=$2 FOR UPDATE OF cli,c`,
      [req.params.collectiveLoanId,barcode]
    );
    const item=q.rows[0];
    if(!item) throw new AppError(404,'COLLECTIVE_ITEM_NOT_FOUND','Copy tidak terdaftar pada transaksi kolektif ini.');
    if(item.item_status==='RETURNED') throw new AppError(409,'COPY_ALREADY_RETURNED','Copy sudah tercatat kembali.');
    await db.query(`UPDATE collective_loan_item SET item_status='RETURNED' WHERE collective_item_id=$1`,[item.collective_item_id]);
    await db.query(`UPDATE book_copy SET status='AVAILABLE',updated_at=now() WHERE copy_id=$1`,[item.copy_id]);
    const outstanding=await db.query(`SELECT 1 FROM collective_loan_item cli JOIN collective_loan cl ON cl.collective_loan_id=cli.collective_loan_id WHERE cli.member_id=$1 AND cli.item_status<>'RETURNED' AND cl.status IN ('DUE','OVERDUE') LIMIT 1`,[item.member_id]);
    if(!outstanding.rows[0]) await db.query(`UPDATE library_member SET collective_eligibility='ELIGIBLE',updated_at=now() WHERE member_id=$1 AND collective_eligibility='BLOCKED'`,[item.member_id]);
    const countQ=await db.query(`SELECT COUNT(*)::int expected,COUNT(*) FILTER(WHERE item_status='RETURNED')::int returned FROM collective_loan_item WHERE collective_loan_id=$1`,[req.params.collectiveLoanId]);
    await writeAudit(db,{actorId:req.user.sub,action:'COLLECTIVE_COPY_RETURN_SCANNED',objectType:'COLLECTIVE_LOAN_ITEM',objectId:item.collective_item_id,newValue:{barcode}});
    return {item:{barcode:item.barcode,title:item.title,memberName:item.full_name},...countQ.rows[0],completeReady:countQ.rows[0].expected===countQ.rows[0].returned};
  });
  ok(res,result,'Copy berhasil ditandai terkumpul.');
}));

router.post('/loans/:collectiveLoanId/complete-return', asyncHandler(async(req,res)=>{
  const result=await withTransaction(async(db)=>{
    const loanQ=await db.query(`SELECT * FROM collective_loan WHERE collective_loan_id=$1 FOR UPDATE`,[req.params.collectiveLoanId]);
    const loan=loanQ.rows[0];
    if(!loan) throw new AppError(404,'COLLECTIVE_LOAN_NOT_FOUND','Transaksi kolektif tidak ditemukan.');
    if(loan.status==='COMPLETED') throw new AppError(409,'COLLECTIVE_ALREADY_COMPLETED','Transaksi sudah selesai.');
    const countQ=await db.query(`SELECT COUNT(*)::int expected,COUNT(*) FILTER(WHERE item_status='RETURNED')::int returned FROM collective_loan_item WHERE collective_loan_id=$1`,[loan.collective_loan_id]);
    if(countQ.rows[0].expected!==loan.expected_book_count || countQ.rows[0].returned!==loan.expected_book_count) {
      throw new AppError(422,'COLLECTIVE_RETURN_INCOMPLETE','Pengembalian kolektif tidak dapat diselesaikan sebelum seluruh copy terkumpul.',countQ.rows[0]);
    }
    const today=serviceDate();
    const overdue=await countOverdueWorkdays(db,loan.due_date,today);
    const totalFine=loan.expected_book_count*overdue*1000;
    const retQ=await db.query(`INSERT INTO collective_return(collective_loan_id,completed_at,overdue_workdays,fine_per_copy,total_fine,verified_by) VALUES($1,now(),$2,1000,$3,$4) RETURNING *`,[loan.collective_loan_id,overdue,totalFine,req.user.sub]);
    await db.query(`UPDATE collective_loan SET status='COMPLETED',completed_at=now() WHERE collective_loan_id=$1`,[loan.collective_loan_id]);
    if(totalFine>0){
      await db.query(`INSERT INTO fine(source_type,source_id,overdue_workdays,amount,status) VALUES('COLLECTIVE_LOAN',$1,$2,$3,'UNPAID') ON CONFLICT(source_type,source_id) DO UPDATE SET overdue_workdays=EXCLUDED.overdue_workdays,amount=EXCLUDED.amount`,[loan.collective_loan_id,overdue,totalFine]);
    }
    await writeAudit(db,{actorId:req.user.sub,action:'COLLECTIVE_RETURN_COMPLETED',objectType:'COLLECTIVE_LOAN',objectId:loan.collective_loan_id,newValue:{completedAt:retQ.rows[0].completed_at,overdueWorkdays:overdue,totalFine}});
    return retQ.rows[0];
  });
  ok(res,result,'Pengembalian kolektif selesai.');
}));

module.exports=router;
