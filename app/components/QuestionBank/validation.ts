import { MAX_CHOICES, MIN_CHOICES, type AuthoringQuestion } from './types';

/**
 * Structured validation for authoring questions.
 *
 * Issues are produced for the browser status column, the detail editor's
 * inline messages, and the form-level save guard — all from one function.
 * Drafts may hold errors locally; NodeForm blocks saving until errors clear.
 */

export type IssueSeverity = 'error' | 'warning';

export type QuestionIssue = {
  questionId: string;
  /** 'prompt' | 'choices' | 'answer' | `choice:<choiceId>` */
  field: string;
  severity: IssueSeverity;
  code: string;
  message: string;
};

function error(questionId: string, field: string, code: string, message: string): QuestionIssue {
  return { questionId, field, severity: 'error', code, message };
}

function warning(questionId: string, field: string, code: string, message: string): QuestionIssue {
  return { questionId, field, severity: 'warning', code, message };
}

function isFiniteNumberString(raw: string): boolean {
  const trimmed = raw.trim();
  return trimmed !== '' && Number.isFinite(Number(trimmed));
}

export function validateQuestion(q: AuthoringQuestion): QuestionIssue[] {
  const issues: QuestionIssue[] = [];

  if (q.prompt.trim() === '') {
    issues.push(error(q.id, 'prompt', 'PROMPT_REQUIRED', 'Prompt is required.'));
  }

  if (q.type === 'multipleChoice') {
    if (q.choices.length < MIN_CHOICES || q.choices.length > MAX_CHOICES) {
      issues.push(
        error(q.id, 'choices', 'MC_CHOICE_COUNT', `Multiple choice needs ${MIN_CHOICES}–${MAX_CHOICES} choices.`)
      );
    }
    for (const choice of q.choices) {
      if (choice.content.trim() === '') {
        issues.push(error(q.id, `choice:${choice.id}`, 'MC_CHOICE_EMPTY', 'Choice text is required.'));
      }
    }
    if (!q.choices.some((choice) => choice.correct)) {
      issues.push(error(q.id, 'choices', 'MC_NO_CORRECT', 'Mark at least one choice as correct.'));
    }

    const seen = new Set<string>();
    for (const choice of q.choices) {
      const normalized = choice.content.trim().replace(/\s+/g, ' ').toLowerCase();
      if (normalized === '' || !seen.has(normalized)) {
        if (normalized !== '') seen.add(normalized);
        continue;
      }
      issues.push(
        warning(q.id, `choice:${choice.id}`, 'MC_DUPLICATE_CHOICE', 'This choice duplicates another choice.')
      );
    }
    return issues;
  }

  if (q.answer.mode === 'exact') {
    if (!isFiniteNumberString(q.answer.expected)) {
      issues.push(error(q.id, 'answer', 'SA_EXPECTED_INVALID', 'Expected answer must be a finite number.'));
    }
    return issues;
  }

  if (!isFiniteNumberString(q.answer.minimum) || !isFiniteNumberString(q.answer.maximum)) {
    issues.push(error(q.id, 'answer', 'SA_RANGE_INVALID', 'Minimum and maximum must be finite numbers.'));
  } else if (Number(q.answer.minimum) > Number(q.answer.maximum)) {
    issues.push(error(q.id, 'answer', 'SA_RANGE_ORDER', 'Minimum must be less than or equal to the maximum.'));
  }
  return issues;
}

/** Validate a whole bank, keyed by question id for fast lookup in the browser. */
export function validateQuestionBank(questions: AuthoringQuestion[]): Map<string, QuestionIssue[]> {
  const map = new Map<string, QuestionIssue[]>();
  for (const q of questions) {
    const issues = validateQuestion(q);
    if (issues.length > 0) map.set(q.id, issues);
  }
  return map;
}

export function countIssuesBySeverity(issuesByQuestion: Map<string, QuestionIssue[]>): {
  errors: number;
  warnings: number;
} {
  let errors = 0;
  let warnings = 0;
  for (const issues of issuesByQuestion.values()) {
    for (const issue of issues) {
      if (issue.severity === 'error') errors += 1;
      else warnings += 1;
    }
  }
  return { errors, warnings };
}
