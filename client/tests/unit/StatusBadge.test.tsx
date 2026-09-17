import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatusBadge } from '../../src/components/StatusBadge';

describe('StatusBadge', () => {
  it('renders a human-readable label derived from the status code', () => {
    render(<StatusBadge status="PENDING_APPROVAL" />);
    expect(screen.getByText('Pending Approval')).toBeInTheDocument();
  });

  it('renders an explicit label override instead of the derived one', () => {
    render(<StatusBadge status="ACTIVE" label="Currently Active" />);
    expect(screen.getByText('Currently Active')).toBeInTheDocument();
    expect(screen.queryByText('Active')).not.toBeInTheDocument();
  });

  it('falls back to a neutral style for an unrecognized status rather than crashing', () => {
    render(<StatusBadge status="SOME_UNKNOWN_STATUS" />);
    expect(screen.getByText('Some Unknown Status')).toBeInTheDocument();
  });
});
