import { courseFilterUrl, readCourseFilters } from './listFilters';
it('round-trips current text, number and date filter models', () => {
  const filters = {
    title: { filterType: 'text', type: 'contains', filter: 'chem' },
    section: { filterType: 'text', type: 'blank' },
    studentCount: { filterType: 'number', type: 'inRange', filter: 0, filterTo: 20 },
    updatedAt: { filterType: 'date', type: 'greaterThan', dateFrom: '2026-01-01' },
  };
  const state = readCourseFilters({ filters: JSON.stringify(filters), sort: 'studentCount:desc' });
  expect(state.gridFilters).toEqual(filters);
  expect(
    readCourseFilters(Object.fromEntries(new URL(courseFilterUrl(state), 'https://example.com').searchParams))
  ).toEqual(state);
});
it('rejects obsolete or malformed state', () => {
  expect(readCourseFilters({ filters: '{', sort: 'toString' })).toEqual({ sort: 'default', gridFilters: {} });
  expect(
    readCourseFilters({
      filters: JSON.stringify({
        isDraft: { value: 'draft' },
        studentCount: { filterType: 'number', type: 'equals', filter: 'two' },
      }),
    }).gridFilters
  ).toEqual({});
});
