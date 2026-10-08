const express=require('express');
const {pool}=require('../config/db');
const {authenticate}=require('../middleware/auth');
const {AppError,ok,asyncHandler}=require('../utils/http');

const router=express.Router();
router.use(authenticate);

router.get('/notifications',asyncHandler(async(req,res)=>{
  const {rows}=await pool.query(`SELECT * FROM notification WHERE member_id=$1 ORDER BY scheduled_at DESC LIMIT 100`,[req.user.sub]);
  ok(res,rows);
}));

router.post('/notifications/:id/read',asyncHandler(async(req,res)=>{
  const {rows}=await pool.query(`UPDATE notification SET read_at=COALESCE(read_at,now()) WHERE notification_id=$1 AND member_id=$2 RETURNING *`,[req.params.id,req.user.sub]);
  if(!rows[0]) throw new AppError(404,'NOTIFICATION_NOT_FOUND','Notifikasi tidak ditemukan.');
  ok(res,rows[0],'Notifikasi ditandai sudah dibaca.');
}));

module.exports=router;
