import type { FormCheckpoint } from './types';

export type SavedCheckpoint = {
  id: string;
  sortOrder: number;
  questions: Array<{ id: string; sortOrder: number }>;
};

/** Response ordering belongs to the submitted snapshot, not the current editor. */
export function reconcileSavedCheckpoints(
  current: FormCheckpoint[],
  submitted: FormCheckpoint[],
  saved: SavedCheckpoint[]
): FormCheckpoint[] {
  const savedByOrder = new Map(saved.map((checkpoint) => [checkpoint.sortOrder, checkpoint]));
  const identities = new Map<string, { id: string; questions: Map<string, string> }>();
  submitted.forEach((checkpoint, index) => {
    const record = savedByOrder.get(index);
    if (!record) return;
    const questionsByOrder = new Map(record.questions.map((question) => [question.sortOrder, question.id]));
    const questions = new Map<string, string>();
    checkpoint.questions.forEach((question, questionIndex) => {
      const id = questionsByOrder.get(questionIndex);
      if (id) questions.set(question.id, id);
    });
    identities.set(checkpoint.id, { id: record.id, questions });
  });

  return current.map((checkpoint) => {
    const record = identities.get(checkpoint.id);
    if (!record) return checkpoint;
    return {
      ...checkpoint,
      persistedId: record.id,
      questions: checkpoint.questions.map((question) => {
        const id = record.questions.get(question.id);
        return id ? { ...question, persistedId: id } : question;
      }),
    };
  });
}
