import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import RichMarkdownEditor from '../RichMarkdownEditor';
import { normalizeVisualMarkdown } from '../normalizeVisualMarkdown';

type ToolbarPlugin = { kind: 'toolbar'; toolbarContents: () => React.ReactNode };

jest.mock('@mdxeditor/editor', () => {
  const ReactRuntime = jest.requireActual<typeof React>('react');

  return {
    MDXEditor: ReactRuntime.forwardRef(
      (
        {
          markdown,
          onChange,
          plugins,
        }: {
          markdown: string;
          onChange: (value: string) => void;
          plugins: ToolbarPlugin[];
        },
        ref: React.ForwardedRef<{ setMarkdown: (value: string) => void }>
      ) => {
        const [value, setValue] = ReactRuntime.useState(markdown);
        ReactRuntime.useImperativeHandle(ref, () => ({ setMarkdown: setValue }));
        const toolbar = plugins.find((plugin) => plugin.kind === 'toolbar');
        return (
          <div>
            <div role="toolbar">{toolbar?.toolbarContents()}</div>
            <div
              role="textbox"
              contentEditable
              suppressContentEditableWarning
              onInput={(event) => {
                const nextValue = event.currentTarget.textContent ?? '';
                setValue(nextValue);
                onChange(nextValue);
              }}
            >
              {value}
            </div>
          </div>
        );
      }
    ),
    toolbarPlugin: (config: Omit<ToolbarPlugin, 'kind'>) => ({ kind: 'toolbar', ...config }),
    listsPlugin: () => ({ kind: 'lists' }),
    linkPlugin: () => ({ kind: 'link' }),
    linkDialogPlugin: () => ({ kind: 'link-dialog' }),
    UndoRedo: () => (
      <>
        <button type="button" aria-label="Undo" />
        <button type="button" aria-label="Redo" />
      </>
    ),
    Separator: () => <span role="separator" />,
    BoldItalicUnderlineToggles: ({ options }: { options: string[] }) => (
      <>
        {options.map((option) => (
          <button type="button" aria-label={option} key={option} />
        ))}
      </>
    ),
    StrikeThroughSupSubToggles: ({ options }: { options: string[] }) => (
      <>
        {options.map((option) => (
          <button type="button" aria-label={option === 'Sup' ? 'Superscript' : 'Subscript'} key={option} />
        ))}
      </>
    ),
    ListsToggle: ({ options }: { options: string[] }) => (
      <>
        {options.map((option) => (
          <button type="button" aria-label={`${option} list`} key={option} />
        ))}
      </>
    ),
    CreateLink: () => <button type="button" aria-label="Create link" />,
  };
});

const baseProps = {
  value: 'Existing $K_a$',
  onChange: jest.fn(),
  contentEditableId: 'question-prompt',
  labelledBy: 'question-prompt-label',
  onMarkdownError: jest.fn(),
};

describe('RichMarkdownEditor', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('provides the constrained full toolbar and accessible editor', () => {
    render(
      <div>
        <span id="question-prompt-label">Question prompt</span>
        <RichMarkdownEditor {...baseProps} />
      </div>
    );

    const editor = screen.getByRole('textbox', { name: 'Question prompt' });
    expect(editor).toHaveTextContent('Existing $K_a$');
    expect(screen.getByRole('button', { name: 'Bold' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Italic' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Underline' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Superscript' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Subscript' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'bullet list' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'number list' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create link' })).toBeInTheDocument();
  });

  it('uses a reduced toolbar and prevents new paragraphs for compact choices', () => {
    render(
      <div>
        <span id="question-prompt-label">Choice 1</span>
        <RichMarkdownEditor {...baseProps} compact />
      </div>
    );

    const editor = screen.getByRole('textbox', { name: 'Choice 1' });
    expect(screen.getByRole('button', { name: 'Bold' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Underline' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Superscript' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Subscript' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'bullet list' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Create link' })).not.toBeInTheDocument();
    expect(fireEvent.keyDown(editor, { key: 'Enter' })).toBe(false);
  });

  it('synchronizes a newly selected question without emitting a stale change', () => {
    const onChange = jest.fn();
    const { rerender } = render(
      <div>
        <span id="question-prompt-label">Question prompt</span>
        <RichMarkdownEditor {...baseProps} onChange={onChange} />
      </div>
    );

    rerender(
      <div>
        <span id="question-prompt-label">Question prompt</span>
        <RichMarkdownEditor {...baseProps} value="Second question" onChange={onChange} />
      </div>
    );

    expect(screen.getByRole('textbox', { name: 'Question prompt' })).toHaveTextContent('Second question');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('emits edited Markdown while leaving LaTeX as text', () => {
    const onChange = jest.fn();
    render(
      <div>
        <span id="question-prompt-label">Question prompt</span>
        <RichMarkdownEditor {...baseProps} onChange={onChange} />
      </div>
    );

    const editor = screen.getByRole('textbox', { name: 'Question prompt' });
    editor.textContent = '**Bold** and $K_a$';
    fireEvent.input(editor);

    expect(onChange).toHaveBeenCalledWith('**Bold** and $K_a$');
  });

  it('drops unsupported styling while preserving supported semantic formatting', () => {
    expect(
      normalizeVisualMarkdown(
        '<span style={{ color: "red" }}><u>Red</u></span> H<sub>2</sub>O x<sup>2</sup> **bold** $K_a$'
      )
    ).toBe('<u>Red</u> H<sub>2</sub>O x<sup>2</sup> **bold** $K_a$');
  });

  it('undoes Markdown escaping inside LaTeX without changing command backslashes', () => {
    expect(normalizeVisualMarkdown('$K\\_a$ and $\\ce{H2O}$ and $1.8 \\times 10^{-5}$')).toBe(
      '$K_a$ and $\\ce{H2O}$ and $1.8 \\times 10^{-5}$'
    );
  });
});
