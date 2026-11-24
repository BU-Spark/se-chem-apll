import { render, screen } from '@testing-library/react';
import FeedbackBanner from '../FeedbackBanner';

jest.mock('@/app/components/QuestionBank/MarkdownPreview', () => ({
  __esModule: true,
  default: ({ content }: { content: string }) => <span>{content}</span>,
}));

describe('FeedbackBanner', () => {
  it('announces Correct or Incorrect', () => {
    const { rerender } = render(<FeedbackBanner correct />);
    expect(screen.getByRole('status')).toHaveTextContent('Correct');

    rerender(<FeedbackBanner correct={false} />);
    expect(screen.getByRole('status')).toHaveTextContent('Incorrect');
  });

  it("shows the instructor's explanation when there is one", () => {
    const { rerender } = render(<FeedbackBanner correct={false} explanation="Count the electrons." />);
    expect(screen.getByRole('status')).toHaveTextContent('IncorrectCount the electrons.');

    rerender(<FeedbackBanner correct explanation={null} />);
    expect(screen.getByRole('status')).toHaveTextContent(/^Correct$/);
  });
});
