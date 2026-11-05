import { render, screen } from '@testing-library/react';
import FeedbackBanner from '../FeedbackBanner';

describe('FeedbackBanner', () => {
  it('announces Correct or Incorrect', () => {
    const { rerender } = render(<FeedbackBanner correct />);
    expect(screen.getByRole('status')).toHaveTextContent('Correct');

    rerender(<FeedbackBanner correct={false} />);
    expect(screen.getByRole('status')).toHaveTextContent('Incorrect');
  });
});
