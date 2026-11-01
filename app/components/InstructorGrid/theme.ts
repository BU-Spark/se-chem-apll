import { createPart, themeQuartz } from 'ag-grid-community';
export const instructorGridTheme = themeQuartz
  .withPart(
    createPart({
      feature: 'instructorSelectSpacing',
      css: `
    .ag-picker-field-wrapper {
      min-height: var(--ag-input-height);
      padding-inline: 12px;
      gap: 12px;
    }
    .ag-picker-field-icon {
      flex: 0 0 16px;
    }
    .ag-picker-field-wrapper:focus-visible {
      outline: 2px solid #1f5fab;
      outline-offset: 2px;
    }
  `,
    })
  )
  .withParams({
    fontFamily: 'inherit',
    fontSize: 14,
    backgroundColor: '#ffffff',
    foregroundColor: '#334155',
    oddRowBackgroundColor: '#f9fbfd',
    rowHoverColor: '#e7f0fc',
    selectedRowBackgroundColor: '#dbeafe',
    headerBackgroundColor: '#edf2f8',
    headerTextColor: '#1e293b',
    headerFontWeight: 600,
    headerRowBorder: { color: '#d5deea', width: 1 },
    borderColor: '#d5deea',
    wrapperBorderRadius: 12,
    rowBorder: { color: '#e5eaf1', width: 1 },
    columnBorder: false,
    inputHeight: 34,
    inputPaddingStart: 12,
    inputFocusBorder: { color: '#1f5fab', width: 1 },
    inputFocusShadow: '0 0 0 2px #1f5fab',
    inputDisabledBackgroundColor: '#f9fafb',
    inputDisabledTextColor: '#6b7280',
    inputInvalidBorder: { color: '#dc2626', width: 1 },
    pickerButtonBorder: { color: '#d1d5db', width: 1 },
    pickerButtonBorderRadius: 8,
    pickerButtonFocusBorder: { color: '#1f5fab', width: 1 },
    pickerButtonBackgroundColor: '#ffffff',
    iconSize: 16,
    inputBorderRadius: 8,
    inputBorder: { color: '#d1d5db', width: 1 },
    inputBackgroundColor: '#ffffff',
    accentColor: '#1f5fab',
  });
