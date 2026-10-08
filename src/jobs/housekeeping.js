const { pool, withTransaction } = require('../config/db');

async function expireBookReservations() {
  let total = 0;
  await withTransaction(async (db) => {
    const expired = await db.query(
      `UPDATE book_reservation
          SET status='EXPIRED'
        WHERE status='READY_FOR_PICKUP'
          AND expires_at IS NOT NULL
          AND expires_at <= now()
        RETURNING reservation_id,copy_id,member_id`
    );
    total = expired.rowCount;
    for (const row of expired.rows) {
      await db.query(`UPDATE book_copy SET status='AVAILABLE',updated_at=now() WHERE copy_id=$1 AND status='RESERVED'`, [row.copy_id]);
      await db.query(
        `INSERT INTO notification(member_id,event_type,reference_type,reference_id,title,message,status,sent_at)
         VALUES($1,'BOOK_RESERVATION_EXPIRED','BOOK_RESERVATION',$2,'Booking buku kedaluwarsa','Batas pengambilan 3 hari kalender telah berakhir.','SENT',now())`,
        [row.member_id,row.reservation_id]
      );
    }
  });
  return total;
}

async function markRoomNoShow() {
  const { rows } = await pool.query(
    `UPDATE room_reservation
        SET status='NO_SHOW'
      WHERE status='BOOKED'
        AND start_at + interval '15 minutes' <= now()
      RETURNING room_reservation_id,member_id`
  );
  for (const row of rows) {
    await pool.query(
      `INSERT INTO notification(member_id,event_type,reference_type,reference_id,title,message,status,sent_at)
       VALUES($1,'ROOM_NO_SHOW','ROOM_RESERVATION',$2,'Reservasi ruang menjadi no-show','Anda belum check-in dalam 15 menit sejak jadwal mulai.','SENT',now())`,
      [row.member_id,row.room_reservation_id]
    );
  }
  return rows.length;
}

async function markOverdueTransactions() {
  const individual = await pool.query(
    `UPDATE individual_loan l
        SET transaction_status='TERLAMBAT',updated_at=now()
      WHERE l.transaction_status='DIPINJAM'
        AND l.due_date < current_date
        AND EXISTS(SELECT 1 FROM loan_item li WHERE li.loan_id=l.loan_id AND li.returned_at IS NULL)`
  );
  const collectiveOverdue = await pool.query(`UPDATE collective_loan SET status='OVERDUE' WHERE status IN ('ACTIVE','DUE') AND due_date < current_date`);
  const collectiveDue = await pool.query(`UPDATE collective_loan SET status='DUE' WHERE status='ACTIVE' AND due_date = current_date`);
  const blocked = await pool.query(`UPDATE library_member m SET collective_eligibility='BLOCKED',updated_at=now() WHERE m.collective_eligibility<>'BLOCKED' AND EXISTS (SELECT 1 FROM collective_loan_item cli JOIN collective_loan cl ON cl.collective_loan_id=cli.collective_loan_id WHERE cli.member_id=m.member_id AND cli.item_status<>'RETURNED' AND cl.status IN ('DUE','OVERDUE'))`);
  const unblocked = await pool.query(`UPDATE library_member m SET collective_eligibility='ELIGIBLE',updated_at=now() WHERE m.collective_eligibility='BLOCKED' AND NOT EXISTS (SELECT 1 FROM collective_loan_item cli JOIN collective_loan cl ON cl.collective_loan_id=cli.collective_loan_id WHERE cli.member_id=m.member_id AND cli.item_status<>'RETURNED' AND cl.status IN ('DUE','OVERDUE'))`);
  return { individual: individual.rowCount, collectiveOverdue: collectiveOverdue.rowCount, collectiveDue: collectiveDue.rowCount, blockedMembers: blocked.rowCount, unblockedMembers: unblocked.rowCount };
}

async function runHousekeeping() {
  const expiredReservations = await expireBookReservations();
  const roomNoShows = await markRoomNoShow();
  const overdue = await markOverdueTransactions();
  return { expiredReservations, roomNoShows, ...overdue };
}

module.exports = { runHousekeeping, expireBookReservations, markRoomNoShow, markOverdueTransactions };
