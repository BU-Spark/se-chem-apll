import type { FilterModel } from 'ag-grid-community';
import { parseGridFilters } from './gridFilterState';
export interface NodeListItem {
  canEdit?: boolean;
  id: string;
  title: string;
  summary: string | null;
  tags: string[];
  isDraft: boolean;
  createdAt: Date;
  updatedAt: Date;
  lessonNodes: { lesson: { id: string; title: string } }[];
}

export type SearchParams = Record<string, string | string[] | undefined>;
export const sortOptions = {
  default: 'Drafts first, recently updated',
  updated: 'Recently updated',
  created: 'Newest created',
  az: 'Title A–Z',
  za: 'Title Z–A',
  'isDraft:asc': 'Published first',
  'isDraft:desc': 'Drafts first',
  'tags:asc': 'Tags A–Z',
  'tags:desc': 'Tags Z–A',
  'usage:asc': 'Unused first',
  'usage:desc': 'Used first',
  'updatedAt:asc': 'Oldest update',
  'updatedAt:desc': 'Newest update',
  'createdAt:asc': 'Oldest created',
  'createdAt:desc': 'Newest created',
};
export interface NodeFilters {
  draftOnly?: boolean;
  gridFilters?: FilterModel;
  q: string;
  tags: string[];
  status: 'all' | 'draft' | 'published';
  usage: 'all' | 'mine' | 'unused';
  lesson: string;
  sort: keyof typeof sortOptions;
}
const normalize = (value: string) => value.trim().toLowerCase();

export function readNodeFilters(params: SearchParams): NodeFilters {
  const single = (key: string) => (Array.isArray(params[key]) ? params[key][0] : params[key]) ?? '';
  const usage = single('usage');
  const status = single('status');
  const sort = single('sort');
  return {
    ...(single('filters') ? { gridFilters: parseGridFilters(single('filters')) } : {}),
    ...(single('drafts') === '1' ? { draftOnly: true } : {}),
    q: single('q').trim(),
    tags: [...new Set((Array.isArray(params.tag) ? params.tag : [params.tag ?? '']).map(normalize).filter(Boolean))],
    status: status === 'draft' || status === 'published' ? status : 'all',
    usage: usage === 'mine' || usage === 'unused' ? usage : 'all',
    lesson: usage === 'mine' || single('filters') ? single('lesson') : '',
    sort: Object.prototype.hasOwnProperty.call(sortOptions, sort) ? (sort as NodeFilters['sort']) : 'default',
  };
}

export function nodeFilterUrl(filters: NodeFilters): string {
  const params = new URLSearchParams();
  if (filters.q) params.set('q', filters.q);
  if (filters.draftOnly) params.set('drafts', '1');
  if (filters.gridFilters) params.set('filters', JSON.stringify(filters.gridFilters));
  for (const tag of filters.tags) params.append('tag', tag);
  if (filters.status !== 'all') params.set('status', filters.status);
  if (filters.usage !== 'all') params.set('usage', filters.usage);
  if ((filters.usage === 'mine' || filters.gridFilters) && filters.lesson) params.set('lesson', filters.lesson);
  if (filters.sort !== 'default') params.set('sort', filters.sort);
  const query = params.toString();
  return `/instructor/nodes${query ? `?${query}` : ''}`;
}

export function prepareNodes(nodes: NodeListItem[]) {
  return nodes.map((node) => ({
    ...node,
    title: node.title || 'Untitled node',
    searchText: [node.title || 'Untitled node', node.summary ?? '', ...node.tags].map(normalize).join('\n'),
    normalizedTags: new Set(node.tags.map(normalize)),
    lessons: [...new Map(node.lessonNodes.map(({ lesson }) => [lesson.id, lesson])).values()],
    lessonIds: new Set(node.lessonNodes.map(({ lesson }) => lesson.id)),
    updatedTimestamp: new Date(node.updatedAt).getTime(),
    createdTimestamp: new Date(node.createdAt).getTime(),
  }));
}
export type NodeGridRow = ReturnType<typeof prepareNodes>[number];

export function filterPreparedNodes(nodes: NodeGridRow[], filters: NodeFilters): NodeGridRow[] {
  const query = normalize(filters.q);
  return nodes.filter((node) => {
    if (query && !node.searchText.includes(query)) return false;
    if (filters.tags.length && !filters.tags.some((tag) => node.normalizedTags.has(tag))) return false;
    if (filters.status !== 'all' && node.isDraft !== (filters.status === 'draft')) return false;
    if (filters.usage === 'unused' && node.lessonIds.size) return false;
    if (filters.usage === 'mine' && (!node.lessonIds.size || (filters.lesson && !node.lessonIds.has(filters.lesson))))
      return false;
    return true;
  });
}

export function filterNodes(nodes: NodeListItem[], filters: NodeFilters): NodeListItem[] {
  const result = filterPreparedNodes(prepareNodes(nodes), filters);
  return result.sort((a, b) => {
    let comparison = 0;
    if (filters.sort === 'default') comparison = Number(b.isDraft) - Number(a.isDraft);
    if (!comparison && (filters.sort === 'default' || filters.sort === 'updated'))
      comparison = b.updatedAt.getTime() - a.updatedAt.getTime();
    if (filters.sort === 'created') comparison = b.createdAt.getTime() - a.createdAt.getTime();
    if (filters.sort === 'az' || filters.sort === 'za')
      comparison =
        (a.title || 'Untitled node').localeCompare(b.title || 'Untitled node', 'en', { sensitivity: 'base' }) *
        (filters.sort === 'za' ? -1 : 1);
    return comparison || a.id.localeCompare(b.id, 'en');
  });
}
