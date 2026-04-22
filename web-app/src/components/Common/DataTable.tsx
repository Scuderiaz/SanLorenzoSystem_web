import React, { useMemo, useState } from 'react';
import './DataTable.css';

export interface Column {
  key: string;
  label: string;
  sortable?: boolean;
  render?: (value: any, row: any) => React.ReactNode;
}

interface DataTableProps {
  columns: Column[];
  data: any[];
  onRowClick?: (row: any) => void;
  emptyMessage?: string;
  loading?: boolean;
}

const DataTable: React.FC<DataTableProps> = ({
  columns,
  data,
  onRowClick,
  emptyMessage = 'No data available',
  loading = false,
}) => {
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  const handleSort = (columnKey: string) => {
    if (sortColumn === columnKey) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(columnKey);
      setSortDirection('asc');
    }
  };

  const sortedData = useMemo(() => {
    if (!sortColumn) return data;

    return [...data].sort((a, b) => {
      const aVal = a[sortColumn];
      const bVal = b[sortColumn];

      if (aVal === bVal) return 0;
      
      const comparison = aVal < bVal ? -1 : 1;
      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [data, sortColumn, sortDirection]);

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
              {col.sortable && sortColumn === col.key && (
                <i className={`fas fa-sort-${sortDirection === 'asc' ? 'up' : 'down'} sort-icon`}></i>
              )}
            </div>
          </th>
        ))}
      </tr>
    </thead>
  );

  if (loading) {
    return (
      <div className="data-table-container">
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

  if (data.length === 0) {
    return (
      <div className="data-table-container">
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
