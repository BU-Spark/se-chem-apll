import type { FilterModel } from 'ag-grid-community';
import { parseGridFilters } from '../../components/InstructorGrid/filterModel';
export type SearchParams = Record<string, string | string[] | undefined>;
export type CourseListItem = {
  canEdit?: boolean;
  id: string;
  title: string;
  code: string;
  section: string | null;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
  _count: { courseLessons: number; enrollments: number };
};
export const sortOptions = {
  default: 'Recently updated',
  az: 'Title A–Z',
  za: 'Title Z–A',
  updated: 'Recently updated',
  created: 'Recently created',
  'code:asc': 'Course code A–Z',
  'code:desc': 'Course code Z–A',
  'section:asc': 'Section A–Z',
  'section:desc': 'Section Z–A',
  'lessonCount:asc': 'Fewest lessons first',
  'lessonCount:desc': 'Most lessons first',
  'studentCount:asc': 'Fewest students first',
  'studentCount:desc': 'Most students first',
  'updatedAt:asc': 'Oldest updates first',
  'updatedAt:desc': 'Recently updated',
  'createdAt:asc': 'Oldest first',
  'createdAt:desc': 'Recently created',
} as const;
export type CourseFilters = { sort: keyof typeof sortOptions; gridFilters: FilterModel };
export function readCourseFilters(params: SearchParams): CourseFilters {
  const first = (key: string) => {
    const v = params[key];
    return Array.isArray(v) ? (v[0] ?? '') : (v ?? '');
  };
  const sort = first('sort');
  return {
    sort: Object.hasOwn(sortOptions, sort) ? (sort as CourseFilters['sort']) : 'default',
    gridFilters: parseGridFilters(first('filters'), {
      title: 'text',
      code: 'text',
      section: 'text',
      lessonCount: 'number',
      studentCount: 'number',
      updatedAt: 'date',
    }),
  };
}
export function courseFilterUrl(filters: CourseFilters) {
  const params = new URLSearchParams();
  if (Object.keys(filters.gridFilters).length) params.set('filters', JSON.stringify(filters.gridFilters));
  if (filters.sort !== 'default') params.set('sort', filters.sort);
  return `/instructor/courses${params.toString() ? `?${params}` : ''}`;
}
export function prepareCourses(courses: CourseListItem[]) {
  return courses.map((course) => ({
    ...course,
    title: course.title || 'Untitled course',
    description: course.description ?? '',
    lessonCount: course._count.courseLessons,
    studentCount: course._count.enrollments,
    updatedTimestamp: new Date(course.updatedAt).getTime(),
    createdTimestamp: new Date(course.createdAt).getTime(),
  }));
}
export type CourseGridRow = ReturnType<typeof prepareCourses>[number];
