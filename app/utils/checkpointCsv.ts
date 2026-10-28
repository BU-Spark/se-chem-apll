import Papa from 'papaparse';
import {
  QUESTION_CSV_HEADERS,
  rowToQuestion,
  questionToCsvCells,
  guardTextCell,
  unguardTextCell,
  type CsvRowError,
} from './questionBankCsv';
import { authoringQuestionToPayload, dbQuestionToAuthoring } from '@/app/components/QuestionBank/adapters';
import { dbQuestionToForm, serializeQuestionOptions, type FormCheckpoint } from '@/app/components/NodeForm/types';
import { generateClientId } from '@/lib/generateClientId';
import { validateNodeContent } from './nodeContent';

export const CHECKPOINT_CSV_HEADERS = [
  'checkpoint_key',
  'checkpoint_order',
  'item_order',
  'checkpoint_seconds',
  'placement_hint',
  ...QUESTION_CSV_HEADERS,
] as const;
export const CHECKPOINT_CSV_MAX_BYTES = 2 * 1024 * 1024;
export const CHECKPOINT_CSV_MAX_ROWS = 5000;
export type CheckpointCsvResult = { checkpoints: FormCheckpoint[]; errors: CsvRowError[] };

export function csvToCheckpoints(text: string): CheckpointCsvResult {
  const errors: CsvRowError[] = [];
  const fail = (row: number, message: string) => errors.push({ row, message: `Record ${row}: ${message}` });
  if (new Blob([text]).size > CHECKPOINT_CSV_MAX_BYTES)
    return { checkpoints: [], errors: [{ row: 1, message: 'The file limit is 2 MB.' }] };
  const parsed = Papa.parse<string[]>(text.replace(/^\uFEFF/, ''), { skipEmptyLines: 'greedy' });
  parsed.errors.forEach((error) => fail((error.row ?? 0) + 1, error.message));
  const [headers = [], ...rows] = parsed.data;
  const map = new Map<string, number>();
  headers.forEach((header, index) => {
    const key = header.trim().toLowerCase();
    if (map.has(key)) fail(1, `Duplicate column "${key}".`);
    if (!CHECKPOINT_CSV_HEADERS.includes(key as (typeof CHECKPOINT_CSV_HEADERS)[number]))
      fail(1, `Unknown column "${key}".`);
    map.set(key, index);
  });
  CHECKPOINT_CSV_HEADERS.forEach((header) => {
    if (!map.has(header)) fail(1, `Missing column "${header}".`);
  });
  if (!rows.length) fail(1, 'The file must contain at least one item.');
  if (rows.length > CHECKPOINT_CSV_MAX_ROWS) fail(1, `The limit is ${CHECKPOINT_CSV_MAX_ROWS} records.`);
  if (errors.length) return { checkpoints: [], errors };
  const groups = new Map<
    string,
    { checkpoint: FormCheckpoint; order: number; items: Map<number, FormCheckpoint['questions'][number]>; row: number }
  >();
  const integer = (raw: string, minimum: number) =>
    /^\d+$/.test(raw) && Number(raw) >= minimum && Number(raw) <= 2147483647;
  rows.forEach((row, index) => {
    const record = index + 2;
    if (row.length !== headers.length) {
      fail(record, `Expected ${headers.length} columns, found ${row.length}.`);
      return;
    }
    const cell = (key: string) => row[map.get(key)!] ?? '';
    const key = unguardTextCell(cell('checkpoint_key')).trim();
    if (!key) {
      fail(record, 'checkpoint_key is required.');
      return;
    }
    const groupOrder = cell('checkpoint_order').trim();
    const itemOrder = cell('item_order').trim();
    const seconds = cell('checkpoint_seconds').trim();
    const hint = unguardTextCell(cell('placement_hint')).trim();
    if (!integer(groupOrder, 1) || !integer(itemOrder, 1)) {
      fail(record, `${key}: checkpoint_order and item_order must be positive integers.`);
      return;
    }
    if (seconds && !integer(seconds, 0)) {
      fail(record, `${key}: checkpoint_seconds must be a non-negative whole number or blank.`);
      return;
    }
    let group = groups.get(key);
    if (!group) {
      group = {
        checkpoint: {
          id: generateClientId('checkpoint'),
          checkpointKey: key,
          placementHint: null,
          timeOffsetSeconds: null,
          questions: [],
        },
        order: Number(groupOrder),
        items: new Map(),
        row: record,
      };
      groups.set(key, group);
    }
    if (group.order !== Number(groupOrder)) fail(record, `${key}: conflicting checkpoint_order.`);
    if (group.items.has(Number(itemOrder))) fail(record, `${key}: duplicate item_order ${itemOrder}.`);
    if (seconds) {
      if (group.checkpoint.timeOffsetSeconds !== null && group.checkpoint.timeOffsetSeconds !== Number(seconds))
        fail(record, `${key}: conflicting checkpoint_seconds.`);
      group.checkpoint.timeOffsetSeconds = Number(seconds);
    }
    if (hint) {
      if (group.checkpoint.placementHint && group.checkpoint.placementHint !== hint)
        fail(record, `${key}: conflicting placement_hint.`);
      group.checkpoint.placementHint = hint;
    }
    let item: FormCheckpoint['questions'][number];
    if (cell('type').trim().toLowerCase() === 'note') {
      const prompt = unguardTextCell(cell('prompt'));
      if (!prompt.trim()) fail(record, `${key}: note prompt is required.`);
      if (QUESTION_CSV_HEADERS.filter((h) => h !== 'type' && h !== 'prompt').some((h) => cell(h).trim()))
        fail(record, `${key}: notes must leave answer fields blank.`);
      item = dbQuestionToForm({
        id: generateClientId('question'),
        prompt,
        options: { type: 'note' },
        kind: 'NOTE',
        correctIndices: [],
      });
    } else {
      const result = rowToQuestion(row, map, record);
      if ('message' in result) {
        fail(record, `${key}: ${result.message}`);
        return;
      }
      item = dbQuestionToForm({
        ...authoringQuestionToPayload(result, 0),
        id: result.id,
        correctIndices:
          result.type === 'multipleChoice' ? result.choices.flatMap((c, i) => (c.correct ? [i] : [])) : [],
      });
    }
    delete item.persistedId;
    group.items.set(Number(itemOrder), item);
  });
  const orders = new Set<number>();
  const times = new Set<number>();
  const checkpoints = [...groups.values()]
    .sort((a, b) => a.order - b.order)
    .map((group) => {
      if (orders.has(group.order))
        fail(group.row, `${group.checkpoint.checkpointKey}: checkpoint_order is shared by another group.`);
      orders.add(group.order);
      const time = group.checkpoint.timeOffsetSeconds;
      if (time !== null && times.has(time))
        fail(group.row, `${group.checkpoint.checkpointKey}: timestamp is shared by another group.`);
      if (time !== null) times.add(time);
      return {
        ...group.checkpoint,
        questions: [...group.items.entries()].sort(([a], [b]) => a - b).map(([, item]) => item),
      };
    });
  return { checkpoints: errors.length ? [] : checkpoints, errors };
}

export function checkpointsToCsv(checkpoints: FormCheckpoint[]): string {
  if (checkpoints.some((checkpoint) => !checkpoint.questions.length))
    throw new Error('Add at least one item to each checkpoint before exporting.');
  const payload = checkpoints.map((checkpoint, sortOrder) => ({
    ...checkpoint,
    sortOrder,
    questions: checkpoint.questions.map((item, itemOrder) => ({
      sortOrder: itemOrder,
      prompt: item.prompt,
      kind: item.questionType === 'note' ? 'note' : 'question',
      options: serializeQuestionOptions(item),
      correctIndices: item.questionType === 'multipleChoice' ? item.correctIndices : [],
    })),
  }));
  // Validate complete content while allowing unplaced checkpoints.
  const error = validateNodeContent({ checkpoints: payload.map((c, i) => ({ ...c, timeOffsetSeconds: i })) });
  if (error) throw new Error(error);
  const rows: string[][] = [[...CHECKPOINT_CSV_HEADERS]];
  checkpoints.forEach((checkpoint, index) =>
    checkpoint.questions.forEach((item, itemIndex) => {
      const questionCells =
        item.questionType === 'note'
          ? ['note', guardTextCell(item.prompt), ...Array<string>(13).fill('')]
          : questionToCsvCells(
              dbQuestionToAuthoring({
                id: item.id,
                prompt: item.prompt,
                options: serializeQuestionOptions(item),
                correctIndices: item.correctIndices,
              })
            );
      rows.push([
        guardTextCell(checkpoint.checkpointKey ?? `checkpoint-${index + 1}`),
        String(index + 1),
        String(itemIndex + 1),
        checkpoint.timeOffsetSeconds === null ? '' : String(checkpoint.timeOffsetSeconds),
        guardTextCell(checkpoint.placementHint ?? ''),
        ...questionCells,
      ]);
    })
  );
  const csv = Papa.unparse(rows, { newline: '\n' });
  const roundTrip = csvToCheckpoints(csv);
  if (roundTrip.errors.length) throw new Error(roundTrip.errors[0].message);
  return csv;
}

export function sampleCheckpointCsv(): string {
  return Papa.unparse(
    [
      [...CHECKPOINT_CSV_HEADERS],
      [
        'intro',
        '1',
        '1',
        '',
        'After the introduction',
        'multipleChoice',
        'What is 2 + 2?',
        '3',
        '4',
        '',
        '',
        '',
        '',
        '',
        '',
        '2',
        '',
        '',
        '',
        '',
      ],
      [
        'intro',
        '1',
        '2',
        '',
        '',
        'shortAnswer',
        'Calculate 3 squared.',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        'exact',
        '9',
        '',
        '',
      ],
      ['forces', '2', '1', '120', '', 'note', 'Consider the forces in this example.', ...Array<string>(13).fill('')],
    ],
    { newline: '\n' }
  );
}

export function appendCheckpoints(existing: FormCheckpoint[], imported: FormCheckpoint[]): FormCheckpoint[] {
  const keys = new Set(existing.map((c) => c.checkpointKey));
  const times = new Set(existing.flatMap((c) => (c.timeOffsetSeconds === null ? [] : [c.timeOffsetSeconds])));
  for (const checkpoint of imported) {
    if (keys.has(checkpoint.checkpointKey))
      throw new Error(
        `Checkpoint key "${checkpoint.checkpointKey}" already exists. Rename it in the CSV or choose Replace.`
      );
    if (checkpoint.timeOffsetSeconds !== null && times.has(checkpoint.timeOffsetSeconds))
      throw new Error(`Timestamp ${checkpoint.timeOffsetSeconds} already exists. Clear or change it before appending.`);
  }
  return [...existing, ...imported];
}
