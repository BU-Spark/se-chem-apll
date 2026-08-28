import { render, screen } from '@testing-library/react';
import MarkdownPreview from '../MarkdownPreview';

describe('MarkdownPreview', () => {
  it('renders markdown formatting', () => {
    render(<MarkdownPreview content={'**bold** and *italic*'} />);
    expect(screen.getByText('bold').tagName).toBe('STRONG');
    expect(screen.getByText('italic').tagName).toBe('EM');
  });

  it('renders underline, superscript, and subscript while sanitizing unsafe HTML', () => {
    render(
      <MarkdownPreview
        content={'<u onclick="alert(1)">underlined</u> H<sub>2</sub>O x<sup>2</sup><script>alert(1)</script>'}
      />
    );

    expect(screen.getByText('underlined').tagName).toBe('U');
    expect(screen.getByText('underlined')).not.toHaveAttribute('onclick');
    expect(screen.getByText('2', { selector: 'sub' })).toBeInTheDocument();
    expect(screen.getByText('2', { selector: 'sup' })).toBeInTheDocument();
    expect(screen.getByTestId('markdown-preview').querySelector('script')).toBeNull();
  });

  it('renders inline LaTeX math with KaTeX', () => {
    render(<MarkdownPreview content={'Lift coefficient: $C_L$'} />);
    const preview = screen.getByTestId('markdown-preview');
    expect(preview.querySelector('.katex')).not.toBeNull();
  });

  it('renders chemistry notation through the mhchem extension', () => {
    render(<MarkdownPreview content={'$\\ce{2H2 + O2 -> 2H2O}$'} />);
    const preview = screen.getByTestId('markdown-preview');
    // If mhchem failed to register, KaTeX emits an error span with the raw source.
    expect(preview.querySelector('.katex-error')).toBeNull();
    // The visible HTML output renders the equation, not the \ce source
    // (the MathML accessibility annotation legitimately contains the source).
    const visible = preview.querySelector('.katex-html');
    expect(visible).not.toBeNull();
    expect(visible!.textContent).not.toContain('\\ce');
    // KaTeX splits subscripts into separate glyphs, so assert loosely.
    expect(visible!.textContent).toContain('H');
    expect(visible!.textContent).toContain('O');
  });

  it('shows invalid math inline instead of throwing', () => {
    render(<MarkdownPreview content={'$\\frac{1$'} />);
    expect(screen.getByTestId('markdown-preview')).toBeInTheDocument();
  });
});
