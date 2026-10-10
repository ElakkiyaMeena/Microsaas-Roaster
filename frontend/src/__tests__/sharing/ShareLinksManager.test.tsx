import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../test-utils';
import { ShareLinksManager } from '../../components/sharing/ShareLinksManager';
import type { ShareLinkListItem } from '../../types';

vi.mock('../../services/shareService', () => {
  const mocked = {
    createForRoast: vi.fn(),
    listMine: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    getPublic: vi.fn(),
  };
  return { default: mocked, ...mocked };
});

import shareService from '../../services/shareService';

const listMine = vi.mocked(shareService.listMine);
const update = vi.mocked(shareService.update);

const ITEM: ShareLinkListItem = {
  id: 5,
  roast_id: 9,
  slug: 'abcdefghijk',
  url: 'http://localhost:5173/r/abcdefghijk',
  is_active: true,
  show_code: false,
  view_count: 12,
  expires_at: null,
  created_at: '2026-10-02T10:00:00Z',
  roast_headline: 'Spaghetti, al dente',
  submission_title: 'Todo App',
};

describe('ShareLinksManager', () => {
  beforeEach(() => {
    listMine.mockReset();
    update.mockReset();
  });

  it('shows an empty state when there are no links', async () => {
    listMine.mockResolvedValue([]);
    renderWithProviders(<ShareLinksManager />, { withAuth: false });
    expect(await screen.findByText('No share links yet')).toBeInTheDocument();
  });

  it('lists links and toggles show_code', async () => {
    const user = userEvent.setup();
    listMine.mockResolvedValue([ITEM]);
    update.mockResolvedValue({ ...ITEM, show_code: true });
    renderWithProviders(<ShareLinksManager />, { withAuth: false });

    expect(await screen.findByText('Todo App')).toBeInTheDocument();
    expect(screen.getByText('Spaghetti, al dente')).toBeInTheDocument();
    expect(screen.getByText(/12/)).toBeInTheDocument();

    await user.click(screen.getByLabelText('Show code'));
    await waitFor(() => expect(update).toHaveBeenCalledWith(5, { show_code: true }));
  });
});
