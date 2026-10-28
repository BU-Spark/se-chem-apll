import type { FilterModel } from 'ag-grid-community';
import type { NodeFilters } from './listFilters';

import { parseGridFilters } from '../../components/InstructorGrid/filterModel';
export { parseGridFilters } from '../../components/InstructorGrid/filterModel';

export function legacyGridFilters(filters: NodeFilters): FilterModel {
  if (filters.gridFilters) return parseGridFilters(JSON.stringify(filters.gridFilters));
  const model: FilterModel = {};
  if (filters.status !== 'all') model.isDraft = { value: filters.status };
  if (filters.usage !== 'all') model.usage = { value: filters.usage === 'mine' };
  const conditions = filters.tags.map((tag) => ({ filterType: 'text', type: 'contains', filter: tag }));
  if (conditions.length)
    model.tags = conditions.length === 1 ? conditions[0] : { filterType: 'text', operator: 'OR', conditions };
  return model;
}

/** Collapse legacy UI state into the current controls; never leave invisible filters active. */
export function currentNodeFilters(input: NodeFilters): NodeFilters {
  const gridFilters = legacyGridFilters(input);
  const draftOnly = input.draftOnly ?? (input.status === 'draft' || gridFilters.isDraft?.value === 'draft');
  delete gridFilters.isDraft;
  return { ...input, q: '', tags: [], status: 'all', usage: 'all', draftOnly, gridFilters };
}
