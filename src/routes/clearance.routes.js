const express=require('express');
const {pool,withTransaction}=require('../config/db');
const {authenticate,requireRoles}=require('../middleware/auth');
const {AppError,ok,asyncHandler}=require('../utils/http');
const {writeAudit}=require('../utils/audit');

const router=express.Router();
router.use(authenticate);

router.post('/staff/clearance/recalculate',requireRoles('BOOK_STAFF','LIBRARY_ADMIN'),asyncHandler(async(req,res)=>{
  const {institutionalId,periodId}=req.body||{};
  if(!institutionalId||!periodId) throw new AppError(400,'INVALID_INPUT','institutionalId dan periodId wajib diisi.');
  const result=await withTransaction(async(db)=>{
    const mq=await db.query(`SELECT * FROM library_member WHERE institutional_id=$1`,[institutionalId]);
    const member=mq.rows[0];
    if(!member) throw new AppError(404,'MEMBER_NOT_FOUND','Anggota tidak ditemukan.');
    const [loanQ,incidentQ,fineQ,collectiveQ]=await Promise.all([
      db.query(`SELECT COUNT(*)::int total FROM loan_item li JOIN individual_loan l ON l.loan_id=li.loan_id WHERE l.member_id=$1 AND li.returned_at IS NULL`,[member.member_id]),
      db.query(`SELECT COUNT(*)::int total FROM book_incident WHERE member_id=$1 AND status='OPEN'`,[member.member_id]),
      db.query(`SELECT COUNT(*)::int total FROM fine WHERE member_id=$1 AND status NOT IN ('VERIFIED','WAIVED')`,[member.member_id]),
      db.query(`SELECT COUNT(*)::int total FROM collective_loan_item cli JOIN collective_loan cl ON cl.collective_loan_id=cli.collective_loan_id WHERE cli.member_id=$1 AND cli.item_status<>'RETURNED' AND cl.status<>'COMPLETED'`,[member.member_id])
    ]);
    const obligations={activeIndividualItems:loanQ.rows[0].total,openIncidents:incidentQ.rows[0].total,unsettledFines:fineQ.rows[0].total,activeCollective:collectiveQ.rows[0].total};
    const clear=Object.values(obligations).every(v=>v===0);
    const reason=clear?'Seluruh kewajiban perpustakaan selesai.':`Kewajiban aktif: ${JSON.stringify(obligations)}`;
    const q=await db.query(`INSERT INTO library_clearance(member_id,period_id,status,reason,verified_at) VALUES($1,$2,$3,$4,now()) ON CONFLICT(member_id,period_id) DO UPDATE SET status=EXCLUDED.status,reason=EXCLUDED.reason,verified_at=now() RETURNING *`,[member.member_id,periodId,clear?'CLEAR':'NOT_CLEAR',reason]);
    await writeAudit(db,{actorId:req.user.sub,action:'LIBRARY_CLEARANCE_RECALCULATED',objectType:'LIBRARY_CLEARANCE',objectId:q.rows[0].clearance_id,newValue:{status:q.rows[0].status,obligations}});
    return {...q.rows[0],obligations};
  });
  ok(res,result,'Status library clearance dihitung ulang.');
}));

module.exports=router;
