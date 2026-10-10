import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AppRoutes } from '../App';
import { renderWithProviders } from './test-utils';

describe('App smoke', () => {
  it('renders the 404 page for unknown routes', async () => {
    renderWithProviders(<AppRoutes />, { initialEntries: ['/definitely-not-a-route'] });
    expect(await screen.findByText('404', {}, { timeout: 5000 })).toBeInTheDocument();
  });

  it('redirects unauthenticated users from protected routes to /login', async () => {
    renderWithProviders(<AppRoutes />, { initialEntries: ['/dashboard'] });
    expect(await screen.findByRole('heading', { name: 'Log in' }, { timeout: 5000 })).toBeInTheDocument();
  });

  it('renders the public landing page', async () => {
    renderWithProviders(<AppRoutes />, { initialEntries: ['/'] });
    expect(await screen.findByRole('heading', { name: 'Assignment Roaster' }, { timeout: 5000 })).toBeInTheDocument();
  });
});
