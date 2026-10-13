import { fromMarkdown } from 'mdast-util-from-markdown';
import { mathFromMarkdown } from 'mdast-util-math';
import { math } from 'micromark-extension-math';
import type { Nodes } from 'mdast';

/** Use the preview's math grammar, including escaped dollars and code boundaries. */
export function mapOutsideMath(
  source: string,
  transform: (text: string, before: string, after: string) => string
): string {
  if (!source.includes('$')) return transform(source, '', '');
  const tree = fromMarkdown(source, { extensions: [math()], mdastExtensions: [mathFromMarkdown()] });
  const ranges: Array<[number, number]> = [];
  function visit(node: Nodes) {
    if (node.type === 'math' || node.type === 'inlineMath') {
      const start = node.position?.start.offset;
      const end = node.position?.end.offset;
      if (start !== undefined && end !== undefined) ranges.push([start, end]);
    } else if ('children' in node) node.children.forEach(visit);
  }
  visit(tree);
  let cursor = 0;
  let result = '';
  for (const [start, end] of ranges) {
    result += transform(source.slice(cursor, start), source.slice(cursor - 1, cursor), source[start]);
    result += source.slice(start, end);
    cursor = end;
  }
  return result + transform(source.slice(cursor), source.slice(cursor - 1, cursor), '');
}
