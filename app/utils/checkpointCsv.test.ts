import Papa from 'papaparse';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  CHECKPOINT_CSV_HEADERS,
  csvToCheckpoints,
  checkpointsToCsv,
  sampleCheckpointCsv,
  appendCheckpoints,
} from './checkpointCsv';

const note = (values: Record<string, string>) => {
  const fields: Record<string, string> = {
    checkpoint_key: 'intro',
    checkpoint_order: '1',
    item_order: '1',
    type: 'note',
    prompt: 'Observe.',
    ...values,
  };
  return CHECKPOINT_CSV_HEADERS.map((header) => fields[header] ?? '');
};
const csv = (...rows: string[][]) => Papa.unparse([[...CHECKPOINT_CSV_HEADERS], ...rows]);
const semantic = (text: string) =>
  csvToCheckpoints(text).checkpoints.map((c) => ({
    checkpointKey: c.checkpointKey,
    placementHint: c.placementHint,
    timeOffsetSeconds: c.timeOffsetSeconds,
    questions: c.questions.map((q) => ({ ...q, id: undefined })),
  }));

describe('checkpoint CSV', () => {
  it('retains the existing checkpoint schema without quiz variants', () => {
    const sample = readFileSync(join(process.cwd(), 'samples/checkpoints-motion.csv'), 'utf8');
    expect(Papa.parse<string[]>(sample).data[0]).toEqual([...CHECKPOINT_CSV_HEADERS]);
    expect(csvToCheckpoints(sample).errors).toEqual([]);
    expect(CHECKPOINT_CSV_HEADERS).not.toContain('variant_key');
  });
  it('groups nonadjacent rows and sorts groups/items by explicit order', () => {
    const result = csvToCheckpoints(
      csv(
        note({ item_order: '7', prompt: 'Second' }),
        note({ checkpoint_key: 'end', checkpoint_order: '2' }),
        note({ prompt: 'First' })
      )
    );
    expect(result.errors).toEqual([]);
    expect(result.checkpoints.map((c) => c.checkpointKey)).toEqual(['intro', 'end']);
    expect(result.checkpoints[0].questions.map((q) => q.prompt)).toEqual(['First', 'Second']);
    expect(result.checkpoints.every((c) => c.timeOffsetSeconds === null)).toBe(true);
  });
  it('round trips mixed items, hints, numeric answers and untimed checkpoints', () => {
    const sample = sampleCheckpointCsv();
    expect(csvToCheckpoints(sample).errors).toEqual([]);
    expect(semantic(checkpointsToCsv(csvToCheckpoints(sample).checkpoints))).toEqual(semantic(sample));
  });
  it('accepts group metadata on any row and preserves zero timestamps', () => {
    const result = csvToCheckpoints(
      csv(note({}), note({ item_order: '2', checkpoint_seconds: '0', placement_hint: 'Start' }))
    );
    expect(result.errors).toEqual([]);
    expect(result.checkpoints[0]).toMatchObject({ timeOffsetSeconds: 0, placementHint: 'Start' });
  });
  it.each([
    ['duplicate item order', [note({}), note({})]],
    ['conflicting group order', [note({}), note({ item_order: '2', checkpoint_order: '2' })]],
    ['conflicting timestamps', [note({ checkpoint_seconds: '1' }), note({ item_order: '2', checkpoint_seconds: '2' })]],
    ['conflicting hints', [note({ placement_hint: 'A' }), note({ item_order: '2', placement_hint: 'B' })]],
    ['duplicate group order', [note({}), note({ checkpoint_key: 'other' })]],
    [
      'duplicate group timestamp',
      [
        note({ checkpoint_seconds: '0' }),
        note({ checkpoint_key: 'other', checkpoint_order: '2', checkpoint_seconds: '0' }),
      ],
    ],
    ['invalid timestamp', [note({ checkpoint_seconds: '-1' })]],
    ['fractional timestamp', [note({ checkpoint_seconds: '1.5' })]],
    ['database overflow', [note({ checkpoint_seconds: '2147483648' })]],
    ['blank key', [note({ checkpoint_key: '' })]],
    ['note answers', [note({ correct: '1' })]],
    ['invalid question', [note({ type: 'multipleChoice' })]],
  ])('rejects the entire file for %s', (_label, rows) => {
    const result = csvToCheckpoints(csv(...rows));
    expect(result.checkpoints).toEqual([]);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0].message).toMatch(/Record \d+/);
  });
  it('preserves formula-like text, quotes, commas, newlines, math and Unicode', () => {
    const text = '=intro,"quoted"\n$\\ce{H2O}$ — water';
    const input = csv(note({ prompt: text, checkpoint_key: '@intro', placement_hint: '-hint' }));
    const output = checkpointsToCsv(csvToCheckpoints(input).checkpoints);
    expect(output).toContain("'@intro");
    expect(semantic(output)).toEqual(semantic(input));
  });
  it('rejects broken headers, field counts and oversized row sets', () => {
    expect(csvToCheckpoints('wrong\nvalue').errors.length).toBeGreaterThan(0);
    expect(csvToCheckpoints(csv(note({}).slice(1))).errors.length).toBeGreaterThan(0);
    expect(csvToCheckpoints(csv(...Array.from({ length: 5001 }, () => note({})))).checkpoints).toEqual([]);
  });
  it('blocks key/time collisions on append without modifying existing content', () => {
    const existing = csvToCheckpoints(sampleCheckpointCsv()).checkpoints;
    expect(() => appendCheckpoints(existing, existing)).toThrow(/key/);
    const collision = { ...existing[1], checkpointKey: 'other' };
    expect(() => appendCheckpoints(existing, [collision])).toThrow(/Timestamp/);
    const fresh = { ...existing[0], checkpointKey: 'fresh' };
    expect(appendCheckpoints(existing, [fresh])).toHaveLength(3);
    expect(existing).toHaveLength(2);
  });
  it('refuses incomplete content on export instead of losing it', () => {
    const checkpoints = csvToCheckpoints(sampleCheckpointCsv()).checkpoints;
    checkpoints[0].questions = [];
    expect(() => checkpointsToCsv(checkpoints)).toThrow(/at least one item/);
  });
});
