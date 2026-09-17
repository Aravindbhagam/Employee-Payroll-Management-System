import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ProtectedRoute } from '../../src/components/ProtectedRoute';

const { useAuthMock } = vi.hoisted(() => ({ useAuthMock: vi.fn() }));
vi.mock('../../src/context/AuthContext', () => ({ useAuth: useAuthMock }));

function renderProtected(resource?: any, action?: any) {
  return render(
    <MemoryRouter initialEntries={['/secret']}>
      <Routes>
        <Route path="/login" element={<div>Login Page</div>} />
        <Route
          path="/secret"
          element={
            <ProtectedRoute resource={resource} action={action}>
              <div>Secret Content</div>
            </ProtectedRoute>
          }
        />
      </Routes>
    </MemoryRouter>
  );
}

describe('ProtectedRoute', () => {
  it('shows a loading spinner while auth state is still resolving', () => {
    useAuthMock.mockReturnValue({ user: null, loading: true });
    const { container } = renderProtected();
    expect(screen.queryByText('Secret Content')).not.toBeInTheDocument();
    expect(container.querySelector('.animate-spin')).toBeInTheDocument();
  });

  it('redirects to /login when there is no authenticated user', () => {
    useAuthMock.mockReturnValue({ user: null, loading: false });
    renderProtected();
    expect(screen.getByText('Login Page')).toBeInTheDocument();
    expect(screen.queryByText('Secret Content')).not.toBeInTheDocument();
  });

  it('renders the protected content when the user is authenticated and no permission is required', () => {
    useAuthMock.mockReturnValue({ user: { permissions: {} }, loading: false });
    renderProtected();
    expect(screen.getByText('Secret Content')).toBeInTheDocument();
  });

  it('renders the 403 page when the user lacks the required permission -- never silently redirecting', () => {
    useAuthMock.mockReturnValue({ user: { permissions: { EMPLOYEES: ['VIEW'] } }, loading: false });
    renderProtected('USERS', 'VIEW');
    expect(screen.queryByText('Secret Content')).not.toBeInTheDocument();
    expect(screen.getByText('403 — Access Denied')).toBeInTheDocument();
  });

  it('renders the protected content when the user does have the required permission', () => {
    useAuthMock.mockReturnValue({ user: { permissions: { USERS: ['VIEW'] } }, loading: false });
    renderProtected('USERS', 'VIEW');
    expect(screen.getByText('Secret Content')).toBeInTheDocument();
  });
});
