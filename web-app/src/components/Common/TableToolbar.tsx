import React from 'react';
import './TableToolbar.css';

interface TableToolbarProps {
  searchValue: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder: string;
  searchAriaLabel?: string;
  quickFilters?: React.ReactNode;
  actions?: React.ReactNode;
  loading?: boolean;
  hasActiveFilters?: boolean;
  onClear?: () => void;
  className?: string;
}

const TableToolbar: React.FC<TableToolbarProps> = ({
  searchValue,
  onSearchChange,
  searchPlaceholder,
  searchAriaLabel,
  quickFilters,
  actions,
  loading = false,
  hasActiveFilters = false,
  onClear,
  className = '',
}) => (
  <div className={`table-toolbar ${className}`.trim()}>
    <div className="table-toolbar__primary">
      {quickFilters && <div className="table-toolbar__quick-filters">{quickFilters}</div>}
      {hasActiveFilters && onClear && (
        <button type="button" className="table-toolbar__clear" onClick={onClear}>
          Clear
        </button>
      )}
      {loading && (
        <div className="table-toolbar__loading" aria-live="polite">
          <i className="fas fa-spinner fa-spin" aria-hidden="true"></i>
          <span>Updating</span>
        </div>
      )}
    </div>

    <div className="table-toolbar__secondary">
      <label className="table-toolbar__search" aria-label={searchAriaLabel || searchPlaceholder}>
        <i className="fas fa-search" aria-hidden="true"></i>
        <input
          type="search"
          value={searchValue}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder={searchPlaceholder}
        />
      </label>

      {actions && <div className="table-toolbar__actions">{actions}</div>}
    </div>
  </div>
);

export default TableToolbar;
