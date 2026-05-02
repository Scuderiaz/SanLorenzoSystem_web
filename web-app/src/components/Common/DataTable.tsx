import React, { useEffect, useMemo, useState } from 'react';
import FormSelect from './FormSelect';
import TableToolbar from './TableToolbar';
import './DataTable.css';

export interface ColumnFilterOption {
  value: string;
  label: string;
}

export interface Column {
  key: string;
  label: string;
  sortable?: boolean;
  getSortValue?: (row: any) => unknown;
  render?: (value: any, row: any) => React.ReactNode;
  filterable?: boolean;
  filterType?: 'text' | 'select';
  filterLabel?: string;
  filterOptions?: ColumnFilterOption[];
  getFilterValue?: (row: any) => unknown;
}

interface DataTableProps {
  columns: Column[];
  data: any[];
  onRowClick?: (row: any) => void;
  emptyMessage?: string;
  loading?: boolean;
  enableFiltering?: boolean;
  filterPlaceholder?: string;
  filterActions?: React.ReactNode;
  initialSortColumn?: string | null;
  initialSortDirection?: 'asc' | 'desc';
}

const DataTable: React.FC<DataTableProps> = ({
  columns,
  data,
  onRowClick,
  emptyMessage = 'No data available',
  loading = false,
  enableFiltering = false,
  filterPlaceholder = 'Search table records...',
  filterActions,
  initialSortColumn = null,
  initialSortDirection = 'asc',
}) => {
  const [sortColumn, setSortColumn] = useState<string | null>(initialSortColumn);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>(initialSortDirection);
  const [searchQuery, setSearchQuery] = useState('');
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});

  const getColumnFilterValue = (column: Column, row: any) => {
    const value = column.getFilterValue ? column.getFilterValue(row) : row[column.key];
    if (value === null || value === undefined) {
      return '';
    }
    return String(value);
  };

  const searchableColumns = useMemo(
    () => enableFiltering
      ? columns.filter((column) => column.key !== 'actions' && column.filterable !== false)
      : [],
    [columns, enableFiltering]
  );

  const selectFilters = useMemo(() => {
    if (!enableFiltering) {
      return [];
    }

    return columns
      .filter((column) => column.filterType === 'select')
      .map((column) => {
        const derivedOptions = column.filterOptions || Array.from(
          new Set(
            data
              .map((row) => getColumnFilterValue(column, row).trim())
              .filter(Boolean)
          )
        )
          .sort((left, right) => left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' }))
          .map((value) => ({
            value,
            label: value,
          }));

        return {
          key: column.key,
          label: column.filterLabel || column.label,
          options: derivedOptions,
        };
      })
      .filter((column) => column.options.length > 0);
  }, [columns, data, enableFiltering]);

  useEffect(() => {
    if (!enableFiltering) {
      setSearchQuery('');
      setColumnFilters({});
      return;
    }

    const activeFilterKeys = new Set(selectFilters.map((filter) => filter.key));
    setColumnFilters((current) => Object.fromEntries(
      Object.entries(current).filter(([key, value]) => activeFilterKeys.has(key) && value)
    ));
  }, [enableFiltering, selectFilters]);

  useEffect(() => {
    setSortColumn(initialSortColumn);
    setSortDirection(initialSortDirection);
  }, [initialSortColumn, initialSortDirection]);

  const handleSort = (columnKey: string) => {
    if (sortColumn === columnKey) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(columnKey);
      setSortDirection('asc');
    }
  };

  const filteredData = useMemo(() => {
    if (!enableFiltering) {
      return data;
    }

    const normalizedQuery = searchQuery.trim().toLowerCase();

    return data.filter((row) => {
      const matchesSearch = !normalizedQuery || searchableColumns.some((column) =>
        getColumnFilterValue(column, row).toLowerCase().includes(normalizedQuery)
      );

      const matchesSelectFilters = selectFilters.every((filter) => {
        const selectedValue = columnFilters[filter.key];
        if (!selectedValue) {
          return true;
        }

        const column = columns.find((candidate) => candidate.key === filter.key);
        return column ? getColumnFilterValue(column, row) === selectedValue : true;
      });

      return matchesSearch && matchesSelectFilters;
    });
  }, [columnFilters, columns, data, enableFiltering, searchQuery, searchableColumns, selectFilters]);

  const sortedData = useMemo(() => {
    if (!sortColumn) return filteredData;
    const sortColumnConfig = columns.find((column) => column.key === sortColumn);

    return [...filteredData].sort((a, b) => {
      const aVal = sortColumnConfig?.getSortValue ? sortColumnConfig.getSortValue(a) : a[sortColumn];
      const bVal = sortColumnConfig?.getSortValue ? sortColumnConfig.getSortValue(b) : b[sortColumn];

      if (aVal === bVal) return 0;

      if (aVal === null || aVal === undefined || aVal === '') return sortDirection === 'asc' ? -1 : 1;
      if (bVal === null || bVal === undefined || bVal === '') return sortDirection === 'asc' ? 1 : -1;

      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
      }

      const comparison = String(aVal).localeCompare(String(bVal), undefined, { numeric: true, sensitivity: 'base' });
      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [columns, filteredData, sortColumn, sortDirection]);

  const hasActiveFilters = Boolean(
    searchQuery.trim() || Object.values(columnFilters).some((value) => value)
  );

  const clearFilters = () => {
    setSearchQuery('');
    setColumnFilters({});
  };

  const renderHeader = () => (
    <thead>
      <tr>
        {columns.map((col) => (
          <th
            key={col.key}
            onClick={() => col.sortable && handleSort(col.key)}
            className={col.sortable ? 'sortable' : ''}
          >
            <div className="data-table-header-content">
              <span>{col.label}</span>
              {col.sortable && (
                <i
                  className={`fas ${
                    sortColumn === col.key
                      ? `fa-sort-${sortDirection === 'asc' ? 'up' : 'down'}`
                      : 'fa-sort'
                  } sort-icon ${sortColumn === col.key ? 'active' : ''}`}
                ></i>
              )}
            </div>
          </th>
        ))}
      </tr>
    </thead>
  );

  const renderToolbar = () => {
    if (!enableFiltering) {
      return null;
    }

    const quickFilters = selectFilters.length > 0 ? (
      <>
        {selectFilters.map((filter) => (
          <FormSelect
            key={filter.key}
            label=""
            value={columnFilters[filter.key] || ''}
            onChange={(value) => setColumnFilters((current) => ({
              ...current,
              [filter.key]: value,
            }))}
            options={filter.options}
            placeholder={`All ${filter.label}`}
          />
        ))}
      </>
    ) : undefined;

    return (
      <div className="data-table-toolbar">
        <TableToolbar
          searchValue={searchQuery}
          onSearchChange={setSearchQuery}
          searchPlaceholder={filterPlaceholder}
          quickFilters={quickFilters}
          actions={filterActions}
          loading={loading}
          hasActiveFilters={hasActiveFilters}
          onClear={clearFilters}
        />
      </div>
    );
  };

  if (loading) {
    return (
      <div className="data-table-container">
        {renderToolbar()}
        <table className="data-table">
          {renderHeader()}
          <tbody>
            <tr>
              <td colSpan={columns.length} style={{ textAlign: 'center', padding: '20px' }}>
                <i className="fas fa-spinner fa-spin"></i> Loading...
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    );
  }

  if (sortedData.length === 0) {
    return (
      <div className="data-table-container">
        {renderToolbar()}
        <table className="data-table">
          {renderHeader()}
          <tbody>
            <tr>
              <td colSpan={columns.length} style={{ textAlign: 'center', padding: '20px', color: '#666' }}>
                <i className="fas fa-info-circle"></i> {emptyMessage}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="data-table-container">
      {renderToolbar()}
      <table className="data-table">
        {renderHeader()}
        <tbody>
          {sortedData.map((row, index) => (
            <tr
              key={index}
              onClick={() => onRowClick && onRowClick(row)}
              className={onRowClick ? 'clickable' : ''}
            >
              {columns.map((col) => (
                <td key={col.key}>
                  {col.render ? col.render(row[col.key], row) : row[col.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default DataTable;
