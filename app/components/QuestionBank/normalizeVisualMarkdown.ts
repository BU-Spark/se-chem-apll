/**
 * MDXEditor preserves some browser clipboard formatting as inline HTML/JSX.
 * Our renderer deliberately does not execute raw HTML, so keep the text while
 * dropping formats that are outside the supported authoring toolbar.
 */
const UNSUPPORTED_INLINE_TAG = /<\/?(?:span|sub|sup|u)\b[^>]*>/gi;
const DOLLAR_MATH = /(\${1,2})([\s\S]*?)\1/g;

export function normalizeVisualMarkdown(markdown: string): string {
  return markdown.replace(UNSUPPORTED_INLINE_TAG, '').replace(DOLLAR_MATH, (math) => math.replace(/\\_/g, '_'));
}
