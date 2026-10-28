import { render, screen } from '@testing-library/react';
import QuestionPreview from '../QuestionPreview';
import { makeChoice, type AuthoringQuestion } from '../types';

const multipleChoice: AuthoringQuestion = {
  id: 'q-1',
  type: 'multipleChoice',
  prompt: '<u>Water</u> is H<sub>2</sub>O.',
  choices: [makeChoice('x<sup>2</sup>', false, 'c-1'), makeChoice('**Two** atoms', true, 'c-2')],
};

describe('QuestionPreview', () => {
  it('renders the complete formatted multiple-choice question', () => {
    render(<QuestionPreview question={multipleChoice} />);

    expect(screen.getByText('Water').tagName).toBe('U');
    expect(screen.getByText('2', { selector: 'sub' })).toBeInTheDocument();
    expect(screen.getByText('2', { selector: 'sup' })).toBeInTheDocument();
    expect(screen.getByText('Two').tagName).toBe('STRONG');
    expect(screen.getByText('Correct')).toBeInTheDocument();
  });

  it('renders exact and range short-answer values', () => {
    const { rerender } = render(
      <QuestionPreview
        question={{ id: 'q-2', type: 'shortAnswer', prompt: 'Value?', answer: { mode: 'exact', expected: '42' } }}
      />
    );
    expect(screen.getByText('Expected answer: 42')).toBeInTheDocument();

    rerender(
      <QuestionPreview
        question={{
          id: 'q-2',
          type: 'shortAnswer',
          prompt: 'Value?',
          answer: { mode: 'range', minimum: '3.1', maximum: '3.2' },
        }}
      />
    );
    expect(screen.getByText('Accepted range: 3.1–3.2')).toBeInTheDocument();
  });
});
