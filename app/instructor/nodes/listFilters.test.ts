import { filterNodes, nodeFilterUrl, readNodeFilters, type NodeListItem } from './listFilters';

const nodes: NodeListItem[] = [
  {
    id: 'a',
    title: 'Alpha',
    summary: 'Atomic structure',
    tags: ['Chemistry', 'Atoms'],
    isDraft: false,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-03-01'),
    lessonNodes: [{ lesson: { id: 'l1', title: 'First' } }],
  },
  {
    id: 'b',
    title: 'Beta',
    summary: null,
    tags: ['physics'],
    isDraft: true,
    createdAt: new Date('2026-02-01'),
    updatedAt: new Date('2026-02-01'),
    lessonNodes: [],
  },
  {
    id: 'c',
    title: 'Gamma',
    summary: null,
    tags: ['CHEMISTRY'],
    isDraft: false,
    createdAt: new Date('2026-03-01'),
    updatedAt: new Date('2026-03-01'),
    lessonNodes: [{ lesson: { id: 'l2', title: 'Second' } }],
  },
].map((node) => ({ ...node, videoUrl: null, _count: { checkpoints: 0, quizQuestions: 0 } }));
const ids = (params: Parameters<typeof readNodeFilters>[0]) =>
  filterNodes(nodes, readNodeFilters(params)).map((node) => node.id);

it('matches any selected tag, case insensitively', () => {
  expect(ids({ tag: [' chemistry ', 'PHYSICS'] })).toEqual(['b', 'a', 'c']);
  expect(ids({ tag: 'chemistry' })).toEqual(['a', 'c']);
});
it('combines text, status, tag, and specific lesson filters', () => {
  expect(ids({ q: 'atomic', tag: 'chemistry', status: 'published', usage: 'mine', lesson: 'l1' })).toEqual(['a']);
  expect(ids({ q: 'physics' })).toEqual(['b']);
  expect(ids({ q: 'gamma' })).toEqual(['c']);
  expect(ids({ status: 'draft', usage: 'mine' })).toEqual([]);
});
it('distinguishes used and unused nodes and ignores irrelevant lesson parameters', () => {
  expect(ids({ usage: 'mine' })).toEqual(['a', 'c']);
  expect(ids({ usage: 'unused', lesson: 'l1' })).toEqual(['b']);
  expect(ids({ lesson: 'l1' })).toEqual(['b', 'a', 'c']);
});
it.each([
  ['default', ['b', 'a', 'c']],
  ['updated', ['a', 'c', 'b']],
  ['created', ['c', 'b', 'a']],
  ['az', ['a', 'b', 'c']],
  ['za', ['c', 'b', 'a']],
])('sorts by %s with stable ties', (sort, expected) => {
  expect(ids({ sort })).toEqual(expected);
  expect(nodes.map((node) => node.id)).toEqual(['a', 'b', 'c']);
});
it('round trips combined URL filters', () => {
  const filters = readNodeFilters({
    q: 'a & b',
    tag: ['Chemistry', 'physics', 'CHEMISTRY'],
    usage: 'mine',
    lesson: 'l1',
    status: 'published',
    sort: 'za',
  });
  const url = new URL(nodeFilterUrl(filters), 'https://example.com');
  expect(readNodeFilters({ ...Object.fromEntries(url.searchParams), tag: url.searchParams.getAll('tag') })).toEqual(
    filters
  );
  expect(nodeFilterUrl(readNodeFilters({}))).toBe('/instructor/nodes');
});
it('falls back safely for invalid filter values', () => {
  expect(readNodeFilters({ status: 'bad', usage: 'bad', sort: '__proto__' })).toEqual(readNodeFilters({}));
});

it.each(['checkpoints:asc', 'checkpoints:desc', 'quiz:asc', 'quiz:desc', 'edit:asc'])(
  'resets removed column sort %s while preserving filters',
  (sort) => {
    expect(readNodeFilters({ sort, q: 'chemistry' })).toEqual({ ...readNodeFilters({}), q: 'chemistry' });
  }
);
