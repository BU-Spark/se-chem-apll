import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import NodesGrid, { sortState } from './NodesGrid';
import { readNodeFilters, type NodeListItem } from './listFilters';

// Keep AG Grid real: these tests exercise row rendering, headers, and live controls together.
const nodes: NodeListItem[] = [
  {
    id: 'a',
    title: 'Alpha',
    summary: 'Atomic structure',
    tags: ['Chemistry'],
    isDraft: false,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-03-01'),
    lessonNodes: [{ lesson: { id: 'l1', title: 'First lesson' } }, { lesson: { id: 'l1', title: 'First lesson' } }],
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
].map((node) => ({ ...node, videoUrl: null, _count: { checkpoints: 1, quizQuestions: 2 } }));
const lessons = [{ id: 'l1', title: 'First lesson', isDraft: false }];
function setup() {
  return render(<NodesGrid nodes={nodes} lessons={lessons} initialFilters={readNodeFilters({})} />);
}
beforeEach(() => window.history.replaceState(null, '', '/instructor/nodes'));

it('filters as you type and clears without submitting', async () => {
  setup();
  await screen.findByText('Alpha');
  expect(screen.queryByText('Apply filters')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Search nodes')).not.toBeInTheDocument();
  fireEvent.input(screen.getByLabelText('Title Filter Input'), { target: { value: 'alpha' } });
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('1 of 2 nodes'));
  expect(screen.queryByText('Beta')).not.toBeInTheDocument();
  await waitFor(() => expect(new URLSearchParams(window.location.search).get('filters')).toContain('alpha'));
  fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
  await waitFor(() => expect(screen.getByText('Beta')).toBeInTheDocument());
});

it('immediately shows the lesson selector and combines tags and status', async () => {
  setup();
  expect(screen.getByLabelText('My lesson')).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('My lesson'), { target: { value: 'l1' } });
  fireEvent.input(await screen.findByLabelText('Tags Filter Input'), { target: { value: 'chemistry' } });
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('1 of 2 nodes'));
  expect(await screen.findByRole('button', { name: 'View lessons using Alpha' })).toHaveTextContent('Yes');
  fireEvent.click(screen.getByRole('switch', { name: 'Drafts only' }));
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('0 of 2 nodes'));
  await waitFor(() => expect(new URLSearchParams(window.location.search).get('filters')).toContain('chemistry'));
});

it('sorts from column headers and restores default sorting', async () => {
  const { container } = setup();
  await screen.findByText('Alpha');
  const titles = () =>
    [...container.querySelectorAll('.ag-cell[col-id="title"]')]
      .sort(
        (a, b) =>
          Number(a.closest('[row-index]')?.getAttribute('row-index')) -
          Number(b.closest('[row-index]')?.getAttribute('row-index'))
      )
      .map((cell) => cell.textContent);
  await waitFor(() => expect(titles()).toEqual(['Beta', 'Alpha']));
  fireEvent.click(screen.getByText('Title'));
  await waitFor(() => expect(titles()).toEqual(['Alpha', 'Beta']));
  await waitFor(() => expect(window.location.search).toContain('sort=az'));
  fireEvent.click(screen.getByRole('button', { name: 'Reset sorting' }));
  await waitFor(() => expect(titles()).toEqual(['Beta', 'Alpha']));
});

it('restores legacy URL filters on history navigation', async () => {
  setup();
  fireEvent.click(screen.getByRole('switch', { name: 'Drafts only' }));
  act(() => {
    window.history.pushState(null, '', '/instructor/nodes?usage=mine&lesson=l1&sort=za&tag=chemistry');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  expect(screen.getByRole('switch', { name: 'Drafts only' })).not.toBeChecked();
  expect(screen.getByLabelText('My lesson')).toHaveValue('l1');
  await waitFor(() => expect(screen.getByLabelText('Tags Filter Input')).toHaveValue('chemistry'));
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('1 of 2 nodes'));
  expect(window.location.search).not.toContain('stale');
});

it('maps legacy URL sorts to grid state', () => {
  expect(sortState('created')).toEqual([{ colId: 'createdAt', sort: 'desc' }]);
  expect(sortState('za')).toEqual([{ colId: 'title', sort: 'desc' }]);
});

it('virtualizes a large library instead of mounting every row', async () => {
  const many = Array.from({ length: 5000 }, (_, index) => ({
    ...nodes[0],
    id: `node-${index}`,
    title: `Node ${index}`,
  }));
  const { container } = render(<NodesGrid nodes={many} lessons={lessons} initialFilters={readNodeFilters({})} />);
  await waitFor(() => expect(container.querySelectorAll('.ag-cell[col-id="title"]').length).toBeGreaterThan(0));
  expect(container.querySelectorAll('.ag-cell[col-id="title"]').length).toBeLessThan(100);
  expect(screen.getByRole('status')).toHaveTextContent('5000 of 5000 nodes');
});

it('uses linked titles and text statuses with only the five intended columns', async () => {
  const { container } = setup();
  const link = await screen.findByRole('link', { name: 'Alpha' });
  expect(link).toHaveAttribute('href', '/instructor/nodes/a/edit');
  link.focus();
  expect(link).toHaveFocus();
  expect(screen.getByRole('gridcell', { name: 'Published' })).toBeInTheDocument();
  expect(screen.getByRole('gridcell', { name: 'Draft' })).toBeInTheDocument();
  expect(container.querySelector('.ag-cell[col-id="isDraft"] input')).toBeNull();
  expect(
    screen
      .getAllByRole('columnheader')
      .map((header) => header.getAttribute('col-id'))
      .filter(Boolean)
  ).toEqual(['title', 'isDraft', 'tags', 'usage', 'updatedAt']);
});

it('refreshes relative timestamps on focus without changing timestamp sorting', async () => {
  const clock = jest.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-10-13T12:00:00Z'));
  try {
    render(
      <NodesGrid
        nodes={[{ ...nodes[0], updatedAt: new Date('2026-10-12T12:30:00Z') }]}
        lessons={lessons}
        initialFilters={readNodeFilters({})}
      />
    );
    expect(await screen.findByText('23 hours ago')).toBeInTheDocument();
    clock.mockReturnValue(Date.parse('2026-10-13T13:00:00Z'));
    act(() => window.dispatchEvent(new Event('focus')));
    expect(await screen.findByText('Oct 12, 2026')).toBeInTheDocument();
  } finally {
    clock.mockRestore();
  }
});

it('uses native title and boolean usage filters, then clears both', async () => {
  setup();
  fireEvent.input(await screen.findByLabelText('Title Filter Input'), { target: { value: 'beta' } });
  fireEvent.change(screen.getByLabelText('Filter lesson usage'), { target: { value: 'false' } });
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('1 of 2 nodes'));
  expect(screen.getByRole('link', { name: 'Beta' })).toBeInTheDocument();
  await waitFor(() => expect(new URLSearchParams(window.location.search).get('filters')).toContain('beta'));
  fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('2 of 2 nodes'));
  expect(screen.getByLabelText('Title Filter Input')).toHaveValue('');
});

it('restores date filters against the UTC calendar date, not the formatted label', async () => {
  const gridFilters = {
    updatedAt: { filterType: 'date', type: 'equals', dateFrom: '2026-03-01 00:00:00', dateTo: null },
  };
  render(
    <NodesGrid
      nodes={[{ ...nodes[0], updatedAt: new Date('2026-03-01T23:59:59Z') }, nodes[1]]}
      lessons={lessons}
      initialFilters={readNodeFilters({ filters: JSON.stringify(gridFilters) })}
    />
  );
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('1 of 2 nodes'));
  expect(screen.getByRole('link', { name: 'Alpha' })).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'Beta' })).not.toBeInTheDocument();
});

it('filters draft and boolean usage together and resets all controls', async () => {
  setup();
  await screen.findByRole('link', { name: 'Alpha' });
  const usage = await screen.findByLabelText('Filter lesson usage');
  await userEvent.selectOptions(usage, 'true');
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('1 of 2 nodes'));
  expect(screen.getByRole('button', { name: 'View lessons using Alpha' })).toHaveTextContent('Yes');
  fireEvent.click(screen.getByRole('switch', { name: 'Drafts only' }));
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('0 of 2 nodes'));
  fireEvent.change(usage, { target: { value: 'false' } });
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('1 of 2 nodes'));
  expect(screen.getByRole('link', { name: 'Beta' })).toBeInTheDocument();
  expect(screen.getByRole('gridcell', { name: 'No' })).toBeInTheDocument();
  expect(new URLSearchParams(window.location.search).get('drafts')).toBe('1');
  fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('2 of 2 nodes'));
  expect(screen.getByRole('switch', { name: 'Drafts only' })).not.toBeChecked();
  expect(usage).toHaveValue('');
  expect(screen.queryByLabelText('Filter status')).not.toBeInTheDocument();
});
