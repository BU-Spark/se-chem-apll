'use client';
import selectStyles from '@/app/components/Select/Select.module.css';
import type { CustomFloatingFilterProps } from 'ag-grid-react';
import type { IDoesFilterPassParams, IFilterComp, IFilterParams } from 'ag-grid-community';
import styles from './grid.module.css';
type UsageModel = { value: boolean };

// Keep the predicate synchronous even when AG Grid lazily creates the filter panel.
export class UsageFilter implements IFilterComp<unknown> {
  private model: UsageModel | null = null;
  private select!: HTMLSelectElement;
  private params!: IFilterParams<unknown>;

  init(params: IFilterParams<unknown>) {
    this.params = params;
    this.select = document.createElement('select');
    this.select.className = `${selectStyles.control} ${selectStyles.grid} ${styles.usageFilter}`;
    this.select.setAttribute('aria-label', params.context?.usageLabel ?? 'Filter lesson usage');
    for (const [value, label] of [
      ['', 'All'],
      ['true', 'Used'],
      ['false', 'Not used'],
    ]) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = label;
      this.select.append(option);
    }
    this.select.onchange = () => {
      this.setModel(this.select.value ? { value: this.select.value === 'true' } : null);
      params.filterChangedCallback();
    };
  }
  getGui() {
    return this.select;
  }
  isFilterActive() {
    return this.model !== null;
  }
  getModel() {
    return this.model;
  }
  setModel(model: UsageModel | null) {
    this.model = model;
    this.select.value = model ? String(model.value) : '';
  }
  doesFilterPass({ node }: IDoesFilterPassParams<unknown>) {
    return !this.model || Boolean(this.params.getValue(node)) === this.model.value;
  }
  afterGuiAttached() {
    this.select.focus();
  }
  destroy() {
    this.select.onchange = null;
  }
}

export function UsageFloatingFilter({
  model,
  onModelChange,
  context,
}: CustomFloatingFilterProps<never, unknown, { usageLabel?: string }, UsageModel>) {
  return (
    <select
      className={`${selectStyles.control} ${selectStyles.grid} ${styles.usageFilter}`}
      aria-label={context?.usageLabel ?? 'Filter lesson usage'}
      value={model ? String(model.value) : ''}
      onChange={(event) => onModelChange(event.target.value ? { value: event.target.value === 'true' } : null)}
    >
      <option value="">All</option>
      <option value="true">Used</option>
      <option value="false">Not used</option>
    </select>
  );
}
