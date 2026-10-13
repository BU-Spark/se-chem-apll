'use client';

import {
  describeLatePenalty,
  type LatePenaltyType,
  type LessonScheduleValue,
} from '@/app/utils/lessonSubmissionPolicy';
import styles from './styles.module.css';

export default function LessonScheduleFields({
  value,
  onChange,
}: {
  value: LessonScheduleValue;
  onChange: (patch: Partial<LessonScheduleValue>) => void;
}) {
  const percent = Number(value.latePenaltyPercent);
  const exampleHours = value.latePenaltyType === 'DAILY' ? 24 : 1;
  const exampleScore = 80 * (1 - Math.min(100, Math.max(0, percent)) / 100);
  return (
    <fieldset className={styles.fields}>
      <legend>Availability and late submissions</legend>
      <p className={styles.note}>All times are in UTC. Set dates and times to the minute.</p>
      <div className={styles.row}>
        {(['openDate', 'dueDate', 'lateDeadline'] as const).map((key) => (
          <label className={styles.field} key={key}>
            {key === 'openDate' ? 'Open date' : key === 'dueDate' ? 'Due date' : 'Late submission deadline'} (UTC)
            <input
              type="datetime-local"
              step="60"
              // Keep full precision in form state until this field is edited.
              value={value[key].slice(0, 16)}
              onChange={(event) => onChange({ [key]: event.target.value })}
            />
          </label>
        ))}
      </div>
      <label className={styles.checkbox}>
        <input
          type="checkbox"
          checked={value.hideAfterDue}
          onChange={(event) => onChange({ hideAfterDue: event.target.checked })}
        />
        Hide lesson after due date
      </label>
      <p className={styles.note}>
        To accept late work, keep the lesson visible and set a late deadline. Without a late deadline, submissions close
        at the due date. Visible lessons remain available for review afterward.
      </p>
      <div className={styles.row}>
        <label className={styles.field}>
          Late submission penalty
          <select
            value={value.latePenaltyType}
            onChange={(event) =>
              onChange({
                latePenaltyType: event.target.value as LatePenaltyType,
                ...(event.target.value === 'NONE' ? { latePenaltyPercent: '0' } : {}),
              })
            }
          >
            <option value="NONE">No penalty</option>
            <option value="FIXED">Fixed percentage</option>
            <option value="HOURLY">Percentage per hour</option>
            <option value="DAILY">Percentage per day</option>
          </select>
        </label>
        {value.latePenaltyType !== 'NONE' && (
          <label className={styles.field}>
            Deduction (%)
            <input
              type="number"
              required
              min="0.000001"
              max="100"
              step="any"
              value={value.latePenaltyPercent}
              onChange={(event) => onChange({ latePenaltyPercent: event.target.value })}
            />
          </label>
        )}
      </div>
      <p className={styles.note} aria-live="polite">
        {Number.isFinite(percent) &&
          describeLatePenalty({ latePenaltyType: value.latePenaltyType, latePenaltyPercent: percent })}
        {value.latePenaltyType !== 'NONE' &&
          percent > 0 &&
          percent <= 100 &&
          ` Example: an earned score of 80 becomes ${Number(exampleScore.toFixed(4))} ${value.latePenaltyType === 'FIXED' ? 'when submitted late' : `after ${exampleHours} hour${exampleHours === 1 ? '' : 's'}`}.`}
      </p>
    </fieldset>
  );
}
