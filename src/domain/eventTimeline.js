import {formatScheduleTime} from './publicSchedule.js';

/**
 * The LICH_TRINH table no longer exists: the schedule lives inside SU_KIEN.MoTaChiTiet, in the line format that
 * parseTimelineFromDescription reads: "- **HH:MM - HH:MM**: Title: details".
 */
export const TIMELINE_HEADING = '## Lịch trình';

/**
 * Removes the machine-written timeline block (heading to the end) from a description, so public pages and the
 * wizard description field show only the narrative.
 * @param {string | null | undefined} description
 * @returns {string}
 */
export function stripTimelineFromDescription(description) {
  if (!description || typeof description !== 'string') return '';
  const lines = description.split(/\r?\n/);
  const at = lines.findIndex((line) => line.trim() === TIMELINE_HEADING);
  const kept = at === -1 ? lines : lines.slice(0, at);
  return kept.join('\n').replace(/\s+$/, '');
}

/**
 * Writes the schedule into the description. Items without a valid start time or title are skipped.
 * The per-item location is not stored (the description format has no field for it).
 * @param {string | null | undefined} description
 * @param {Array<{startTime?: string, endTime?: string, title?: string, description?: string, order?: number}> | null | undefined} schedule
 * @returns {string}
 */
export function embedTimelineInDescription(description, schedule) {
  const base = stripTimelineFromDescription(description);
  const items = (Array.isArray(schedule) ? schedule : [])
    .map((item, index) => ({item, index}))
    .sort((a, b) => (a.item.order ?? a.index + 1) - (b.item.order ?? b.index + 1) || a.index - b.index)
    .map(({item}) => item);

  const lines = [];
  for (const item of items) {
    const start = formatScheduleTime(item.startTime);
    const title = String(item.title ?? '').replace(/[:：]\s+/g, ' – ').replace(/\s+/g, ' ').trim();
    if (!start || !title) continue;
    const end = item.endTime ? formatScheduleTime(item.endTime) : '';
    const details = String(item.description ?? '').replace(/\s+/g, ' ').trim();
    lines.push(`- **${end ? `${start} - ${end}` : start}**: ${title}${details ? `: ${details}` : ''}`);
  }
  if (lines.length === 0) return base;
  return `${base ? `${base}\n\n` : ''}${TIMELINE_HEADING}\n${lines.join('\n')}`;
}
