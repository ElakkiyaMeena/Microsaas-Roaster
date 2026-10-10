import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../test-utils';
import { ShareButton } from '../../components/sharing/ShareButton';
import type { Roast, ShareLink } from '../../types';

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

const createForRoast = vi.mocked(shareService.createForRoast);
const update = vi.mocked(shareService.update);
const remove = vi.mocked(shareService.remove);

const ROAST: Roast = {
  id: 7,
  submission_id: 3,
  intensity: 'medium',
  status: 'completed',
  score: 77,
  headline: 'Solid but sassy',
  summary: 'Mostly fine.',
  issues: [],
  strengths: [],
  model: 'test-model',
  error_message: null,
  created_at: '2026-10-01T10:00:00Z',
  completed_at: '2026-10-01T10:00:05Z',
  share_link: null,
};

const LINK: ShareLink = {
  id: 11,
  roast_id: 7,
  slug: 'slugSlug123',
  url: 'http://localhost:5173/r/slugSlug123',
  is_active: true,
  show_code: true,
  view_count: 0,
  expires_at: null,
  created_at: '2026-10-02T10:00:00Z',
};

describe('ShareButton', () => {
  beforeEach(() => {
    createForRoast.mockReset();
    update.mockReset();
    remove.mockReset();
  });

  it('creates a public link and shows its URL', async () => {
    const user = userEvent.setup();
    createForRoast.mockResolvedValue(LINK);
    renderWithProviders(<ShareButton roast={ROAST} />, { withAuth: false });

    await user.click(screen.getByRole('button', { name: /share/i }));
    await user.click(await screen.findByLabelText('Show my code publicly'));
    await user.click(screen.getByRole('button', { name: 'Create public link' }));

    expect(await screen.findByDisplayValue(LINK.url)).toBeInTheDocument();
    expect(createForRoast).toHaveBeenCalledWith(7, { show_code: true, expires_at: null });
    expect(screen.getByTestId('share-view-count')).toHaveTextContent('0');
    expect(screen.getByRole('button', { name: /revoke link/i })).toBeInTheDocument();
  });

  it('copies the link to the clipboard', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    renderWithProviders(<ShareButton roast={{ ...ROAST, share_link: LINK }} />, {
      withAuth: false,
    });

    await user.click(screen.getByRole('button', { name: /shared/i }));
    await user.click(await screen.findByRole('button', { name: /copy/i }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(LINK.url));
    expect(await screen.findByText('Link copied')).toBeInTheDocument();
  });

  it('revokes after confirmation', async () => {
    const user = userEvent.setup();
    remove.mockResolvedValue(undefined);
    renderWithProviders(<ShareButton roast={{ ...ROAST, share_link: LINK }} />, {
      withAuth: false,
    });

    await user.click(screen.getByRole('button', { name: /shared/i }));
    await user.click(await screen.findByRole('button', { name: /revoke link/i }));
    await user.click(screen.getByRole('button', { name: /yes, revoke/i }));

    await waitFor(() => expect(remove).toHaveBeenCalledWith(11));
    expect(await screen.findByRole('button', { name: 'Create public link' })).toBeInTheDocument();
  });

  it('is disabled when the roast is not completed', () => {
    renderWithProviders(<ShareButton roast={{ ...ROAST, status: 'pending' }} />, {
      withAuth: false,
    });
    expect(screen.getByRole('button', { name: /share/i })).toBeDisabled();
  });
});
