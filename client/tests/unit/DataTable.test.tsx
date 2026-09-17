import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DataTable } from '../../src/components/DataTable';

interface Row {
  id: string;
  name: string;
}

const columns = [{ header: 'Name', accessor: (r: Row) => r.name }];

describe('DataTable', () => {
  it('renders one row per data item using the given accessor', () => {
    const data: Row[] = [{ id: '1', name: 'Alice' }, { id: '2', name: 'Bob' }];
    render(<DataTable columns={columns} data={data} keyFn={(r) => r.id} />);
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
  });

  it('shows the empty message when there is no data', () => {
    render(<DataTable columns={columns} data={[]} keyFn={(r: Row) => r.id} emptyMessage="Nothing here yet." />);
    expect(screen.getByText('Nothing here yet.')).toBeInTheDocument();
  });

  it('shows a loading state instead of the empty message while loading', () => {
    render(<DataTable columns={columns} data={[]} keyFn={(r: Row) => r.id} loading emptyMessage="Nothing here yet." />);
    expect(screen.getByText('Loading...')).toBeInTheDocument();
    expect(screen.queryByText('Nothing here yet.')).not.toBeInTheDocument();
  });

  it('calls the column accessor exactly once per row', () => {
    const accessor = vi.fn((r: Row) => r.name);
    const data: Row[] = [{ id: '1', name: 'Alice' }];
    render(<DataTable columns={[{ header: 'Name', accessor }]} data={data} keyFn={(r) => r.id} />);
    expect(accessor).toHaveBeenCalledTimes(1);
    expect(accessor).toHaveBeenCalledWith(data[0]);
  });
});
