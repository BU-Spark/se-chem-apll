import { render, screen } from '@testing-library/react';
import LessonRoadmap from '../LessonRoadmap';

const nodes = [
  { id: 'a', title: 'Atoms', isFoundational: true, status: 'NOT_STARTED' as const },
  { id: 'b', title: 'Bonds', isFoundational: false, status: 'LOCKED' as const },
  { id: 'c', title: 'Gases', isFoundational: false, status: 'LOCKED' as const },
];
const edges = [
  { sourceId: 'a', targetId: 'b' },
  { sourceId: 'a', targetId: 'c' },
];
const nodeHref = (id: string) => `/node/${id}`;

function leftOf(name: RegExp) {
  return parseFloat((screen.getByLabelText(name).parentElement as HTMLElement).style.left);
}

describe('LessonRoadmap', () => {
  it('shows every node and a line for every arrow', () => {
    const { container } = render(<LessonRoadmap nodes={nodes} edges={edges} nodeHref={nodeHref} />);
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    expect(container.querySelectorAll('line')).toHaveLength(2);
  });

  it('lays nodes out left to right along their arrows', () => {
    render(<LessonRoadmap nodes={nodes} edges={edges} nodeHref={nodeHref} />);
    expect(leftOf(/Atoms/)).toBeLessThan(leftOf(/Bonds/));
    expect(leftOf(/Bonds/)).toBe(leftOf(/Gases/));
  });

  it('links nodes the student can open, but not locked ones', () => {
    render(<LessonRoadmap nodes={nodes} edges={edges} nodeHref={nodeHref} />);
    expect(screen.getByRole('link', { name: /Atoms/ })).toHaveAttribute('href', '/node/a');
    expect(screen.getByRole('button', { name: /Bonds, Regular, Locked/ })).toBeInTheDocument();
  });
});
