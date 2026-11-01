import { render, screen, within } from '@testing-library/react';
import CourseCard from '../CourseCard';

describe('CourseCard', () => {
  it('links to its destination and shows title, description, progress and status', () => {
    render(<CourseCard title="Organic Chemistry" description="Carbon reactions." percent={98} href="/somewhere" />);

    const card = screen.getByRole('link', { name: /Organic Chemistry/ });
    expect(card).toHaveAttribute('href', '/somewhere');
    expect(within(card).getByText('Carbon reactions.')).toBeInTheDocument();
    expect(within(card).getByLabelText('98% complete')).toHaveTextContent('98%');
    expect(within(card).getByText('In progress')).toBeInTheDocument();
  });

  it('omits the description when there is none', () => {
    const { container } = render(<CourseCard title="Lab Safety" description={null} percent={0} href="/somewhere" />);
    // Only the title and status paragraphs are rendered.
    expect(container.querySelectorAll('p')).toHaveLength(2);
  });
});
