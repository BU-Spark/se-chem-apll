import { render, screen } from '@testing-library/react';
import NodeIncomplete from '../NodeIncomplete';

describe('NodeIncomplete', () => {
  it('points the student to their instructor and back to the lesson', () => {
    render(<NodeIncomplete correct={1} total={5} coursePercent={10} lessonHref="/lesson" />);

    expect(screen.getByRole('heading', { name: 'Node Incomplete' })).toBeInTheDocument();
    expect(screen.getByText(/Reach out to your instructor/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Return to Lesson' })).toHaveAttribute('href', '/lesson');
    expect(screen.queryByRole('link', { name: 'Retry' })).not.toBeInTheDocument();
  });
});
