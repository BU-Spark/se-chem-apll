import { render, screen } from '@testing-library/react';
import LessonCard from '../LessonCard';

describe('LessonCard', () => {
  it('names the lesson and its status for screen readers and links to its page', () => {
    render(<LessonCard number={2} title="Acids" status="IN_PROGRESS" isCurrent={false} href="/lesson" />);

    const card = screen.getByRole('link', { name: 'Lesson 2: Acids, In progress' });
    expect(card).toHaveAttribute('href', '/lesson');
    expect(card).not.toHaveAttribute('aria-current');
  });

  it('marks the current lesson', () => {
    render(<LessonCard number={1} title="Atoms" status="NOT_STARTED" isCurrent href="/lesson" />);
    expect(screen.getByRole('link', { name: /Lesson 1: Atoms/ })).toHaveAttribute('aria-current', 'step');
  });

  it('shows a checkmark only on completed lessons', () => {
    const { rerender } = render(<LessonCard number={1} title="Atoms" status="COMPLETED" isCurrent={false} href="/l" />);
    expect(screen.getByText('✓')).toBeInTheDocument();

    rerender(<LessonCard number={1} title="Atoms" status="NOT_STARTED" isCurrent={false} href="/l" />);
    expect(screen.queryByText('✓')).not.toBeInTheDocument();
  });
});
