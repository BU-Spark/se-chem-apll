import { render, screen } from '@testing-library/react';
import QuizProgress from '../QuizProgress';

describe('QuizProgress', () => {
  it('shows the title and which question the student is on', () => {
    render(<QuizProgress title="Atoms Knowledge Check" filled={2} current={2} total={3} />);

    expect(screen.getByText('Atoms Knowledge Check')).toBeInTheDocument();
    expect(screen.getByText('2/3 Questions')).toBeInTheDocument();
  });

  it('hides the question count while there are no questions yet', () => {
    render(<QuizProgress title="Atoms Video Lesson" filled={0} current={1} total={0} />);

    expect(screen.queryByText(/Questions/)).not.toBeInTheDocument();
  });
});
