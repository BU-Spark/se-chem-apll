import { act, fireEvent, render, screen } from '@testing-library/react';
import MarkdownField from '../MarkdownField';

let mockMarkdownError: ((message: string) => void) | undefined;

jest.mock('../RichMarkdownEditor', () => ({
  __esModule: true,
  default: ({
    value,
    onChange,
    contentEditableId,
    labelledBy,
    describedBy,
    invalid,
    placeholder,
    onMarkdownError,
  }: {
    value: string;
    onChange: (value: string) => void;
    contentEditableId: string;
    labelledBy: string;
    describedBy?: string;
    invalid?: boolean;
    placeholder?: string;
    onMarkdownError: (message: string) => void;
  }) => (
    <textarea
      data-testid="visual-editor"
      id={contentEditableId}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      aria-invalid={invalid}
      value={value}
      placeholder={placeholder}
      ref={() => {
        mockMarkdownError = onMarkdownError;
      }}
      onChange={(event) => onChange(event.target.value)}
    />
  ),
}));

describe('MarkdownField', () => {
  beforeEach(() => {
    mockMarkdownError = undefined;
  });

  it('renders the visual editor and emits Markdown-backed changes', async () => {
    const onChange = jest.fn();
    render(<MarkdownField label="Question prompt" value="" onChange={onChange} required />);

    const editor = await screen.findByRole('textbox', { name: /Question prompt/ });
    fireEvent.change(editor, { target: { value: '**Bold** and $K_a$' } });

    expect(onChange).toHaveBeenLastCalledWith('**Bold** and $K_a$');
    expect(screen.queryByRole('group', { name: 'Editor mode' })).not.toBeInTheDocument();
  });

  it('associates validation errors with the visual editor', async () => {
    render(<MarkdownField label="Question prompt" value="" onChange={jest.fn()} error="Prompt is required." />);

    const visualEditor = await screen.findByRole('textbox', { name: 'Question prompt' });
    expect(visualEditor).toHaveAccessibleDescription('Prompt is required.');
    expect(visualEditor).toHaveAttribute('aria-invalid', 'true');
  });

  it('shows required choice validation inside the field and restores the normal placeholder after editing', async () => {
    const { rerender } = render(
      <MarkdownField
        label="Choice 1"
        compact
        value=""
        onChange={jest.fn()}
        placeholder="Enter a choice"
        error="Choice text is required."
      />
    );
    const editor = await screen.findByRole('textbox', { name: 'Choice 1' });
    expect(editor).toHaveAttribute('placeholder', 'Required');
    expect(editor).toHaveAccessibleDescription('Choice text is required.');
    expect(screen.getByRole('alert')).toHaveClass('srOnly');
    rerender(
      <MarkdownField label="Choice 1" compact value="Water" onChange={jest.fn()} placeholder="Enter a choice" />
    );
    expect(editor).toHaveAttribute('placeholder', 'Enter a choice');
    expect(editor).toHaveAttribute('aria-invalid', 'false');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('offers a field-level source repair fallback when content cannot be opened visually', async () => {
    const onChange = jest.fn();
    render(<MarkdownField label="Question prompt" value="Unsupported content" onChange={onChange} />);
    await screen.findByRole('textbox', { name: 'Question prompt' });

    act(() => mockMarkdownError?.('Parse failed'));

    expect(screen.getByRole('alert')).toHaveTextContent('This content could not be opened visually.');
    const repairEditor = screen.getByRole('textbox', { name: 'Question prompt' });
    fireEvent.change(repairEditor, { target: { value: 'Repaired content' } });
    expect(onChange).toHaveBeenLastCalledWith('Repaired content');

    fireEvent.click(screen.getByRole('button', { name: 'Try visual editor again' }));
    expect(await screen.findByTestId('visual-editor')).toBeInTheDocument();
  });
});
