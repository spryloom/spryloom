/**
 * When the emails go out, read from spryloom.yaml.
 *
 * Spryloom runs the jobs from that file, so the week page reads it too rather
 * than repeating the times: change the schedule there and the page follows.
 * Only the simple shapes a person writes are put into words ("0 15 * * 5" is
 * "Friday, 3 pm"); anything else falls back to a plain label.
 */
import { readFileSync } from 'node:fs';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** Each job's schedule and timezone, by name, from the manifest's `jobs:` list. */
export function jobSchedules(yaml) {
  const jobs = new Map();
  let inJobs = false;
  let current;
  for (const line of String(yaml).split('\n')) {
    if (/^\S/.test(line)) { inJobs = /^jobs:\s*$/.test(line); current = undefined; continue; }
    if (!inJobs) continue;
    const name = line.match(/^\s*-\s*name:\s*["']?([^"'#]+?)["']?\s*(#.*)?$/);
    if (name) { current = { schedule: undefined, timezone: undefined }; jobs.set(name[1], current); continue; }
    const field = line.match(/^\s+(schedule|timezone):\s*["']?([^"'#]+?)["']?\s*(#.*)?$/);
    if (field && current) current[field[1]] = field[2];
  }
  return jobs;
}

const clock = (hour, minute) => {
  const h = hour % 12 === 0 ? 12 : hour % 12;
  return `${h}${minute ? `:${String(minute).padStart(2, '0')}` : ''} ${hour < 12 ? 'am' : 'pm'}`;
};

/** "Friday, 3 pm" for the shapes people write, or undefined for anything else. */
export function describeCron(expression) {
  const parts = String(expression ?? '').trim().split(/\s+/);
  if (parts.length !== 5) return undefined;
  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;
  if (!/^\d{1,2}$/.test(minute) || !/^\d{1,2}$/.test(hour) || dayOfMonth !== '*' || month !== '*') return undefined;
  const m = Number(minute), h = Number(hour);
  if (m > 59 || h > 23) return undefined;
  let days;
  if (/^[0-7]$/.test(dayOfWeek)) days = DAYS[Number(dayOfWeek)];
  else if (dayOfWeek === '1-5') days = 'Weekdays';
  else if (dayOfWeek === '*') days = 'Every day';
  else return undefined;
  return `${days}, ${clock(h, m)}`;
}

/** The two times the week page shows, from the manifest beside the app. */
export function emailTimes(manifestPath) {
  let jobs = new Map();
  try { jobs = jobSchedules(readFileSync(manifestPath, 'utf8')); } catch { /* no manifest: plain labels */ }
  return {
    reminder: describeCron(jobs.get('friday-reminder')?.schedule) ?? 'Weekly reminder',
    summary: describeCron(jobs.get('monday-summary')?.schedule) ?? 'Weekly summary',
  };
}
