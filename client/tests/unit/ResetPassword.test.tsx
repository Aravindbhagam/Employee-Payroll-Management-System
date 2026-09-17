import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ResetPassword } from '../../src/pages/ResetPassword';

const { apiErrorMessageMock, apiPostMock } = vi.hoisted(() => ({
  apiErrorMessageMock: vi.fn((_err: unknown, fallback: string) => fallback),
  apiPostMock: vi.fn(),
}));

vi.mock('../../src/api/client', () => ({
  api: { post: apiPostMock },
  apiErrorMessage: apiErrorMessageMock,
}));

function renderResetPassword(initialEntry: string) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/login" element={<div>Login Page</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('ResetPassword page', () => {
  it('shows an "invalid reset link" message when no token is present in the URL', () => {
    renderResetPassword('/reset-password');
    expect(screen.getByText('Invalid reset link')).toBeInTheDocument();
  });

  it('submits the token and new password, then shows a success message', async () => {
    const user = userEvent.setup();
    apiPostMock.mockResolvedValue({ data: { success: true, message: 'Password has been reset. Please log in with your new password.' } });
    renderResetPassword('/reset-password?token=abc123');

    await user.type(screen.getByLabelText('New password'), 'NewPassword456!');
    await user.click(screen.getByRole('button', { name: 'Reset password' }));

    await waitFor(() => expect(apiPostMock).toHaveBeenCalledWith('/auth/reset-password', { token: 'abc123', newPassword: 'NewPassword456!' }));
    expect(await screen.findByText('Password has been reset. Please log in with your new password.')).toBeInTheDocument();
  });

  it('shows an error message when the reset request fails', async () => {
    const user = userEvent.setup();
    apiPostMock.mockRejectedValue(new Error('nope'));
    renderResetPassword('/reset-password?token=expired-token');

    await user.type(screen.getByLabelText('New password'), 'NewPassword456!');
    await user.click(screen.getByRole('button', { name: 'Reset password' }));

    expect(await screen.findByText('Failed to reset password.')).toBeInTheDocument();
  });

  it('navigates back to sign in after a successful reset', async () => {
    const user = userEvent.setup();
    apiPostMock.mockResolvedValue({ data: { success: true, message: 'Password has been reset.' } });
    renderResetPassword('/reset-password?token=abc123');

    await user.type(screen.getByLabelText('New password'), 'NewPassword456!');
    await user.click(screen.getByRole('button', { name: 'Reset password' }));
    await screen.findByText('Password has been reset.');

    await user.click(screen.getByRole('button', { name: 'Back to sign in' }));
    expect(await screen.findByText('Login Page')).toBeInTheDocument();
  });
});
