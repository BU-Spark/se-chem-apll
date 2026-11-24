import { render, screen } from '@testing-library/react';
import InstructorShell from './InstructorShell';
jest.mock('@clerk/nextjs', () => ({ UserButton: () => <button aria-label="Account" /> }));
jest.mock('next/navigation', () => ({ usePathname: () => '/workspaces/chem/members' }));
it('reuses the instructor navigation and marks workspace child routes active', () => {
  render(
    <InstructorShell user={{ appRole: 'INSTRUCTOR', platformRole: 'MEMBER' }}>
      <h1>Chemistry</h1>
    </InstructorShell>
  );
  expect(screen.getByRole('link', { name: 'Workspaces' })).toHaveAttribute('aria-current', 'page');
  expect(screen.getByRole('link', { name: 'Nodes' })).toHaveAttribute('href', '/instructor/nodes');
  expect(screen.getByRole('link', { name: 'Courses' })).toHaveAttribute('href', '/instructor/courses');
  expect(screen.getByRole('main')).toContainElement(screen.getByRole('heading', { name: 'Chemistry' }));
  expect(screen.queryByRole('link', { name: 'Administration' })).not.toBeInTheDocument();
});
it('supports invited students without exposing instructor navigation', () => {
  render(
    <InstructorShell user={{ appRole: 'STUDENT', platformRole: 'MEMBER' }}>
      <h1>Shared library</h1>
    </InstructorShell>
  );
  expect(screen.getByRole('link', { name: 'Workspaces' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'My dashboard' })).toHaveAttribute('href', '/student');
  expect(screen.queryByRole('link', { name: 'Nodes' })).not.toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'Courses' })).not.toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'Students' })).not.toBeInTheDocument();
});
it('retains platform-admin navigation even in student mode', () => {
  render(<InstructorShell user={{ appRole: 'STUDENT', platformRole: 'ADMIN' }}>Library</InstructorShell>);
  expect(screen.getByRole('link', { name: 'Administration' })).toHaveAttribute('href', '/admin');
  expect(screen.getByRole('link', { name: 'Courses' })).toBeInTheDocument();
});
