import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import QuestionEditor from '../QuestionEditor';
import type { FormQuestion } from '../types';

jest.mock('@/app/components/QuestionBank/MarkdownField', () => ({
  __esModule: true,
  default: ({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) => (
    <label>
      {label}
      <input aria-label={label} value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  ),
}));

const initialQuestion: FormQuestion = {
  id: 'q-1',
  prompt: '**Initial question**',
  questionType: 'multipleChoice',
  choices: ['First', '*Second*'],
  correctIndices: [1],
  answerMode: 'exact',
  expectedAnswer: '',
  minimumAnswer: '',
  maximumAnswer: '',
};

function Harness() {
  const [question, setQuestion] = useState(initialQuestion);
  return (
    <QuestionEditor
      q={question}
      index={0}
      expanded
      onToggle={jest.fn()}
      onUpdate={(patch) => setQuestion((current) => ({ ...current, ...patch }))}
      onRemove={jest.fn()}
      onUpdateChoice={(index, value) =>
        setQuestion((current) => ({
          ...current,
          choices: current.choices.map((choice, choiceIndex) => (choiceIndex === index ? value : choice)),
        }))
      }
      onAddChoice={jest.fn()}
      onRemoveChoice={jest.fn()}
      canRemove
      allowNotes
    />
  );
}

describe('QuestionEditor', () => {
  it('toggles a checkpoint question between editing and a complete live preview', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.clear(screen.getByRole('textbox', { name: 'Question prompt' }));
    await user.type(screen.getByRole('textbox', { name: 'Question prompt' }), '<u>Updated</u> question');
    await user.click(screen.getByRole('button', { name: 'Preview' }));

    expect(screen.getByRole('button', { name: 'Preview' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Updated').tagName).toBe('U');
    expect(screen.getByText('First')).toBeInTheDocument();
    expect(screen.getByText('Second').tagName).toBe('EM');
    expect(screen.getByText('Correct')).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Question prompt' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.getByRole('textbox', { name: 'Question prompt' })).toHaveValue('<u>Updated</u> question');
  });
});

it('edits and previews both feedback fields, and clears them when converting to a note', async () => {
  const user = userEvent.setup();
  render(<Harness />);
  await user.type(screen.getByRole('textbox', { name: 'Feedback for correct answer (optional)' }), '**Good work**');
  await user.type(screen.getByRole('textbox', { name: 'Feedback for incorrect answer (optional)' }), '*Check units*');
  await user.click(screen.getByRole('button', { name: 'Preview' }));
  expect(screen.getByText('Good work').tagName).toBe('STRONG');
  expect(screen.getByText('Check units').tagName).toBe('EM');
  await user.click(screen.getByRole('button', { name: 'Edit' }));
  await user.selectOptions(screen.getByRole('combobox'), 'note');
  expect(screen.queryByRole('textbox', { name: 'Feedback for correct answer (optional)' })).not.toBeInTheDocument();
  await user.selectOptions(screen.getByRole('combobox'), 'multipleChoice');
  expect(screen.getByRole('textbox', { name: 'Feedback for correct answer (optional)' })).toHaveValue('');
  expect(screen.getByRole('textbox', { name: 'Feedback for incorrect answer (optional)' })).toHaveValue('');
});
