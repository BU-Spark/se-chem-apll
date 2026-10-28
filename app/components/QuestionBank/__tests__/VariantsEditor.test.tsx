import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import VariantsEditor from '../VariantsEditor';
import type { ShortAnswerQuestion } from '../types';
import { validateQuestion } from '../validation';

function Harness() {
  const [question, setQuestion] = useState<ShortAnswerQuestion>({
    id: 'q',
    type: 'shortAnswer',
    prompt: 'Moles of $\\ce{ {{compound}} }$ in {{mass}} g?',
    answer: { mode: 'exact', expected: '' },
    variants: [],
  });
  return <VariantsEditor question={question} onChange={setQuestion} error={validateQuestion(question)[0]?.message} />;
}

it('authors, duplicates, previews and deletes variants with exact and range answers', () => {
  render(<Harness />);
  expect(screen.getByRole('alert')).toHaveTextContent('Add at least one variant');
  fireEvent.click(screen.getByRole('button', { name: 'Add variant' }));
  fireEvent.change(screen.getByLabelText('Variant 1 compound'), { target: { value: 'NaCl' } });
  fireEvent.change(screen.getByLabelText('Variant 1 mass'), { target: { value: '58.44' } });
  fireEvent.change(screen.getByLabelText('Variant 1 answer'), { target: { value: '1' } });
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(screen.getByText('Expected answer: 1')).toBeInTheDocument();
  expect(screen.getByTestId('question-preview').querySelector('.katex')).toBeTruthy();
  expect(screen.getByTestId('question-preview').querySelector('.katex-error')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Actions for variant 1' }));
  fireEvent.click(screen.getByRole('menuitem', { name: 'Duplicate variant' }));
  expect(screen.getByLabelText('Variant 2 mass')).toHaveValue('58.44');
  fireEvent.change(screen.getByLabelText('Variant 2 compound'), { target: { value: 'H2O' } });
  fireEvent.change(screen.getByLabelText('Variant 2 mass'), { target: { value: '36.03' } });
  fireEvent.change(screen.getByLabelText('Variant 2 answer type'), { target: { value: 'range' } });
  fireEvent.change(screen.getByLabelText('Variant 2 minimum'), { target: { value: '1.99' } });
  fireEvent.change(screen.getByLabelText('Variant 2 maximum'), { target: { value: '2.01' } });
  expect(screen.getByText('Variant 2 of 2')).toBeInTheDocument();
  expect(screen.getByText('Accepted range: 1.99–2.01')).toBeInTheDocument();
  expect(screen.getByTestId('question-preview')).toHaveTextContent('36.03');
  expect(screen.getByLabelText('Variant 1 mass')).toHaveValue('58.44');
  fireEvent.click(screen.getByRole('button', { name: 'Actions for variant 2' }));
  fireEvent.click(screen.getByRole('menuitem', { name: 'Delete variant' }));
  expect(screen.getByText('Expected answer: 1')).toBeInTheDocument();
  expect(screen.queryByLabelText('Variant 2 mass')).not.toBeInTheDocument();
});

it('links row focus and preview navigation, with keyboard-accessible row actions', async () => {
  const user = userEvent.setup();
  render(<Harness />);
  await user.click(screen.getByRole('button', { name: 'Add variant' }));
  expect(screen.getByLabelText('Variant 1 compound')).toHaveFocus();
  await user.type(screen.getByLabelText('Variant 1 compound'), 'NaCl');
  await user.click(screen.getByRole('button', { name: 'Add variant' }));
  expect(screen.getByLabelText('Variant 2 compound')).toHaveFocus();
  await user.type(screen.getByLabelText('Variant 2 compound'), 'H2O');
  expect(screen.getByText('Variant 2 of 2')).toBeInTheDocument();
  await user.click(screen.getByLabelText('Variant 1 mass'));
  expect(screen.getByText('Variant 1 of 2')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Previous variant' })).toBeDisabled();
  await user.click(screen.getByRole('button', { name: 'Next variant' }));
  expect(screen.getByRole('button', { name: 'Preview variant 2' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('button', { name: 'Next variant' })).toBeDisabled();
  const actions = screen.getByRole('button', { name: 'Actions for variant 2' });
  await user.click(actions);
  expect(screen.getByRole('menuitem', { name: 'Duplicate variant' })).toHaveFocus();
  await user.keyboard('{Escape}');
  expect(actions).toHaveFocus();
  expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  await user.keyboard('{Enter}{ArrowDown}{Enter}');
  expect(screen.queryByLabelText('Variant 2 compound')).not.toBeInTheDocument();
  expect(screen.getByLabelText('Variant 1 compound')).toHaveFocus();
  expect(screen.getByText('Variant 1 of 1')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Actions for variant 1' }));
  await user.click(screen.getByRole('menuitem', { name: 'Delete variant' }));
  expect(screen.getByRole('button', { name: 'Add variant' })).toHaveFocus();
  expect(screen.getByText('No variants')).toBeInTheDocument();
});

it('associates validation with the affected cells and keeps instructions collapsed', () => {
  render(<Harness />);
  expect(screen.getByText('How variables work').closest('details')).not.toHaveAttribute('open');
  fireEvent.click(screen.getByRole('button', { name: 'Add variant' }));
  expect(screen.getByLabelText('Variant 1 compound')).toHaveAttribute('aria-invalid', 'true');
  expect(screen.getByLabelText('Variant 1 compound')).toHaveAccessibleDescription('Required');
  expect(screen.getByLabelText('Variant 1 compound')).toHaveAttribute('placeholder', 'Required');
  expect(screen.getByLabelText('Variant 1 answer')).toHaveAttribute('placeholder', 'Required');
  fireEvent.change(screen.getByLabelText('Variant 1 answer'), { target: { value: 'abc' } });
  expect(screen.getByLabelText('Variant 1 answer')).toHaveAttribute('placeholder', 'Answer');
  expect(screen.getByLabelText('Variant 1 answer')).toHaveAccessibleDescription('Enter a number');
  fireEvent.change(screen.getByLabelText('Variant 1 answer type'), { target: { value: 'range' } });
  fireEvent.change(screen.getByLabelText('Variant 1 minimum'), { target: { value: '' } });
  expect(screen.getByLabelText('Variant 1 minimum')).toHaveAttribute('placeholder', 'Required');
  fireEvent.change(screen.getByLabelText('Variant 1 minimum'), { target: { value: '10' } });
  fireEvent.change(screen.getByLabelText('Variant 1 maximum'), { target: { value: '5' } });
  expect(screen.getByLabelText('Variant 1 maximum')).toHaveAccessibleDescription('Must be ≥ minimum');
  fireEvent.change(screen.getByLabelText('Variant 1 maximum'), { target: { value: '12' } });
  expect(screen.getByLabelText('Variant 1 maximum')).toHaveAttribute('aria-invalid', 'false');
});
