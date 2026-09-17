import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { Login } from '../../src/pages/Login';

const { useAuthMock, apiErrorMessageMock, apiPostMock } = vi.hoisted(() => ({
  useAuthMock: vi.fn(),
  apiErrorMessageMock: vi.fn((_err: unknown, fallback: string) => fallback),
  apiPostMock: vi.fn(),
}));

vi.mock('../../src/context/AuthContext', () => ({
  useAuth: useAuthMock,
  apiErrorMessage: apiErrorMessageMock,
}));

vi.mock('../../src/api/client', () => ({
  api: { post: apiPostMock },
}));

function renderLogin() {
  return render(
    <MemoryRouter initialEntries={['/login']}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/dashboard" element={<div>Dashboard Page</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('Login page', () => {
  it('masks the password by default and reveals it when the show/hide toggle is clicked', async () => {
    const user = userEvent.setup();
    useAuthMock.mockReturnValue({ user: null, loading: false, login: vi.fn(), verifyTwoFactor: vi.fn() });
    renderLogin();

    const passwordInput = screen.getByLabelText('Password') as HTMLInputElement;
    expect(passwordInput.type).toBe('password');

    await user.click(screen.getByLabelText('Show password'));
    expect(passwordInput.type).toBe('text');

    await user.click(screen.getByLabelText('Hide password'));
    expect(passwordInput.type).toBe('password');
  });

  it('submits the entered credentials and navigates to the dashboard on success', async () => {
    const user = userEvent.setup();
    const login = vi.fn().mockResolvedValue({});
    useAuthMock.mockReturnValue({ user: null, loading: false, login, verifyTwoFactor: vi.fn() });
    renderLogin();

    await user.type(screen.getByLabelText('Email or Employee ID'), 'superadmin@nimbuscorp.com');
    await user.type(screen.getByLabelText('Password'), 'Password123!');
    await user.click(screen.getByRole('checkbox', { name: /remember me/i }));
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => expect(login).toHaveBeenCalledWith('superadmin@nimbuscorp.com', 'Password123!', true));
    await waitFor(() => expect(screen.getByText('Dashboard Page')).toBeInTheDocument());
  });

  it('shows an error message and stays on the login form when credentials are rejected', async () => {
    const user = userEvent.setup();
    const login = vi.fn().mockRejectedValue(new Error('nope'));
    useAuthMock.mockReturnValue({ user: null, loading: false, login, verifyTwoFactor: vi.fn() });
    renderLogin();

    await user.type(screen.getByLabelText('Email or Employee ID'), 'someone@nimbuscorp.com');
    await user.type(screen.getByLabelText('Password'), 'WrongPassword1');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByText('Invalid credentials. Please try again.')).toBeInTheDocument();
    expect(screen.getByLabelText('Email or Employee ID')).toBeInTheDocument();
  });

  it('moves to the two-factor step instead of navigating away when the server requires it', async () => {
    const user = userEvent.setup();
    const login = vi.fn().mockResolvedValue({ requiresTwoFactor: true, tempToken: 'temp-token-123' });
    useAuthMock.mockReturnValue({ user: null, loading: false, login, verifyTwoFactor: vi.fn() });
    renderLogin();

    await user.type(screen.getByLabelText('Email or Employee ID'), 'superadmin@nimbuscorp.com');
    await user.type(screen.getByLabelText('Password'), 'Password123!');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByText('Two-factor verification')).toBeInTheDocument();
    expect(screen.queryByText('Dashboard Page')).not.toBeInTheDocument();
  });

  it('lets the user request a password reset without touching the login form fields', async () => {
    const user = userEvent.setup();
    apiPostMock.mockResolvedValue({ data: { success: true, message: 'If an account exists, password reset instructions have been sent.' } });
    useAuthMock.mockReturnValue({ user: null, loading: false, login: vi.fn(), verifyTwoFactor: vi.fn() });
    renderLogin();

    await user.click(screen.getByText('Forgot password?'));
    expect(screen.getByText('Reset your password')).toBeInTheDocument();

    await user.type(screen.getByLabelText('Email or Employee ID'), 'someone@nimbuscorp.com');
    await user.click(screen.getByRole('button', { name: 'Send reset instructions' }));

    await waitFor(() => expect(apiPostMock).toHaveBeenCalledWith('/auth/forgot-password', { identifier: 'someone@nimbuscorp.com' }));
    expect(await screen.findByText('If an account exists, password reset instructions have been sent.')).toBeInTheDocument();
  });

  it('redirects straight to the dashboard if the user is already authenticated', () => {
    useAuthMock.mockReturnValue({ user: { id: 'u1' }, loading: false, login: vi.fn(), verifyTwoFactor: vi.fn() });
    renderLogin();
    expect(screen.getByText('Dashboard Page')).toBeInTheDocument();
  });
});
