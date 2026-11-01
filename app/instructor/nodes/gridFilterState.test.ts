import { currentNodeFilters, legacyGridFilters, parseGridFilters } from './gridFilterState';
import { nodeFilterUrl, readNodeFilters } from './listFilters';

it('translates existing status, usage, and tag URLs into native filter models', () => {
  const model = legacyGridFilters(readNodeFilters({ status: 'draft', usage: 'mine', tag: ['chemistry', 'physics'] }));
  expect(model.isDraft).toEqual({ value: 'draft' });
  expect(model.usage).toEqual({ value: true });
  expect(model.tags.operator).toBe('OR');
  expect(model.tags.conditions).toHaveLength(2);
});
it('round trips native compound filters and a lesson selection', () => {
  const gridFilters = {
    title: {
      filterType: 'text',
      operator: 'AND',
      conditions: [
        { filterType: 'text', type: 'contains', filter: 'a' },
        { filterType: 'text', type: 'notContains', filter: 'b' },
      ],
    },
    usage: { value: true },
    updatedAt: { filterType: 'date', type: 'equals', dateFrom: '2026-03-01 00:00:00', dateTo: null },
    isDraft: { value: 'published' },
  };
  const value = { ...readNodeFilters({}), gridFilters, lesson: 'l1' };
  const params = new URLSearchParams(nodeFilterUrl(value).split('?')[1]);
  expect(readNodeFilters(Object.fromEntries(params))).toEqual(value);
});
it.each([
  'bad json',
  '[]',
  'null',
  '{"unknown":{"filterType":"text","type":"contains","filter":"a"}}',
  '{"title":{"filterType":"text","type":"invalid"}}',
  '{"isDraft":{"value":"invalid"}}',
  '{"usage":{"filterType":"number","type":"equals","filter":"bad"}}',
])('ignores malformed URL models: %s', (input) => {
  expect(parseGridFilters(input)).toEqual({});
});

it.each([
  ['equals', 0, false],
  ['lessThan', 1, false],
  ['lessThanOrEqual', 0, false],
  ['greaterThan', 0, true],
  ['greaterThanOrEqual', 1, true],
  ['notEqual', 0, true],
])('migrates numeric usage %s %s into a boolean', (type, filter, value) => {
  expect(parseGridFilters(JSON.stringify({ usage: { filterType: 'number', type, filter } }))).toEqual({
    usage: { value },
  });
});
it('moves legacy draft filters into the toggle and removes obsolete hidden filters', () => {
  const result = currentNodeFilters(
    readNodeFilters({
      q: 'old search',
      filters: JSON.stringify({
        isDraft: { value: 'draft' },
        usage: { filterType: 'number', type: 'equals', filter: 0 },
      }),
    })
  );
  expect(result.draftOnly).toBe(true);
  expect(result.q).toBe('');
  expect(result.gridFilters).toEqual({ usage: { value: false } });
  const params = new URLSearchParams(nodeFilterUrl(result).split('?')[1]);
  expect(params.get('drafts')).toBe('1');
  expect(currentNodeFilters(readNodeFilters(Object.fromEntries(params)))).toEqual(result);
});
