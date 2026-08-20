import { useState } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import MarkdownPreview from '../MarkdownPreview';
import RichMarkdownEditor from '../RichMarkdownEditor';

type ClipboardPayload = {
  html?: string;
  text: string;
};

class TestClipboardEvent extends Event {
  clipboardData: {
    files: File[];
    getData: (type: string) => string;
    items: never[];
    types: string[];
  };

  constructor(type: string, payload: ClipboardPayload) {
    super(type, { bubbles: true, cancelable: true });
    const values: Record<string, string> = { 'text/plain': payload.text };
    if (payload.html !== undefined) values['text/html'] = payload.html;
    this.clipboardData = {
      files: [],
      getData: (mimeType) => values[mimeType] ?? '',
      items: [],
      types: Object.keys(values),
    };
  }
}

class TestDragEvent extends Event {}

const originalClipboardEvent = globalThis.ClipboardEvent;
const originalDragEvent = globalThis.DragEvent;
const originalRangeRect = Range.prototype.getBoundingClientRect;
const originalRangeRects = Range.prototype.getClientRects;

beforeAll(() => {
  Object.defineProperty(globalThis, 'ClipboardEvent', { configurable: true, value: TestClipboardEvent });
  Object.defineProperty(globalThis, 'DragEvent', { configurable: true, value: TestDragEvent });
  Object.defineProperty(Range.prototype, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({ bottom: 0, height: 0, left: 0, right: 0, top: 0, width: 0, x: 0, y: 0 }),
  });
  Object.defineProperty(Range.prototype, 'getClientRects', { configurable: true, value: () => [] });
});

afterAll(() => {
  Object.defineProperty(globalThis, 'ClipboardEvent', { configurable: true, value: originalClipboardEvent });
  Object.defineProperty(globalThis, 'DragEvent', { configurable: true, value: originalDragEvent });
  Object.defineProperty(Range.prototype, 'getBoundingClientRect', { configurable: true, value: originalRangeRect });
  Object.defineProperty(Range.prototype, 'getClientRects', { configurable: true, value: originalRangeRects });
});

function RichEditorHarness({ initial = '' }: { initial?: string }) {
  const [markdown, setMarkdown] = useState(initial);

  return (
    <div>
      <span id="integration-editor-label">Question prompt</span>
      <RichMarkdownEditor
        value={markdown}
        onChange={setMarkdown}
        contentEditableId="integration-editor"
        labelledBy="integration-editor-label"
        onMarkdownError={(message) => {
          throw new Error(message);
        }}
      />
      <output data-testid="markdown-source">{markdown}</output>
      <MarkdownPreview content={markdown} />
    </div>
  );
}

function placeCaretAtEnd(editor: HTMLElement) {
  editor.focus();
  const range = document.createRange();
  range.selectNodeContents(editor);
  range.collapse(false);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
  document.dispatchEvent(new Event('selectionchange'));
}

function paste(editor: HTMLElement, payload: ClipboardPayload) {
  act(() => {
    placeCaretAtEnd(editor);
    fireEvent(editor, new TestClipboardEvent('paste', payload));
  });
}

function markdownSource(): string {
  return screen.getByTestId('markdown-source').textContent ?? '';
}

describe('RichMarkdownEditor integration', () => {
  it('converts supported webpage formatting to rendered Markdown', async () => {
    render(<RichEditorHarness />);
    const editor = await screen.findByRole('textbox', { name: 'Question prompt' });

    paste(editor, {
      html: [
        '<p><strong>Bold</strong> and <em>italic</em> with ',
        '<a href="https://example.com">a link</a>.</p>',
        '<ul><li>First</li><li>Second</li></ul>',
      ].join(''),
      text: 'Bold and italic with a link.\nFirst\nSecond',
    });

    await waitFor(() => expect(markdownSource()).toContain('Bold'));
    const preview = screen.getByTestId('markdown-preview');
    expect(preview.querySelector('strong')).toHaveTextContent('Bold');
    expect(preview.querySelector('em')).toHaveTextContent('italic');
    expect(preview.querySelector('a')).toHaveAttribute('href', 'https://example.com');
    expect(Array.from(preview.querySelectorAll('li')).map((item) => item.textContent)).toEqual(['First', 'Second']);
  });

  it('keeps pasted text while removing unsupported inline styling', async () => {
    render(<RichEditorHarness />);
    const editor = await screen.findByRole('textbox', { name: 'Question prompt' });

    paste(editor, {
      html: [
        '<p><span style="color: red; font-family: serif"><u>Red</u></span> ',
        'H<sub>2</sub>O and x<sup>2</sup></p>',
      ].join(''),
      text: 'Red H2O and x2',
    });

    await waitFor(() => expect(markdownSource()).toContain('Red'));
    expect(markdownSource()).not.toMatch(/<\/?(?:span|sub|sup|u)\b/i);
    expect(screen.getByTestId('markdown-preview')).toHaveTextContent('Red H2O and x2');
  });

  it('preserves LaTeX and mhchem source through a real editor update', async () => {
    render(<RichEditorHarness initial={'$K_a$ and $\\ce{H2O}$'} />);
    const editor = await screen.findByRole('textbox', { name: 'Question prompt' });

    paste(editor, { text: ' plus text' });

    await waitFor(() => expect(markdownSource()).toContain('plus text'));
    expect(markdownSource()).toContain('$K_a$');
    expect(markdownSource()).toContain('$\\ce{H2O}$');
    expect(screen.getByTestId('markdown-preview').querySelectorAll('.katex')).toHaveLength(2);
  });

  it('falls back to plain text when clipboard HTML is unavailable', async () => {
    render(<RichEditorHarness />);
    const editor = await screen.findByRole('textbox', { name: 'Question prompt' });

    paste(editor, { text: 'Plain clipboard text' });

    await waitFor(() => expect(markdownSource()).toBe('Plain clipboard text'));
    expect(screen.getByTestId('markdown-preview')).toHaveTextContent('Plain clipboard text');
  });
});
