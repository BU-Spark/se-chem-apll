import { render, screen } from '@testing-library/react';
import QevItemPreview from '../QevItemPreview';
import type { FormQuestion } from '../types';

const multipleChoice: FormQuestion = {
  id: 'q-1',
  prompt: '<u>Water</u> is H<sub>2</sub>O.',
  questionType: 'multipleChoice',
  choices: ['x<sup>2</sup>', '**Two** atoms'],
  correctIndices: [1],
  answerMode: 'exact',
  expectedAnswer: '',
  minimumAnswer: '',
  maximumAnswer: '',
};

describe('QevItemPreview', () => {
  it('renders the formatted prompt, every choice, and correct-answer indicators', () => {
    render(<QevItemPreview question={multipleChoice} />);

    expect(screen.getByText('Water').tagName).toBe('U');
    expect(screen.getByText('2', { selector: 'sub' })).toBeInTheDocument();
    expect(screen.getByText('2', { selector: 'sup' })).toBeInTheDocument();
    expect(screen.getByText('Two').tagName).toBe('STRONG');
    expect(screen.getByText('Correct')).toBeInTheDocument();
  });

  it('renders numeric ranges and notes without answer-choice controls', () => {
    const { rerender } = render(
      <QevItemPreview
        question={{
          ...multipleChoice,
          questionType: 'shortAnswer',
          answerMode: 'range',
          minimumAnswer: '3.1',
          maximumAnswer: '3.2',
        }}
      />
    );
    expect(screen.getByText('Accepted range: 3.1–3.2')).toBeInTheDocument();

    rerender(<QevItemPreview question={{ ...multipleChoice, questionType: 'note', prompt: '**Notice this.**' }} />);
    expect(screen.getByText('Notice this.').tagName).toBe('STRONG');
    expect(screen.queryByText('Answer choices')).not.toBeInTheDocument();
  });
});
