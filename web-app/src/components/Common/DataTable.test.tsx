import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import DataTable, { Column } from './DataTable';

describe('DataTable', () => {
  const columns: Column[] = [
    { key: 'name', label: 'Name', sortable: true },
    { key: 'status', label: 'Status', sortable: true },
    {
      key: 'action',
      label: 'Action',
      render: (_value, row) => <button type="button">Open {row.name}</button>,
    },
  ];

  const rows = [
    { name: 'Alice Santos', status: 'Active' },
    { name: 'Brian Cruz', status: 'Inactive' },
  ];

  test('renders table rows and custom cell content', () => {
    render(<DataTable columns={columns} data={rows} />);

    expect(screen.getByRole('cell', { name: 'Alice Santos' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'Active' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open Alice Santos' })).toBeInTheDocument();
  });

  test('sorts rows when clicking a sortable header', () => {
    render(<DataTable columns={columns} data={rows} />);

    fireEvent.click(screen.getByText('Name'));

    const ascendingRows = screen.getAllByRole('row');
    expect(ascendingRows[1]).toHaveTextContent('Alice Santos');
    expect(ascendingRows[2]).toHaveTextContent('Brian Cruz');

    fireEvent.click(screen.getByText('Name'));

    const descendingRows = screen.getAllByRole('row');
    expect(descendingRows[1]).toHaveTextContent('Brian Cruz');
    expect(descendingRows[2]).toHaveTextContent('Alice Santos');
  });

  test('shows the empty state when there is no data', () => {
    render(<DataTable columns={columns} data={[]} emptyMessage="Nothing to display" />);

    expect(screen.getByText(/Nothing to display/i)).toBeInTheDocument();
  });

  test('filters rows using the built-in toolbar', () => {
    render(
      <DataTable
        columns={[
          { key: 'name', label: 'Name', sortable: true },
          { key: 'status', label: 'Status', sortable: true, filterType: 'select' },
        ]}
        data={rows}
        enableFiltering
        filterPlaceholder="Search people"
      />
    );

    fireEvent.change(screen.getByPlaceholderText('Search people'), { target: { value: 'brian' } });

    expect(screen.getByRole('cell', { name: 'Brian Cruz' })).toBeInTheDocument();
    expect(screen.queryByRole('cell', { name: 'Alice Santos' })).not.toBeInTheDocument();
  });
});
