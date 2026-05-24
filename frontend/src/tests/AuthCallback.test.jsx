import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import AuthCallback from '../components/AuthCallback';
import { vi } from 'vitest';
import * as api from '../lib/api';

vi.mock('../lib/api', () => ({
  exchangeAuthCode: vi.fn(),
}));

describe('AuthCallback Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    localStorage.clear();
  });

  it('TC-F-01: Handles OAuth error gracefully', async () => {
    render(
      <MemoryRouter initialEntries={['/auth/callback?error=access_denied&error_description=User%20cancelled']}>
        <Routes>
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route path="/" element={<div data-testid="home-page" />} />
        </Routes>
      </MemoryRouter>
    );

    // Should display the friendly error based on 'access_denied'
    expect(await screen.findByText('Authentication Error')).toBeInTheDocument();
    expect(screen.getByText('You cancelled the Agnic sign-in request.')).toBeInTheDocument();

    // Verify redirect happens after delay
    await waitFor(() => {
      expect(screen.getByTestId('home-page')).toBeInTheDocument();
    }, { timeout: 3500 });
  });

  it('TC-F-02: Handles successful token exchange', async () => {
    api.exchangeAuthCode.mockResolvedValueOnce({
      rb_session_token: 'test_rb_token',
      user: { id: 'u1', email: 'test@example.com', is_new_user: false },
      balance: 10,
    });

    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');

    render(
      <MemoryRouter initialEntries={['/auth/callback?code=test_code&state=valid_state']}>
        <Routes>
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route path="/setup/new" element={<div data-testid="setup-page" />} />
        </Routes>
      </MemoryRouter>
    );

    // Verify UI shows connecting state initially
    expect(screen.getByText('Signing you in…')).toBeInTheDocument();

    // Verify api was called
    await waitFor(() => {
      expect(api.exchangeAuthCode).toHaveBeenCalledWith(
        'test_code',
        'http://localhost:3000/auth/callback', // default redirectUri fallback
        'signin',
        ''
      );
    });

    // Verify localStorage was updated correctly
    expect(localStorage.getItem('rb_session_token')).toBe('test_rb_token');
    expect(JSON.parse(localStorage.getItem('rb_v2_user'))).toEqual({ id: 'u1', email: 'test@example.com', is_new_user: false });
    expect(localStorage.getItem('rb_v2_balance')).toBe('10');

    // Verify custom event was dispatched
    expect(dispatchSpy).toHaveBeenCalledWith(expect.any(CustomEvent));
    expect(dispatchSpy.mock.calls[0][0].type).toBe('rb:auth-changed');

    // Verify navigation to setup page
    await waitFor(() => {
      expect(screen.getByTestId('setup-page')).toBeInTheDocument();
    });
  });

  it('TC-F-02: Handles malformed/missing code', async () => {
    render(
      <MemoryRouter initialEntries={['/auth/callback']}>
        <Routes>
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route path="/" element={<div data-testid="home-page" />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByText('Agnic did not return a sign-in code. Please try again.')).toBeInTheDocument();

    // Verify redirect
    await waitFor(() => {
      expect(screen.getByTestId('home-page')).toBeInTheDocument();
    }, { timeout: 2500 });
  });
});
