import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import QuizQuestionView from '../QuizQuestionView';

jest.mock('@/app/components/QuestionBank/MarkdownPreview', () => ({
  __esModule: true,
  default: ({ content }: { content: string }) => <span>{content}</span>,
}));

const question = (allowsMultiple: boolean) => ({ id: 'q', prompt: 'Pick', choices: ['H', 'He', 'Li'], allowsMultiple });

describe('QuizQuestionView', () => {
  it('picks one answer when only one choice is correct', async () => {
    const onSelect = jest.fn();
    render(
      <QuizQuestionView
        question={question(false)}
        answer={{ selectedIndices: [0] }}
        onSelect={onSelect}
        onType={jest.fn()}
      />
    );

    expect(screen.getByRole('radiogroup', { name: 'Choose one answer' })).toBeInTheDocument();
    expect(screen.queryByText('Select all that apply')).not.toBeInTheDocument();
    await userEvent.click(screen.getAllByRole('radio')[2]);
    expect(onSelect).toHaveBeenCalledWith([2]);
  });

  it('adds and removes answers when several choices are correct', async () => {
    const onSelect = jest.fn();
    render(
      <QuizQuestionView
        question={question(true)}
        answer={{ selectedIndices: [0] }}
        onSelect={onSelect}
        onType={jest.fn()}
      />
    );

    expect(screen.getByText('Select all that apply')).toBeInTheDocument();
    const boxes = screen.getAllByRole('checkbox');
    expect(boxes[0]).toHaveAttribute('aria-checked', 'true');
    await userEvent.click(boxes[2]);
    expect(onSelect).toHaveBeenLastCalledWith([0, 2]);
    await userEvent.click(boxes[0]);
    expect(onSelect).toHaveBeenLastCalledWith([]);
  });

  it('asks for a number when the question has no choices', async () => {
    const onType = jest.fn();
    render(
      <QuizQuestionView
        question={{ id: 'q', prompt: 'How many?', choices: null, allowsMultiple: false }}
        answer={{ rawAnswer: 'abc' }}
        onSelect={jest.fn()}
        onType={onType}
      />
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Please enter a number');
    await userEvent.type(screen.getByRole('textbox'), '7');
    expect(onType).toHaveBeenCalled();
  });
});
