import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/contrib/mhchem';
import 'katex/dist/katex.min.css';
import styles from './QuestionBank.module.css';

/**
 * Shared Markdown + LaTeX + mhchem renderer for question content.
 *
 * This is the same component that should render student-facing question text,
 * so authoring preview cannot drift from delivery. Raw HTML is not enabled;
 * KaTeX runs in non-throwing mode so authors see invalid math inline instead
 * of crashing the editor.
 */
export default function MarkdownPreview({ content }: { content: string }) {
  return (
    <div className={styles.markdownPreview} data-testid="markdown-preview">
      <Markdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[[rehypeKatex, { throwOnError: false, strict: 'ignore' }]]}
      >
        {content}
      </Markdown>
    </div>
  );
}
