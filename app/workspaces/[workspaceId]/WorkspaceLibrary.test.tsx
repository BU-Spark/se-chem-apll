import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import WorkspaceLibrary from './WorkspaceLibrary';
import type { NodeListItem } from '@/app/instructor/nodes/listFilters';
import type { LessonListItem } from '@/app/instructor/lessons/listFilters';
const nodes: NodeListItem[] = [
  {
    id: 'n1',
    workspaceId: 'chem',
    title: 'Atomic particles',
    summary: '',
    tags: ['Chemistry'],
    isDraft: false,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-02'),
    lessonNodes: [{ lesson: { id: 'l1', title: 'Atoms and ions' } }],
  },
  {
    id: 'n2',
    workspaceId: 'chem',
    title: 'Forming ions',
    summary: '',
    tags: ['Chemistry'],
    isDraft: true,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-03'),
    lessonNodes: [],
  },
];
const lessons: LessonListItem[] = [
  {
    id: 'l1',
    workspaceId: 'chem',
    title: 'Atoms and ions',
    summary: '',
    isDraft: false,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-02'),
    _count: { lessonNodes: 2 },
    courseLessons: [],
  },
];
beforeEach(() => window.history.replaceState(null, '', '/workspaces/chem'));
it('uses the instructor grids with independent filters while retaining the workspace URL', async () => {
  render(
    <WorkspaceLibrary workspaceId="chem" nodes={nodes} lessons={lessons} courses={[]} canEdit canDelete={false} />
  );
  const nodePanel = screen.getByRole('tabpanel', { name: /Nodes/ });
  expect(await within(nodePanel).findByRole('link', { name: 'Atomic particles' })).toHaveAttribute(
    'href',
    '/workspaces/chem/nodes/n1'
  );
  expect(screen.getByRole('link', { name: '+ New node' })).toHaveAttribute('href', '/workspaces/chem/nodes/new');
  fireEvent.input(within(nodePanel).getByLabelText('Title Filter Input'), { target: { value: 'atomic' } });
  await waitFor(() => expect(within(nodePanel).getByRole('status')).toHaveTextContent('1 of 2 nodes'));
  fireEvent.click(screen.getByRole('tab', { name: /Lessons/ }));
  const lessonPanel = screen.getByRole('tabpanel', { name: /Lessons/ });
  expect(await within(lessonPanel).findByRole('link', { name: 'Atoms and ions' })).toHaveAttribute(
    'href',
    '/workspaces/chem/lessons/l1'
  );
  expect(within(lessonPanel).getByLabelText('Title Filter Input')).toHaveValue('');
  expect(screen.getByRole('link', { name: '+ New lesson' })).toHaveAttribute('href', '/workspaces/chem/lessons/new');
  fireEvent.click(screen.getByRole('tab', { name: /Nodes/ }));
  expect(within(nodePanel).getByLabelText('Title Filter Input')).toHaveValue('atomic');
  expect(window.location.pathname + window.location.search).toBe('/workspaces/chem');
});
it('keeps viewer tables read-only and supports keyboard tab navigation', async () => {
  render(
    <WorkspaceLibrary
      workspaceId="chem"
      nodes={nodes.map((n) => ({ ...n, canEdit: false }))}
      lessons={lessons.map((l) => ({ ...l, canEdit: false }))}
      courses={[]}
      canEdit={false}
      canDelete={false}
    />
  );
  expect(await screen.findByRole('link', { name: 'Atomic particles' })).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: '+ New node' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Delete/ })).not.toBeInTheDocument();
  fireEvent.keyDown(screen.getByRole('tab', { name: /Nodes/ }), { key: 'ArrowRight' });
  expect(screen.getByRole('tab', { name: /Lessons/ })).toHaveAttribute('aria-selected', 'true');
  expect(screen.getByRole('tab', { name: /Lessons/ })).toHaveFocus();
  expect(screen.queryByRole('link', { name: '+ New lesson' })).not.toBeInTheDocument();
});
