const { AppError } = require('./http');
const { minutesBetween, roomBookingDateAllowed, serviceMinutesOfDay, sameServiceDate } = require('./date');

async function calculateNthWorkingDay(db, startDate, n, includeStart = true) {
  const { rows } = await db.query(
    `SELECT calendar_date, is_working_day
       FROM working_calendar
      WHERE calendar_date >= $1::date
      ORDER BY calendar_date ASC
      LIMIT 800`,
    [startDate]
  );

  let count = 0;
  for (const row of rows) {
    const rowDate = row.calendar_date instanceof Date ? row.calendar_date.toISOString().slice(0,10) : String(row.calendar_date).slice(0,10);
    const isStart = rowDate === String(startDate).slice(0, 10);
    if (!includeStart && isStart) continue;
    if (row.is_working_day) {
      count += 1;
      if (count === n) return rowDate;
    }
  }
  throw new AppError(500, 'WORKING_CALENDAR_INCOMPLETE', 'Working calendar tidak mencakup rentang yang dibutuhkan.');
}

async function countOverdueWorkdays(db, dueDate, completedDate) {
  const { rows } = await db.query(
    `SELECT COUNT(*)::int AS total
       FROM working_calendar
      WHERE calendar_date > $1::date
        AND calendar_date <= $2::date
        AND is_working_day = true`,
    [dueDate, completedDate]
  );
  return rows[0].total;
}

function validateRoomInput({ now, startAt, endAt, participantCount, capacity }) {
  if (!roomBookingDateAllowed(now, startAt)) {
    throw new AppError(422, 'BOOKING_DATE_NOT_ALLOWED', 'Reservasi ruang hanya dapat dibuat untuk hari ini atau paling jauh H-1.');
  }
  if (!sameServiceDate(startAt,endAt)) throw new AppError(422,'ROOM_CROSS_DATE_NOT_ALLOWED','Waktu mulai dan selesai harus pada tanggal yang sama.');
  if (!Number.isInteger(participantCount) || participantCount < 3) throw new AppError(422, 'MIN_PARTICIPANTS', 'Jumlah peserta minimal 3 orang.');
  if (participantCount > capacity) throw new AppError(422, 'ROOM_CAPACITY_EXCEEDED', 'Jumlah peserta melebihi kapasitas ruang.');
  const duration = minutesBetween(startAt, endAt);
  if (!Number.isFinite(duration) || duration <= 0 || duration > 120) throw new AppError(422, 'DURATION_EXCEEDED', 'Durasi reservasi harus lebih dari 0 dan maksimal 2 jam.');

  const startMinute=serviceMinutesOfDay(startAt);
  const endMinute=serviceMinutesOfDay(endAt);
  const blackoutStart=12*60, blackoutEnd=13*60;
  if (startMinute < blackoutEnd && endMinute > blackoutStart) {
    throw new AppError(422, 'BLACKOUT_PERIOD', 'Slot 12.00-13.00 merupakan blackout period.');
  }
}

module.exports = { calculateNthWorkingDay, countOverdueWorkdays, validateRoomInput };
