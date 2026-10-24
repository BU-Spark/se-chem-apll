import {
  addImportVisitor$,
  addMdastExtension$,
  addSyntaxExtension$,
  addToMarkdownExtension$,
  realmPlugin,
  createActiveEditorSubscription$,
  insertMarkdown$,
  type MdastImportVisitor,
} from '@mdxeditor/editor';
import { $createParagraphNode, $createTextNode, PASTE_COMMAND, COMMAND_PRIORITY_HIGH } from 'lexical';
import { mathFromMarkdown, type InlineMath, type Math } from 'mdast-util-math';
import { math } from 'micromark-extension-math';
import type { Options } from 'mdast-util-to-markdown';
import { mapOutsideMath } from './mathMarkdown';

declare module 'mdast' {
  interface Data {
    mathSource?: string;
  }
}

/** Keep math editable as source, without interpreting its contents as Markdown. */
const importMath: MdastImportVisitor<InlineMath | Math> = {
  testNode: (node) => node.type === 'inlineMath' || node.type === 'math',
  visitNode({ mdastNode, actions }) {
    const text = $createTextNode(String(mdastNode.data?.mathSource ?? mdastNode.value));
    text.setFormat(actions.getParentFormatting());
    actions.addAndStepInto(mdastNode.type === 'math' ? $createParagraphNode().append(text) : text);
  },
};

const serialization: Options = {
  handlers: {
    text(node, _parent, state, info) {
      // This also handles newly typed/pasted math, before it has been re-imported.
      return mapOutsideMath(node.value, (value, before, after) =>
        value
          .split('\\$')
          .map((part, index, parts) =>
            state.safe(part, {
              ...info,
              before: index ? '$' : before || info.before,
              after: index < parts.length - 1 ? '\\' : after || info.after,
            })
          )
          .join('\\$')
      );
    },
  },
};

export const mathSourcePlugin = realmPlugin({
  init(realm) {
    const extension = mathFromMarkdown();
    for (const name of ['mathText', 'mathFlow']) {
      const exit = extension.exit![name];
      extension.exit![name] = function (token) {
        const node = [...this.stack].reverse().find((entry) => entry.type === 'math' || entry.type === 'inlineMath')!;
        exit.call(this, token);
        node.data = { ...node.data, mathSource: this.sliceSerialize(token) };
      };
    }
    // Preserve an explicitly escaped dollar in the editable source. Otherwise
    // Markdown import removes the escape and two currency amounts become math.
    extension.exit!.characterEscapeValue = function (token) {
      const node = this.stack.pop()!;
      const value = this.sliceSerialize(token);
      if ('value' in node) node.value += value === '$' ? '\\$' : value;
      if (node.position) node.position.end = { ...token.end };
    };
    realm.pub(createActiveEditorSubscription$, (editor) =>
      editor.registerCommand(
        PASTE_COMMAND,
        (event) => {
          if (!event || !('clipboardData' in event) || !event.clipboardData) return false;
          const text = event.clipboardData.getData('text/plain');
          if (event.clipboardData.getData('text/html') || !text.includes('\n')) return false;
          if (!mapOutsideMath(text, () => '').includes('\n')) return false;
          // Lexical's default plain paste creates a paragraph per line, splitting
          // display math before serialization. Import its math block as a unit.
          event.preventDefault();
          realm.pub(insertMarkdown$, text);
          return true;
        },
        COMMAND_PRIORITY_HIGH
      )
    );
    realm.pubIn({
      [addSyntaxExtension$]: math(),
      [addMdastExtension$]: extension,
      [addImportVisitor$]: importMath,
      [addToMarkdownExtension$]: serialization,
    });
  },
});
