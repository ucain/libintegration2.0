const express = require('express');
const { pool } = require('../config/db');
const { authenticate } = require('../middleware/auth');
const { ok, asyncHandler } = require('../utils/http');

const router = express.Router();
router.use(authenticate);

router.get('/dashboard', asyncHandler(async (req, res) => {
  const memberId = req.user.sub;
  const [loanCount, reservationCount, fineSum, roomCount, loans, notifications] = await Promise.all([
    pool.query(`SELECT COUNT(li.loan_item_id)::int AS total FROM loan_item li JOIN individual_loan l ON l.loan_id=li.loan_id WHERE l.member_id=$1 AND li.returned_at IS NULL`,[memberId]),
    pool.query(`SELECT COUNT(*)::int AS total FROM book_reservation WHERE member_id=$1 AND status IN ('REQUESTED','READY_FOR_PICKUP')`,[memberId]),
    pool.query(`SELECT COALESCE(SUM(amount),0)::numeric AS total FROM fine WHERE member_id=$1 AND status NOT IN ('VERIFIED','WAIVED')`,[memberId]),
    pool.query(`SELECT COUNT(*)::int AS total FROM room_reservation WHERE member_id=$1 AND status IN ('BOOKED','CHECKED_IN')`,[memberId]),
    pool.query(`SELECT l.loan_id,l.loan_date,l.due_date,l.period_status,l.transaction_status,li.loan_item_id,c.barcode,b.title FROM individual_loan l JOIN loan_item li ON li.loan_id=l.loan_id JOIN book_copy c ON c.copy_id=li.copy_id JOIN book_title b ON b.book_id=c.book_id WHERE l.member_id=$1 AND li.returned_at IS NULL ORDER BY l.due_date`,[memberId]),
    pool.query(`SELECT notification_id,title,message,event_type,scheduled_at,sent_at,read_at,status FROM notification WHERE member_id=$1 ORDER BY scheduled_at DESC LIMIT 5`,[memberId])
  ]);
  ok(res, {
    summary: {
      activeLoans: loanCount.rows[0].total,
      activeBookReservations: reservationCount.rows[0].total,
      outstandingFine: Number(fineSum.rows[0].total),
      activeRoomReservations: roomCount.rows[0].total,
    },
    loans: loans.rows,
    notifications: notifications.rows,
  });
}));

router.get('/loans', asyncHandler(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT l.*,li.loan_item_id,li.returned_at,li.return_condition,c.copy_id,c.barcode,b.book_id,b.title,b.author,
            (SELECT COUNT(*) FROM loan_extension e WHERE e.loan_id=l.loan_id AND e.status='APPROVED')::int AS extension_count
       FROM individual_loan l
       JOIN loan_item li ON li.loan_id=l.loan_id
       JOIN book_copy c ON c.copy_id=li.copy_id
       JOIN book_title b ON b.book_id=c.book_id
      WHERE l.member_id=$1 ORDER BY l.created_at DESC`,
    [req.user.sub]
  );
  ok(res, rows);
}));

router.get('/collective', asyncHandler(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT cl.collective_loan_id,cm.class_name,cl.loan_date,cl.due_date,cl.status,cli.item_status,c.barcode,b.title
       FROM collective_loan_item cli
       JOIN collective_loan cl ON cl.collective_loan_id=cli.collective_loan_id
       JOIN class_master cm ON cm.class_id=cl.class_id
       JOIN book_copy c ON c.copy_id=cli.copy_id
       JOIN book_title b ON b.book_id=c.book_id
      WHERE cli.member_id=$1 ORDER BY cl.loan_date DESC`,
    [req.user.sub]
  );
  ok(res, rows);
}));

router.get('/clearance', asyncHandler(async (req,res) => {
  const { rows } = await pool.query(
    `SELECT lc.*,ap.academic_year,ap.semester FROM library_clearance lc JOIN academic_period ap ON ap.period_id=lc.period_id WHERE lc.member_id=$1 ORDER BY lc.verified_at DESC`,
    [req.user.sub]
  );
  ok(res,rows);
}));

module.exports = router;
