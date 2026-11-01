import { prepareCourses, uniqueStudentCount, readStudentFilters, studentFilterUrl } from './listFilters';
it('counts students uniquely across courses and uses email for missing names', () => {
  const student = { id: 's1', name: null, email: 'student@example.com' };
  const course = { id: 'a', title: '', code: 'A', section: null, enrollments: [{ student }] };
  const courses = [course, { ...course, id: 'b' }];
  expect(uniqueStudentCount(courses)).toBe(1);
  expect(prepareCourses(courses)[0]).toEqual(
    expect.objectContaining({ title: 'Untitled course', studentCount: 1, rosterPreview: 'student@example.com' })
  );
});
it('round-trips supported filters and rejects invisible filters', () => {
  const state = readStudentFilters({
    sort: 'studentCount:desc',
    filters: JSON.stringify({
      rosterSearch: { filterType: 'text', type: 'contains', filter: 'amy' },
      studentCount: { filterType: 'number', type: 'greaterThan', filter: 1 },
    }),
  });
  expect(
    readStudentFilters(Object.fromEntries(new URL(studentFilterUrl(state), 'https://example.com').searchParams))
  ).toEqual(state);
  expect(readStudentFilters({ sort: 'toString', filters: '{' })).toEqual({ sort: 'default', gridFilters: {} });
  expect(readStudentFilters({ filters: JSON.stringify({ isDraft: { value: 'draft' } }) }).gridFilters).toEqual({});
});
