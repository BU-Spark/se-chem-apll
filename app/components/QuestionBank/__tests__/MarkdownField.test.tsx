import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MarkdownField from '../MarkdownField';

jest.mock('../RichMarkdownEditor', () => ({
  __esModule: true,
  default: ({
    value,
    onChange,
    contentEditableId,
    labelledBy,
    describedBy,
    invalid,
  }: {
    value: string;
    onChange: (value: string) => void;
    contentEditableId: string;
    labelledBy: string;
    describedBy?: string;
    invalid?: boolean;
  }) => (
    <textarea
      data-testid="visual-editor"
      id={contentEditableId}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      aria-invalid={invalid}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  ),
}));

describe('MarkdownField', () => {
  it('starts in visual mode and emits Markdown changes', async () => {
    const onChange = jest.fn();
    render(<MarkdownField label="Question prompt" value="" onChange={onChange} required />);

    const editor = await screen.findByRole('textbox', { name: /Question prompt/ });
    fireEvent.change(editor, { target: { value: '**Bold** and $K_a$' } });

    expect(onChange).toHaveBeenLastCalledWith('**Bold** and $K_a$');
    expect(screen.getByRole('button', { name: 'Visual' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('supports Markdown source and rendered Preview modes', async () => {
    const user = userEvent.setup();
    render(<MarkdownField label="Question prompt" value="**Bold** and $K_a$" onChange={jest.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Markdown' }));
    expect(screen.getByRole('textbox', { name: 'Question prompt' })).toHaveValue('**Bold** and $K_a$');

    await user.click(screen.getByRole('button', { name: 'Preview' }));
    expect(screen.getByText('Bold')).toHaveStyle({ fontWeight: 'bold' });
    expect(screen.getByTestId('markdown-preview').querySelector('.katex')).not.toBeNull();
  });

  it('keeps compact fields to Visual and Markdown modes', async () => {
    render(<MarkdownField label="Choice 1" value="Answer" onChange={jest.fn()} compact />);

    expect(await screen.findByRole('textbox', { name: 'Choice 1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Visual' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Markdown' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Preview' })).not.toBeInTheDocument();
  });

  it('associates validation errors with both editor modes', async () => {
    const user = userEvent.setup();
    render(<MarkdownField label="Question prompt" value="" onChange={jest.fn()} error="Prompt is required." />);

    const visualEditor = await screen.findByRole('textbox', { name: 'Question prompt' });
    expect(visualEditor).toHaveAccessibleDescription('Prompt is required.');
    expect(visualEditor).toHaveAttribute('aria-invalid', 'true');

    await user.click(screen.getByRole('button', { name: 'Markdown' }));
    const sourceEditor = screen.getByRole('textbox', { name: 'Question prompt' });
    expect(sourceEditor).toHaveAccessibleDescription('Prompt is required.');
    expect(sourceEditor).toHaveAttribute('aria-invalid', 'true');

    fireEvent.change(sourceEditor, { target: { value: 'Fixed' } });
  });
});
