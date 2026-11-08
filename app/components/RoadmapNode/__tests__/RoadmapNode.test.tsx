import { render, screen } from '@testing-library/react';
import RoadmapNode from '../RoadmapNode';

describe('RoadmapNode', () => {
  it('is a button named with its title, type, and status', () => {
    render(<RoadmapNode title="Atoms" isFoundational status="NOT_STARTED" />);
    expect(screen.getByRole('button', { name: 'Atoms, Foundational, Not started' })).toBeInTheDocument();
  });

  it('shows the same info in its tooltip', () => {
    render(<RoadmapNode title="Bonds" isFoundational={false} status="LOCKED" />);
    expect(screen.getByText('Bonds')).toBeInTheDocument();
    expect(screen.getByText('Regular · Locked')).toBeInTheDocument();
  });

  it('marks a node without a link as unavailable, and a linked node as available', () => {
    const { rerender } = render(<RoadmapNode title="Atoms" isFoundational status="NOT_STARTED" />);
    expect(screen.getByRole('button', { name: /Atoms/ })).toHaveAttribute('aria-disabled', 'true');

    rerender(<RoadmapNode title="Atoms" isFoundational status="NOT_STARTED" href="/node" />);
    expect(screen.getByRole('link', { name: /Atoms/ })).not.toHaveAttribute('aria-disabled');
  });

  it('labels nodes in progress', () => {
    render(<RoadmapNode title="Atoms" isFoundational={false} status="IN_PROGRESS" href="/node" />);
    expect(screen.getByRole('link', { name: 'Atoms, Regular, In progress' })).toBeInTheDocument();
  });

  it('labels completed nodes', () => {
    render(<RoadmapNode title="Atoms" isFoundational={false} status="COMPLETED" />);
    expect(screen.getByRole('button', { name: 'Atoms, Regular, Completed' })).toBeInTheDocument();
  });

  it('labels incomplete nodes', () => {
    render(<RoadmapNode title="Atoms" isFoundational status="INCOMPLETE" href="/node" />);
    expect(screen.getByRole('link', { name: 'Atoms, Foundational, Incomplete' })).toHaveAttribute('href', '/node');
  });
});
