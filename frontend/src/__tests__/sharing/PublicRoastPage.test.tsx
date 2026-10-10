import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { AxiosError, AxiosHeaders } from 'axios';
import { renderWithProviders } from '../test-utils';
import PublicRoastPage from '../../pages/PublicRoastPage';
import type { PublicRoast } from '../../types';

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

const getPublic = vi.mocked(shareService.getPublic);

const ROAST: PublicRoast = {
  slug: 'abc123XYZ_def',
  submission_title: 'FizzBuzz Deluxe',
  language: 'python',
  intensity: 'savage',
  score: 42,
  headline: 'Your loops have loops',
  summary: 'Nested loops everywhere, but the logic is sound.',
  issues: [
    {
      file: 'main.py',
      line: 3,
      severity: 'high',
      category: 'performance',
      message: 'Quadratic loop for a linear problem',
      suggested_fix: 'Use a single pass',
    },
  ],
  strengths: ['Clear variable names'],
  code_content: 'for i in range(10):\n    print(i)',
  author_name: 'Ada',
  created_at: '2026-10-01T10:00:00Z',
};

function renderAt(slug: string) {
  return renderWithProviders(
    <Routes>
      <Route path="/r/:slug" element={<PublicRoastPage />} />
    </Routes>,
    { initialEntries: [`/r/${slug}`], withAuth: false },
  );
}

function notFoundError(): AxiosError {
  const headers = new AxiosHeaders();
  return new AxiosError('Not Found', 'ERR_BAD_REQUEST', { headers }, null, {
    status: 404,
    statusText: 'Not Found',
    headers: {},
    config: { headers },
    data: { detail: 'Share link not found', code: 'NOT_FOUND' },
  });
}

describe('PublicRoastPage', () => {
  beforeEach(() => {
    getPublic.mockReset();
  });

  it('renders the shared roast', async () => {
    getPublic.mockResolvedValue(ROAST);
    renderAt(ROAST.slug);

    expect(await screen.findByText('FizzBuzz Deluxe')).toBeInTheDocument();
    expect(getPublic).toHaveBeenCalledWith(ROAST.slug);
    expect(screen.getByRole('heading', { name: 'Your loops have loops' })).toBeInTheDocument();
    expect(screen.getByText('Roasted for Ada')).toBeInTheDocument();
    expect(screen.getByText('Python')).toBeInTheDocument();
    expect(screen.getByText('The code in question')).toBeInTheDocument();
    expect(screen.getByText('Get your own code roasted')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Assignment Roaster/ })).toHaveAttribute('href', '/');
    expect(document.title).toBe('Your loops have loops — Assignment Roaster');
    expect(
      document.head.querySelector('meta[property="og:title"]')?.getAttribute('content'),
    ).toBe('Your loops have loops — Assignment Roaster');
  });

  it('hides the code section when code_content is null', async () => {
    getPublic.mockResolvedValue({ ...ROAST, code_content: null, author_name: null });
    renderAt(ROAST.slug);

    expect(await screen.findByText('FizzBuzz Deluxe')).toBeInTheDocument();
    expect(screen.queryByText('The code in question')).not.toBeInTheDocument();
    expect(screen.queryByText(/Roasted for/)).not.toBeInTheDocument();
  });

  it('shows a friendly not-found state on 404', async () => {
    getPublic.mockRejectedValue(notFoundError());
    renderAt('missing-slug');

    expect(await screen.findByText('This roast has cooled down')).toBeInTheDocument();
    expect(screen.getByText(/expired or was removed/)).toBeInTheDocument();
    expect(getPublic).toHaveBeenCalledTimes(1);
  });
});
