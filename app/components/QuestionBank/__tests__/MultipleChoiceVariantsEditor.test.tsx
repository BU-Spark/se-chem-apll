import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import QuestionDetailEditor from '../QuestionDetailEditor';
import type { AuthoringQuestion } from '../types';
import { validateQuestion } from '../validation';

jest.mock('../MarkdownField', () => ({
  __esModule: true,
  default: ({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) => (
    <textarea aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} />
  ),
}));
function Harness() {
  const [question, setQuestion] = useState<AuthoringQuestion>({
    id: 'q',
    type: 'multipleChoice',
    prompt: 'Pick the correct answers.',
    choices: [
      { id: 'a', content: 'Sodium', correct: true },
      { id: 'b', content: 'Potassium', correct: false },
      { id: 'c', content: 'Calcium', correct: false },
    ],
  });
  return (
    <QuestionDetailEditor
      question={question}
      issues={validateQuestion(question)}
      onChange={setQuestion}
      onChangeType={() => {}}
      onDuplicate={() => {}}
      onDelete={() => {}}
      onMove={() => {}}
      canMoveUp={false}
      canMoveDown={false}
    />
  );
}
function editChoice(variant: number, choice: number, content?: string) {
  fireEvent.click(screen.getByRole('button', { name: `Edit variant ${variant} choice ${choice}` }));
  const input = screen.getByLabelText(`Variant ${variant} choice ${choice}`);
  if (content !== undefined) fireEvent.change(input, { target: { value: content } });
  return input;
}
function switchView(variant: number, view: string) {
  fireEvent.click(
    within(screen.getByRole('group', { name: `Variant ${variant} view` })).getByRole('button', { name: view })
  );
}
it('keeps choices compact, edits only one at a time, and preserves independent answers across collapse and preview', () => {
  render(<Harness />);
  fireEvent.click(screen.getByRole('button', { name: 'Add question variants' }));
  expect(screen.queryByLabelText('Variant 1 choice 1')).not.toBeInTheDocument();
  expect(editChoice(1, 1)).toHaveValue('Sodium');
  fireEvent.click(screen.getByRole('button', { name: 'Done' }));
  expect(screen.getByRole('button', { name: 'Edit variant 1 choice 1' })).toHaveFocus();
  fireEvent.click(screen.getByRole('button', { name: '+ Add variant' }));
  expect(screen.getByRole('button', { name: /Variant 1 3 choices/ })).toHaveAttribute('aria-expanded', 'false');
  editChoice(2, 1, 'Hydrogen');
  editChoice(2, 2, 'Oxygen');
  expect(screen.queryByLabelText('Variant 2 choice 1')).not.toBeInTheDocument();
  fireEvent.click(screen.getByLabelText('Variant 2 choice 1 is correct'));
  fireEvent.click(screen.getByLabelText('Variant 2 choice 2 is correct'));
  switchView(2, 'Preview');
  expect(within(screen.getByTestId('question-preview')).getByText('Correct choices: A, B')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Next variant' })).not.toBeInTheDocument();
  switchView(2, 'Edit');
  expect(screen.getByLabelText('Variant 2 choice 2')).toHaveValue('Oxygen');
  fireEvent.click(screen.getByRole('button', { name: /Variant 2 2 choices/ }));
  expect(screen.queryByRole('group', { name: 'Variant 2 view' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /Variant 1 3 choices/ }));
  expect(editChoice(1, 1)).toHaveValue('Sodium');
  fireEvent.click(screen.getByRole('button', { name: 'Move choice 1 down' }));
  expect(screen.getByLabelText('Variant 1 choice 2 is correct')).toBeChecked();
  fireEvent.click(screen.getByRole('button', { name: 'Remove choice 2' }));
  expect(screen.getByText('Select at least one correct choice for this variant.')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /Variant 2 2 choices/ }));
  expect(editChoice(2, 1)).toHaveValue('Hydrogen');
  fireEvent.click(screen.getByRole('button', { name: 'Actions for variant 2' }));
  fireEvent.click(screen.getByRole('menuitem', { name: 'Duplicate variant' }));
  editChoice(3, 1, 'Nitrogen');
  fireEvent.click(screen.getByRole('button', { name: '+ Add choice' }));
  expect(screen.getByLabelText('Variant 3 choice 3')).toHaveValue('');
  fireEvent.click(screen.getByRole('button', { name: /Variant 2 2 choices/ }));
  expect(editChoice(2, 1)).toHaveValue('Hydrogen');
});

it('supports keyboard collapse, visible error counts, and focus after adding or deleting variants', async () => {
  const user = userEvent.setup();
  render(<Harness />);
  await user.click(screen.getByRole('button', { name: 'Add question variants' }));
  const header = screen.getByRole('button', { name: /Variant 1 3 choices/ });
  header.focus();
  await user.keyboard('{Enter}');
  expect(header).toHaveAttribute('aria-expanded', 'false');
  await user.keyboard(' ');
  expect(header).toHaveAttribute('aria-expanded', 'true');
  await user.click(screen.getByRole('button', { name: '+ Add variant' }));
  expect(screen.getByRole('button', { name: /Variant 2 2 choices · 0 correct 3 errors/ })).toHaveFocus();
  await user.click(screen.getByRole('button', { name: 'Actions for variant 2' }));
  await user.click(screen.getByRole('menuitem', { name: 'Delete variant' }));
  expect(header).toHaveFocus();
  expect(header).toHaveAttribute('aria-expanded', 'true');
  await user.click(screen.getByRole('button', { name: 'Actions for variant 1' }));
  await user.click(screen.getByRole('menuitem', { name: 'Delete variant' }));
  expect(screen.getByRole('button', { name: '+ Add variant' })).toHaveFocus();
});
