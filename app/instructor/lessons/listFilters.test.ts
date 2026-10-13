import { lessonFilterUrl, readLessonFilters, prepareLessons } from './listFilters';
it('round-trips all current filters and number ranges', () => {
  const state = readLessonFilters({
    drafts: '1',
    course: 'c1',
    sort: 'nodeCount:desc',
    filters: JSON.stringify({
      nodeCount: { filterType: 'number', type: 'inRange', filter: 2, filterTo: 5 },
      usage: { value: false },
    }),
  });
  expect(
    readLessonFilters(Object.fromEntries(new URL(lessonFilterUrl(state), 'https://example.com').searchParams))
  ).toEqual(state);
  expect(state.gridFilters.nodeCount.filterTo).toBe(5);
});
it('rejects malformed, unsupported and invisible filters and invalid sorts', () => {
  expect(readLessonFilters({ filters: '{', sort: 'toString' }).sort).toBe('default');
  expect(
    readLessonFilters({
      filters: JSON.stringify({
        tags: { filterType: 'text', type: 'contains', filter: 'x' },
        nodeCount: { filterType: 'number', type: 'equals', filter: '4' },
      }),
    }).gridFilters
  ).toEqual({});
});
it('prepares title fallbacks and deduplicates courses', () => {
  const course = { id: 'c1', title: 'Course' };
  const [row] = prepareLessons([
    {
      id: 'l1',
      title: '',
      summary: null,
      isDraft: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      _count: { lessonNodes: 3 },
      courseLessons: [{ course }, { course }],
    },
  ]);
  expect(row.title).toBe('Untitled lesson');
  expect(row.courses).toEqual([course]);
  expect(row.nodeCount).toBe(3);
});
