import { render, screen } from '@testing-library/react';
import NodeComplete from '../NodeComplete';

describe('NodeComplete', () => {
  it('shows the score, course progress, and a way back to the lesson', () => {
    render(<NodeComplete lessonHref="/lesson" correct={5} total={5} coursePercent={10} />);

    expect(screen.getByRole('heading', { name: 'Node Complete' })).toBeInTheDocument();
    expect(screen.getByText(/5\/5/)).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Course complete' })).toHaveAttribute('aria-valuenow', '10');
    expect(screen.getByRole('link', { name: 'Return to Lesson' })).toHaveAttribute('href', '/lesson');
  });
});
