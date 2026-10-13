import type { FilterModel } from 'ag-grid-community';
/** Only accept known column/filter shapes from untrusted URLs. */
export function parseGridFilters(
  value: string,
  columns: Record<string, 'text' | 'date' | 'number' | 'boolean' | 'legacyDraft'> = {
    title: 'text',
    tags: 'text',
    updatedAt: 'date',
    usage: 'boolean',
    isDraft: 'legacyDraft',
  }
): FilterModel {
  try {
    const input: unknown = JSON.parse(value);
    if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
    const output: FilterModel = {};
    for (const [column, model] of Object.entries(input)) {
      if (columns[column] === 'legacyDraft') {
        if (model?.value === 'draft' || model?.value === 'published') output[column] = { value: model.value };
        continue;
      }
      if (columns[column] === 'boolean') {
        if (typeof model?.value === 'boolean') output.usage = { value: model.value };
        else if (model?.filterType === 'number') {
          if (
            (model.type === 'equals' && model.filter === 0) ||
            (model.type === 'lessThan' && model.filter === 1) ||
            (model.type === 'lessThanOrEqual' && model.filter === 0)
          )
            output.usage = { value: false };
          if (
            (model.type === 'greaterThan' && model.filter === 0) ||
            (model.type === 'greaterThanOrEqual' && model.filter === 1) ||
            (model.type === 'notEqual' && model.filter === 0)
          )
            output.usage = { value: true };
        }
        continue;
      }
      const kind = columns[column];
      if (!kind || !model || model.filterType !== kind) continue;
      const valid = (condition: Record<string, unknown>) => {
        if (!condition || condition.filterType !== kind) return false;
        const types =
          kind === 'text'
            ? ['contains', 'notContains', 'equals', 'notEqual', 'startsWith', 'endsWith', 'blank', 'notBlank']
            : [
                'equals',
                'notEqual',
                'lessThan',
                'lessThanOrEqual',
                'greaterThan',
                'greaterThanOrEqual',
                'inRange',
                'blank',
                'notBlank',
              ];
        if (!types.includes(String(condition.type))) return false;
        if (condition.type === 'blank' || condition.type === 'notBlank') return true;
        if (kind === 'text') return typeof condition.filter === 'string';
        if (kind === 'number')
          return (
            typeof condition.filter === 'number' &&
            Number.isFinite(condition.filter) &&
            (condition.type !== 'inRange' ||
              (typeof condition.filterTo === 'number' && Number.isFinite(condition.filterTo)))
          );
        return (
          typeof condition.dateFrom === 'string' &&
          Number.isFinite(Date.parse(condition.dateFrom)) &&
          (condition.type !== 'inRange' ||
            (typeof condition.dateTo === 'string' && Number.isFinite(Date.parse(condition.dateTo))))
        );
      };
      if (model.operator) {
        if (
          ['AND', 'OR'].includes(model.operator) &&
          Array.isArray(model.conditions) &&
          model.conditions.length <= 100 &&
          model.conditions.every(valid)
        )
          output[column] = model;
      } else if (valid(model)) output[column] = model;
    }
    return output;
  } catch {
    return {};
  }
}
