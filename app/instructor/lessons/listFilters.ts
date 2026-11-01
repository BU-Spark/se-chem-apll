import type { FilterModel } from 'ag-grid-community';
import { parseGridFilters } from '../../components/InstructorGrid/filterModel';
export type SearchParams = Record<string, string | string[] | undefined>;
export type LessonListItem = {
  canEdit?: boolean;
  id: string;
  title: string;
  summary: string | null;
  isDraft: boolean;
  createdAt: Date;
  updatedAt: Date;
  _count: { lessonNodes: number };
  courseLessons: { course: { id: string; title: string } }[];
};
export const sortOptions = {
  default: 'Drafts first, recently updated',
  az: 'Title A–Z',
  za: 'Title Z–A',
  updated: 'Recently updated',
  created: 'Recently created',
  'isDraft:asc': 'Published first',
  'isDraft:desc': 'Drafts first',
  'nodeCount:asc': 'Fewest nodes first',
  'nodeCount:desc': 'Most nodes first',
  'usage:asc': 'Unused first',
  'usage:desc': 'Used first',
  'updatedAt:asc': 'Oldest updates first',
  'updatedAt:desc': 'Recently updated',
  'createdAt:asc': 'Oldest first',
  'createdAt:desc': 'Recently created',
} as const;
export type LessonFilters = {
  draftOnly: boolean;
  course: string;
  sort: keyof typeof sortOptions;
  gridFilters: FilterModel;
};
export function readLessonFilters(params: SearchParams): LessonFilters {
  const first = (key: string) => {
    const v = params[key];
    return Array.isArray(v) ? (v[0] ?? '') : (v ?? '');
  };
  const sort = first('sort');
  return {
    draftOnly: first('drafts') === '1',
    course: first('course'),
    sort: Object.hasOwn(sortOptions, sort) ? (sort as LessonFilters['sort']) : 'default',
    gridFilters: parseGridFilters(first('filters'), {
      title: 'text',
      nodeCount: 'number',
      usage: 'boolean',
      updatedAt: 'date',
    }),
  };
}
export function lessonFilterUrl(filters: LessonFilters) {
  const params = new URLSearchParams();
  if (filters.draftOnly) params.set('drafts', '1');
  if (filters.course) params.set('course', filters.course);
  if (Object.keys(filters.gridFilters).length) params.set('filters', JSON.stringify(filters.gridFilters));
  if (filters.sort !== 'default') params.set('sort', filters.sort);
  return `/instructor/lessons${params.toString() ? `?${params}` : ''}`;
}
export function prepareLessons(lessons: LessonListItem[]) {
  return lessons.map((lesson) => {
    const courses = [...new Map(lesson.courseLessons.map(({ course }) => [course.id, course])).values()];
    return {
      ...lesson,
      title: lesson.title || 'Untitled lesson',
      summary: lesson.summary ?? '',
      nodeCount: lesson._count.lessonNodes,
      courses,
      courseIds: new Set(courses.map((course) => course.id)),
      updatedTimestamp: new Date(lesson.updatedAt).getTime(),
      createdTimestamp: new Date(lesson.createdAt).getTime(),
    };
  });
}
export type LessonGridRow = ReturnType<typeof prepareLessons>[number];
