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
    onMarkdownError,
  }: {
    value: string;
    onChange: (value: string) => void;
    contentEditableId: string;
    labelledBy: string;
    describedBy?: string;
    invalid?: boolean;
    onMarkdownError: (message: string) => void;
  }) => (
    <textarea
      data-testid="visual-editor"
      id={contentEditableId}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      aria-invalid={invalid}
      value={value}
      ref={() => {
        mockMarkdownError = onMarkdownError;
      }}
      onChange={(event) => onChange(event.target.value)}
    />
  ),
}));

describe('MarkdownField', () => {
  it('renders the controlled visual mode and emits Markdown changes', async () => {
    const onChange = jest.fn();
    render(
      <MarkdownField
        label="Question prompt"
        value=""
        onChange={onChange}
        mode="visual"
        onModeChange={jest.fn()}
        required
      />
    );

    const editor = await screen.findByRole('textbox', { name: /Question prompt/ });
    fireEvent.change(editor, { target: { value: '**Bold** and $K_a$' } });

    expect(onChange).toHaveBeenLastCalledWith('**Bold** and $K_a$');
    expect(screen.queryByRole('button', { name: 'Visual' })).not.toBeInTheDocument();
  });

  it('renders controlled Markdown source and Preview modes', () => {
    const props = {
      label: 'Question prompt',
      value: '**Bold** and $K_a$',
      onChange: jest.fn(),
      onModeChange: jest.fn(),
    };
    const { rerender } = render(<MarkdownField {...props} mode="source" />);
    expect(screen.getByRole('textbox', { name: 'Question prompt' })).toHaveValue('**Bold** and $K_a$');

    rerender(<MarkdownField {...props} mode="preview" />);
    expect(screen.getByText('Bold')).toHaveStyle({ fontWeight: 'bold' });
    expect(screen.getByTestId('markdown-preview').querySelector('.katex')).not.toBeNull();
  });

  it('renders a compact preview for an answer choice', () => {
    render(
      <MarkdownField
        label="Choice 1"
        value="**Answer**"
        onChange={jest.fn()}
        mode="preview"
        onModeChange={jest.fn()}
        compact
      />
    );

    expect(screen.getByText('Answer')).toHaveStyle({ fontWeight: 'bold' });
    expect(screen.getByLabelText('Choice 1')).toBeInTheDocument();
  });

  it('associates validation errors with both editor modes', async () => {
    const props = {
      label: 'Question prompt',
      value: '',
      onChange: jest.fn(),
      onModeChange: jest.fn(),
      error: 'Prompt is required.',
    };
    const { rerender } = render(<MarkdownField {...props} mode="visual" />);

    const visualEditor = await screen.findByRole('textbox', { name: 'Question prompt' });
    expect(visualEditor).toHaveAccessibleDescription('Prompt is required.');
    expect(visualEditor).toHaveAttribute('aria-invalid', 'true');

    rerender(<MarkdownField {...props} mode="source" />);
    const sourceEditor = screen.getByRole('textbox', { name: 'Question prompt' });
    expect(sourceEditor).toHaveAccessibleDescription('Prompt is required.');
    expect(sourceEditor).toHaveAttribute('aria-invalid', 'true');

    fireEvent.change(sourceEditor, { target: { value: 'Fixed' } });
  });

  it('requests Markdown mode when content cannot be opened visually', async () => {
    const onModeChange = jest.fn();
    render(
      <MarkdownField
        label="Question prompt"
        value="Unsupported content"
        onChange={jest.fn()}
        mode="visual"
        onModeChange={onModeChange}
      />
    );
    await screen.findByRole('textbox', { name: 'Question prompt' });

    act(() => mockMarkdownError?.('Parse failed'));

    expect(onModeChange).toHaveBeenCalledWith('source');
    expect(screen.getByRole('alert')).toHaveTextContent('This content could not be opened visually.');
  });
});
