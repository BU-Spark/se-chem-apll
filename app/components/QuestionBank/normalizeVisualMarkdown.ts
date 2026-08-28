/**
 * MDXEditor preserves some browser clipboard formatting as inline HTML/JSX.
 * Keep the text from unsupported browser styling while preserving the three
 * semantic inline tags exposed by our authoring toolbar. Attributes on those
 * tags are discarded; the preview renderer also sanitizes all raw HTML.
 */
const UNSUPPORTED_INLINE_TAG = /<\/?span\b[^>]*>/gi;
const SUPPORTED_INLINE_OPEN_TAG = /<(u|sub|sup)\b[^>]*>/gi;
const DOLLAR_MATH = /(\${1,2})([\s\S]*?)\1/g;

export function normalizeVisualMarkdown(markdown: string): string {
  return markdown
    .replace(UNSUPPORTED_INLINE_TAG, '')
    .replace(SUPPORTED_INLINE_OPEN_TAG, (_, tag: string) => `<${tag.toLowerCase()}>`)
    .replace(DOLLAR_MATH, (math) => math.replace(/\\_/g, '_'));
}
