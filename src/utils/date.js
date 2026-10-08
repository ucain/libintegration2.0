const SERVICE_TIME_ZONE = 'Asia/Jakarta';
const SERVICE_OFFSET = '+07:00';

function partsInServiceZone(value = new Date()) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) throw new Error('Invalid date value');
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: SERVICE_TIME_ZONE,
    year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', second:'2-digit',
    hourCycle:'h23'
  }).formatToParts(d).reduce((acc,p)=>{ if(p.type!=='literal') acc[p.type]=p.value; return acc; },{});
  return parts;
}

function serviceDate(value = new Date()) {
  const p = partsInServiceZone(value);
  return `${p.year}-${p.month}-${p.day}`;
}

function toISODate(value) {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return serviceDate(value);
}

function normalizeServiceDateTime(value) {
  if (!value) return null;
  const raw = String(value).trim();
  let parsed;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?$/.test(raw)) {
    parsed = new Date(`${raw}${SERVICE_OFFSET}`);
  } else {
    parsed = new Date(raw);
  }
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function addCalendarDays(dateValue, days) {
  const [y,m,d] = toISODate(dateValue).split('-').map(Number);
  const date = new Date(Date.UTC(y,m-1,d));
  date.setUTCDate(date.getUTCDate() + Number(days));
  return date.toISOString().slice(0,10);
}

function minutesBetween(start, end) {
  const s = normalizeServiceDateTime(start);
  const e = normalizeServiceDateTime(end);
  if (!s || !e) return NaN;
  return Math.round((new Date(e).getTime() - new Date(s).getTime()) / 60000);
}

function dateDiffDays(a, b) {
  const [ay,am,ad]=a.split('-').map(Number);
  const [by,bm,bd]=b.split('-').map(Number);
  return Math.round((Date.UTC(by,bm-1,bd)-Date.UTC(ay,am-1,ad))/86400000);
}

function roomBookingDateAllowed(nowValue, startValue) {
  const nowDate = serviceDate(nowValue);
  const normalizedStart = normalizeServiceDateTime(startValue);
  if (!normalizedStart) return false;
  const targetDate = serviceDate(normalizedStart);
  const diffDays = dateDiffDays(nowDate,targetDate);
  return diffDays >= 0 && diffDays <= 1;
}

function serviceMinutesOfDay(value) {
  const normalized = normalizeServiceDateTime(value);
  if (!normalized) return NaN;
  const p = partsInServiceZone(normalized);
  return Number(p.hour)*60 + Number(p.minute);
}

function sameServiceDate(a,b) {
  const na=normalizeServiceDateTime(a), nb=normalizeServiceDateTime(b);
  if(!na||!nb) return false;
  return serviceDate(na)===serviceDate(nb);
}

module.exports = {
  SERVICE_TIME_ZONE, SERVICE_OFFSET, serviceDate, toISODate, normalizeServiceDateTime,
  addCalendarDays, minutesBetween, roomBookingDateAllowed, serviceMinutesOfDay, sameServiceDate
};
