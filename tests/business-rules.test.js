const test=require('node:test');
const assert=require('node:assert/strict');
const {addCalendarDays,minutesBetween,roomBookingDateAllowed,serviceDate,normalizeServiceDateTime}=require('../src/utils/date');
const {validateRoomInput}=require('../src/utils/businessRules');

function expectCode(fn,code){
  assert.throws(fn,(err)=>err && err.code===code);
}

test('booking expiry uses three calendar days',()=>{
  assert.equal(addCalendarDays('2026-10-07',3),'2026-10-10');
});

test('service date uses Asia/Jakarta timezone',()=>{
  assert.equal(serviceDate('2026-10-07T17:30:00Z'),'2026-10-08');
});

test('naive service datetime is interpreted as WIB',()=>{
  assert.equal(normalizeServiceDateTime('2026-10-08T09:00'),'2026-10-08T02:00:00.000Z');
});

test('room duration is computed in minutes',()=>{
  assert.equal(minutesBetween('2026-10-08T09:00','2026-10-08T11:00'),120);
});

test('room booking allows today or at most one day ahead in service timezone',()=>{
  assert.equal(roomBookingDateAllowed('2026-10-07T02:00:00Z','2026-10-08T10:00'),true);
  assert.equal(roomBookingDateAllowed('2026-10-07T02:00:00Z','2026-10-09T10:00'),false);
});

test('room requires minimum 3 participants',()=>{
  expectCode(()=>validateRoomInput({now:'2026-10-07T02:00:00Z',startAt:'2026-10-08T09:00',endAt:'2026-10-08T10:00',participantCount:2,capacity:7}),'MIN_PARTICIPANTS');
});

test('room maximum duration is 120 minutes',()=>{
  expectCode(()=>validateRoomInput({now:'2026-10-07T02:00:00Z',startAt:'2026-10-08T09:00',endAt:'2026-10-08T12:00',participantCount:3,capacity:7}),'DURATION_EXCEEDED');
});

test('room blackout 12:00-13:00 WIB blocks overlaps',()=>{
  expectCode(()=>validateRoomInput({now:'2026-10-07T02:00:00Z',startAt:'2026-10-08T12:30',endAt:'2026-10-08T13:30',participantCount:3,capacity:7}),'BLACKOUT_PERIOD');
});

test('room cannot cross service date',()=>{
  expectCode(()=>validateRoomInput({now:'2026-10-07T02:00:00Z',startAt:'2026-10-08T23:30',endAt:'2026-10-09T00:30',participantCount:3,capacity:7}),'ROOM_CROSS_DATE_NOT_ALLOWED');
});
