import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import WorkspacesGrid from './WorkspacesGrid';
it('uses the instructor table with workspace links, roles, counts and native column filters', async () => {
  render(
    <WorkspacesGrid
      workspaces={[
        {
          id: 'chem',
          name: 'Chemistry',
          role: 'Owner',
          nodeCount: 6,
          lessonCount: 3,
          updatedAt: new Date('2026-11-23'),
        },
        {
          id: 'physics',
          name: 'Physics',
          role: 'Editor',
          nodeCount: 2,
          lessonCount: 1,
          updatedAt: new Date('2026-11-22'),
        },
      ]}
    />
  );
  expect(await screen.findByRole('link', { name: 'Chemistry' })).toHaveAttribute('href', '/workspaces/chem');
  expect(screen.getByRole('columnheader', { name: /Your role/ })).toBeInTheDocument();
  expect(screen.getByRole('columnheader', { name: /Nodes/ })).toBeInTheDocument();
  fireEvent.input(screen.getByLabelText('Name Filter Input'), { target: { value: 'chemistry' } });
  await waitFor(() => expect(screen.queryByRole('link', { name: 'Physics' })).not.toBeInTheDocument());
  expect(screen.getByRole('link', { name: 'Chemistry' })).toBeInTheDocument();
});
it('shows a compact empty state', () => {
  render(<WorkspacesGrid workspaces={[]} />);
  expect(screen.getByText(/No workspaces yet/)).toBeInTheDocument();
});
