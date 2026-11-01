import type { FilterModel } from 'ag-grid-community';
import { parseGridFilters } from '../../components/InstructorGrid/filterModel';
export type SearchParams = Record<string, string | string[] | undefined>;
export type StudentCourseItem = {
  id: string;
  title: string;
  code: string;
  section: string | null;
  enrollments: { student: { id: string; name: string | null; email: string } }[];
};
export const sortOptions = {
  default: 'Course A–Z',
  az: 'Course A–Z',
  za: 'Course Z–A',
  'code:asc': 'Course code A–Z',
  'code:desc': 'Course code Z–A',
  'section:asc': 'Section A–Z',
  'section:desc': 'Section Z–A',
  'studentCount:asc': 'Fewest students first',
  'studentCount:desc': 'Most students first',
  'rosterSearch:asc': 'Enrolled students A–Z',
  'rosterSearch:desc': 'Enrolled students Z–A',
} as const;
export type StudentFilters = { sort: keyof typeof sortOptions; gridFilters: FilterModel };
export function readStudentFilters(params: SearchParams): StudentFilters {
  const first = (key: string) => {
    const v = params[key];
    return Array.isArray(v) ? (v[0] ?? '') : (v ?? '');
  };
  const sort = first('sort');
  return {
    sort: Object.hasOwn(sortOptions, sort) ? (sort as StudentFilters['sort']) : 'default',
    gridFilters: parseGridFilters(first('filters'), {
      title: 'text',
      code: 'text',
      section: 'text',
      studentCount: 'number',
      rosterSearch: 'text',
    }),
  };
}
export function studentFilterUrl(filters: StudentFilters) {
  const params = new URLSearchParams();
  if (Object.keys(filters.gridFilters).length) params.set('filters', JSON.stringify(filters.gridFilters));
  if (filters.sort !== 'default') params.set('sort', filters.sort);
  return `/instructor/students${params.toString() ? `?${params}` : ''}`;
}
export function uniqueStudentCount(courses: StudentCourseItem[]) {
  return new Set(courses.flatMap((course) => course.enrollments.map(({ student }) => student.id))).size;
}
export function prepareCourses(courses: StudentCourseItem[]) {
  return courses.map((course) => {
    const students = [...new Map(course.enrollments.map(({ student }) => [student.id, student])).values()].sort(
      (a, b) => (a.name?.trim() || a.email).localeCompare(b.name?.trim() || b.email, 'en') || a.id.localeCompare(b.id)
    );
    const names = students.slice(0, 3).map((student) => student.name?.trim() || student.email);
    return {
      ...course,
      title: course.title || 'Untitled course',
      studentCount: students.length,
      rosterSearch: students.map((student) => `${student.name ?? ''} ${student.email}`).join('\n'),
      rosterPreview: students.length
        ? `${names.join(', ')}${students.length > 3 ? ` · +${students.length - 3} more` : ''}`
        : 'No students enrolled',
    };
  });
}
export type StudentGridRow = ReturnType<typeof prepareCourses>[number];
