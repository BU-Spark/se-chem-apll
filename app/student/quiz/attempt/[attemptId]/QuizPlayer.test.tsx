import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import QuizPlayer from './QuizPlayer';
import type { StudentQuizQuestion } from '@/app/utils/studentQuizQuestion';

jest.mock('@/app/components/QuestionBank/MarkdownPreview', () => ({
  __esModule: true,
  default: ({ content }: { content: string }) => <span>{content}</span>,
}));

const questions: StudentQuizQuestion[] = [
  { id: 'q1', prompt: 'Which is a solid?', type: 'multipleChoice', choices: ['Ice', 'Steam'], allowsMultiple: false },
  {
    id: 'q2',
    prompt: 'Pick the metals',
    type: 'multipleChoice',
    choices: ['Iron', 'Neon', 'Gold'],
    allowsMultiple: true,
  },
  { id: 'q3', prompt: 'pH of water?', type: 'shortAnswer' },
];

function renderQuiz() {
  return render(<QuizPlayer title="Node 1 Assessment" questions={questions} />);
}

describe('QuizPlayer', () => {
  it('shows one question at a time with progress', () => {
    renderQuiz();
    expect(screen.getByText('Which is a solid?')).toBeInTheDocument();
    expect(screen.queryByText('Pick the metals')).not.toBeInTheDocument();
    expect(screen.getByText('1/3 Questions')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Back' })).not.toBeInTheDocument();
  });

  it('enables Next only after answering', async () => {
    const user = userEvent.setup();
    renderQuiz();

    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
    await user.click(screen.getByRole('radio', { name: /Ice/ }));
    expect(screen.getByRole('radio', { name: /Ice/ })).toHaveAttribute('aria-checked', 'true');
    await user.click(screen.getByRole('button', { name: 'Next' }));

    expect(screen.getByText('Pick the metals')).toBeInTheDocument();
    expect(screen.getByText('2/3 Questions')).toBeInTheDocument();
  });

  it('lets single-choice questions have only one selection', async () => {
    const user = userEvent.setup();
    renderQuiz();

    await user.click(screen.getByRole('radio', { name: /Ice/ }));
    await user.click(screen.getByRole('radio', { name: /Steam/ }));
    expect(screen.getByRole('radio', { name: /Ice/ })).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByRole('radio', { name: /Steam/ })).toHaveAttribute('aria-checked', 'true');
  });

  it('lets multi-answer questions toggle several choices', async () => {
    const user = userEvent.setup();
    renderQuiz();
    await user.click(screen.getByRole('radio', { name: /Ice/ }));
    await user.click(screen.getByRole('button', { name: 'Next' }));

    expect(screen.getByText('Select all that apply.')).toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: /Iron/ }));
    await user.click(screen.getByRole('checkbox', { name: /Gold/ }));
    await user.click(screen.getByRole('checkbox', { name: /Iron/ }));
    expect(screen.getByRole('checkbox', { name: /Iron/ })).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByRole('checkbox', { name: /Gold/ })).toHaveAttribute('aria-checked', 'true');
  });

  it('Back returns to the previous question with its answer kept', async () => {
    const user = userEvent.setup();
    renderQuiz();

    await user.click(screen.getByRole('radio', { name: /Steam/ }));
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: 'Back' }));

    expect(screen.getByText('1/3 Questions')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Steam/ })).toHaveAttribute('aria-checked', 'true');
  });

  it('shows a number input and a Submit button on the last question', async () => {
    const user = userEvent.setup();
    renderQuiz();
    await user.click(screen.getByRole('radio', { name: /Ice/ }));
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('checkbox', { name: /Iron/ }));
    await user.click(screen.getByRole('button', { name: 'Next' }));

    await user.type(screen.getByRole('textbox', { name: /Your answer/ }), '7');
    expect(screen.getByRole('textbox', { name: /Your answer/ })).toHaveValue('7');
    expect(screen.queryByRole('button', { name: 'Next' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Submit' })).toBeInTheDocument();
  });

  it('has no "I\u2019m Not Sure" option', () => {
    renderQuiz();
    expect(screen.queryByRole('button', { name: /Not Sure/ })).not.toBeInTheDocument();
  });
});
