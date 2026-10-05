import { QUESTION_BANK_COMMANDS, commandById, commandShortcutLabel, matchesCommandShortcut } from '../commands';

function keyboardEvent(
  key: string,
  modifiers: Partial<Pick<KeyboardEvent, 'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey'>> = {}
) {
  return {
    key,
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    ...modifiers,
  };
}

describe('question-bank command registry', () => {
  it('has unique IDs and complete status-bar shortcut metadata', () => {
    const ids = QUESTION_BANK_COMMANDS.map((command) => command.id);
    expect(new Set(ids).size).toBe(ids.length);

    for (const command of QUESTION_BANK_COMMANDS.filter((item) => item.showInStatusBar)) {
      expect(commandShortcutLabel(command)).toBeTruthy();
      expect(command.statusText).toBeTruthy();
    }
  });

  it('matches exact shortcut modifiers', () => {
    const palette = commandById('open-commands');
    expect(matchesCommandShortcut(keyboardEvent('p', { ctrlKey: true, shiftKey: true }), palette)).toBe(true);
    expect(matchesCommandShortcut(keyboardEvent('p', { ctrlKey: true }), palette)).toBe(false);

    const remove = commandById('delete-questions');
    expect(matchesCommandShortcut(keyboardEvent('Delete'), remove)).toBe(true);
    expect(matchesCommandShortcut(keyboardEvent('Backspace'), remove)).toBe(true);
  });

  it('registers searchable LaTeX and mhchem references with examples', () => {
    const references = QUESTION_BANK_COMMANDS.filter((command) => command.kind === 'reference');
    expect(references.map((command) => command.id)).toEqual(
      expect.arrayContaining([
        'help-inline-math',
        'help-display-math',
        'help-scripts',
        'help-fraction',
        'help-chemical-formula',
        'help-chemical-reaction',
      ])
    );
    expect(commandById('help-chemical-formula').searchTerms).toContain('chemtex');
    expect(commandById('help-chemical-reaction').example).toContain('\\ce{');
  });
});
