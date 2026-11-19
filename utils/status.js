// PAMR — live flight status
//
// Replaces the SQL `CASE ... CURTIME()` expressions and the
// `auto_update_flight_status` MySQL EVENT from the old schema. Rather than a
// scheduled job writing rows every minute, the status is derived on read, so
// the stored `stat` always keeps the manual/authoritative value.

// Statuses an operator sets by hand — never auto-overridden.
const MANUAL = ['Cancelled', 'Delayed', 'Estimated'];

// Minutes before the scheduled time that a flight starts boarding / arriving.
const WINDOW = 30;

/** Current wall-clock minutes-since-midnight in Pakistan Standard Time (UTC+5). */
function nowMinutesPKT(date = new Date()) {
  const pkt = new Date(date.getTime() + 5 * 60 * 60 * 1000);
  return pkt.getUTCHours() * 60 + pkt.getUTCMinutes() + pkt.getUTCSeconds() / 60;
}

/** "HH:MM:SS" -> minutes since midnight. */
function timeToMinutes(timesStr) {
  const [h = 0, m = 0, s = 0] = String(timesStr || '00:00:00').split(':').map(Number);
  return h * 60 + m + s / 60;
}

function liveStatus(stat, timesStr, kind, now = new Date()) {
  if (MANUAL.includes(stat)) return stat;

  const diff = timeToMinutes(timesStr) - nowMinutesPKT(now);

  if (diff <= 0)      return kind === 'dep' ? 'Departed' : 'Landed';
  if (diff <= WINDOW) return kind === 'dep' ? 'Boarding' : 'Arriving';
  return 'Scheduled';
}

const calcDepStatus = (stat, times, now) => liveStatus(stat, times, 'dep', now);
const calcArrStatus = (stat, times, now) => liveStatus(stat, times, 'arr', now);

/** Attach `live_status` to a plain document. */
function withLiveStatus(doc, kind, now = new Date()) {
  return { ...doc, live_status: liveStatus(doc.stat, doc.times, kind, now) };
}

module.exports = {
  MANUAL, WINDOW, liveStatus, calcDepStatus, calcArrStatus,
  withLiveStatus, timeToMinutes, nowMinutesPKT,
};
