import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize, { defaultSchema, type Options as SanitizeSchema } from 'rehype-sanitize';
import 'katex/contrib/mhchem';
import 'katex/dist/katex.min.css';
import styles from './QuestionBank.module.css';

const previewSchema: SanitizeSchema = {
  ...defaultSchema,
  tagNames: Array.from(new Set([...(defaultSchema.tagNames ?? []), 'u', 'sup', 'sub'])),
  attributes: {
    ...defaultSchema.attributes,
    code: [...(defaultSchema.attributes?.code ?? []), ['className', 'math-inline', 'math-display']],
  },
};

/**
 * Shared Markdown + LaTeX + mhchem renderer for question content.
 *
 * This is the same component that should render student-facing question text,
 * so authoring preview cannot drift from delivery. Raw HTML is sanitized to a
 * small allowlist that includes semantic underline, superscript, and subscript
 * tags. KaTeX runs in non-throwing mode so invalid math cannot crash the editor.
 */
export default function MarkdownPreview({ content }: { content: string }) {
  return (
    <div className={styles.markdownPreview} data-testid="markdown-preview">
      <Markdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[
          rehypeRaw,
          [rehypeSanitize, previewSchema],
          [rehypeKatex, { throwOnError: false, strict: 'ignore' }],
        ]}
      >
        {content}
      </Markdown>
    </div>
  );
}
