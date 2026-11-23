import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import CsvImportDialog from '../CsvImportDialog';
import QuestionPreview from '../QuestionPreview';
import { authoringQuestionToPayload, dbQuestionToAuthoring } from '../adapters';
import QuizQuestionView from '../../QuizQuestionView/QuizQuestionView';
import CheckpointCsvDialog from '../../NodeForm/CheckpointCsvDialog';
import { xlsxToRows } from '@/app/utils/spreadsheetImport';
import { CHECKPOINT_CSV_HEADERS } from '@/app/utils/checkpointCsv';
import type { AuthoringQuestion } from '../types';
import ExcelJS from 'exceljs';

// Exercise ExcelJS's browser bundle, as used by Next's client build.
jest.mock('exceljs', () => jest.requireActual('exceljs/dist/exceljs.min.js'));

// Copy fixture bytes into the browser realm's ArrayBuffer.
const bytes = Uint8Array.from(readFileSync(join(process.cwd(), 'app/utils/__fixtures__/chemistry.xlsx'))).buffer;
function upload(label: string, data = bytes) {
  const file = new File(['xlsx'], 'chemistry.xlsx');
  Object.defineProperty(file, 'arrayBuffer', { value: async () => data });
  fireEvent.change(screen.getByLabelText(label), { target: { files: [file] } });
}

it('imports XLSX through the quiz dialog and renders chemistry in author and student previews', async () => {
  const onImport = jest.fn();
  const { unmount } = render(<CsvImportDialog existingCount={0} onImport={onImport} onClose={jest.fn()} />);
  expect(screen.getByLabelText('Choose CSV or Excel file')).toHaveAttribute('accept', expect.stringContaining('.xlsx'));
  upload('Choose CSV or Excel file');
  await screen.findByText('3 valid questions');
  fireEvent.click(screen.getByRole('button', { name: 'Import 3 questions' }));
  const question = onImport.mock.calls[0][0][0] as AuthoringQuestion;
  expect(question.type).toBe('multipleChoice');
  const payload = authoringQuestionToPayload(question, 0);
  const reloaded = dbQuestionToAuthoring({
    ...payload,
    id: question.id,
    correctIndices:
      question.type === 'multipleChoice'
        ? question.choices.flatMap((choice, index) => (choice.correct ? [index] : []))
        : [],
  });
  expect(reloaded.prompt).toBe(question.prompt);
  expect(reloaded.type === 'multipleChoice' && reloaded.choices.map((c) => c.content)).toEqual(
    question.type === 'multipleChoice' && question.choices.map((c) => c.content)
  );
  unmount();
  const preview = render(<QuestionPreview question={question} />);
  expect(preview.container.querySelector('sup')).toHaveTextContent('2−');
  expect(preview.container.querySelector('sub')).toHaveTextContent('2');
  expect(preview.container.querySelector('script')).toBeNull();
  expect(preview.container.querySelector('.katex')).not.toBeNull();
  preview.unmount();
  const student = render(
    <QuizQuestionView
      question={{
        id: question.id,
        prompt: question.prompt,
        choices: question.type === 'multipleChoice' ? question.choices.map((c) => c.content) : null,
        allowsMultiple: true,
      }}
      answer={undefined}
      onSelect={jest.fn()}
      onType={jest.fn()}
    />
  );
  expect(student.container.querySelector('sup')).toHaveTextContent('2−');
  expect(student.container.querySelector('sub')).toHaveTextContent('2');
  expect(student.container.querySelector('script')).toBeNull();
});

it('imports XLSX through the checkpoint dialog with the same content conversion', async () => {
  const rows = await xlsxToRows(bytes as unknown as ArrayBuffer);
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet('Checkpoints');
  sheet.addRow([...CHECKPOINT_CSV_HEADERS]);
  sheet.addRow(['chem', '1', '1', '', '', ...rows[1].slice(2)]);
  // Supply actual rich text rather than already-converted markup.
  const original = new ExcelJS.Workbook();
  await original.xlsx.load(bytes as unknown as ArrayBuffer);
  sheet.getCell('G2').value = original.worksheets[0].getCell('D2').value;
  const data = new Uint8Array((await book.xlsx.writeBuffer()) as ArrayBuffer).buffer;
  const onApply = jest.fn();
  render(<CheckpointCsvDialog existing={[]} onApply={onApply} onClose={jest.fn()} />);
  upload('Choose checkpoint CSV or Excel file', data);
  await screen.findByText('1 checkpoints · 1 items · 1 need timestamps');
  fireEvent.click(screen.getByRole('button', { name: 'Import and assign timestamps' }));
  expect(onApply.mock.calls[0][0][0].questions[0].prompt).toContain('H<sub>2</sub>');
});

it('ignores a previous quiz upload while a newer upload is pending', async () => {
  let resolve!: (text: string) => void;
  const slow = new File(['slow'], 'slow.csv');
  Object.defineProperty(slow, 'text', {
    value: () =>
      new Promise<string>((done) => {
        resolve = done;
      }),
  });
  render(<CsvImportDialog existingCount={0} onImport={jest.fn()} onClose={jest.fn()} />);
  const input = screen.getByLabelText('Choose CSV or Excel file');
  fireEvent.change(input, { target: { files: [slow] } });
  upload('Choose CSV or Excel file');
  await screen.findByText('3 valid questions');
  resolve('bad');
  await waitFor(() => expect(screen.getByText('3 valid questions')).toBeInTheDocument());
  expect(screen.queryByLabelText('Import errors')).not.toBeInTheDocument();
});
