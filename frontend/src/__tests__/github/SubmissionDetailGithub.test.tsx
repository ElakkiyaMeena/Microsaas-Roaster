import { screen } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SubmissionDetail } from '../../types';

vi.mock('../../services/submissionService', () => ({
  DEFAULT_PER_PAGE: 10,
  list: vi.fn(),
  get: vi.fn(),
  createPaste: vi.fn(),
  createFromGithub: vi.fn(),
  createFromGithubCommit: vi.fn(),
  upload: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
}));

vi.mock('../../services/roastService', () => ({
  create: vi.fn(),
  listForSubmission: vi.fn(),
  get: vi.fn(),
  remove: vi.fn(),
  getQuota: vi.fn(),
}));

import * as submissionService from '../../services/submissionService';
import * as roastService from '../../services/roastService';
import SubmissionDetailPage from '../../pages/SubmissionDetailPage';
import { renderWithProviders } from '../test-utils';

const SHA = 'abcdef1234567890abcdef1234567890abcdef12';

function makeSubmission(overrides: Partial<SubmissionDetail> = {}): SubmissionDetail {
  return {
    id: 5,
    title: 'Fix login bug',
    assignment_brief: null,
    language: 'python',
    source_type: 'github_commit',
    source_url: `https://github.com/octo/repo/commit/${SHA}`,
    code_content: 'Fix login bug\n\n--- a/app.py\n+++ b/app.py\n@@ -1 +1 @@\n-old\n+new',
    created_at: '2026-10-10T10:00:00Z',
    updated_at: null,
    files: [],
    roasts: [],
    ...overrides,
  };
}

function renderPage() {
  return renderWithProviders(
    <Routes>
      <Route path="/submissions/:id" element={<SubmissionDetailPage />} />
    </Routes>,
    { initialEntries: ['/submissions/5'] },
  );
}

describe('SubmissionDetailPage for GitHub commits', () => {
  beforeEach(() => {
    vi.mocked(roastService.getQuota).mockResolvedValue({ limit: 10, used_today: 0, remaining: 10 });
    vi.mocked(submissionService.get).mockReset();
  });

  it('shows the GitHub badge, an external commit link and the commit diff', async () => {
    vi.mocked(submissionService.get).mockResolvedValue(makeSubmission());
    renderPage();

    const link = await screen.findByRole('link', {
      name: /View commit octo\/repo@abcdef1 on GitHub/,
    });
    expect(link).toHaveAttribute('href', `https://github.com/octo/repo/commit/${SHA}`);
    expect(link).toHaveAttribute('target', '_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
    expect(link.getAttribute('rel')).toContain('noreferrer');
    expect(link).toHaveTextContent('octo/repo@abcdef1');
    expect(screen.getByText('GitHub commit')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Commit diff' })).toBeInTheDocument();
    expect(screen.getByTestId('code-content').querySelector('[data-diff="add"]')).not.toBeNull();
  });

  it('shows the GitHub repo badge and repository link without diff colouring', async () => {
    vi.mocked(submissionService.get).mockResolvedValue(
      makeSubmission({
        title: 'repo',
        source_type: 'github_repo',
        source_url: 'https://github.com/octo/repo',
        code_content: '--- a/app.py\n+++ b/app.py\n+added = 1\n-removed = 2',
      }),
    );
    renderPage();

    const link = await screen.findByRole('link', {
      name: /View repository octo\/repo on GitHub/,
    });
    expect(link).toHaveAttribute('href', 'https://github.com/octo/repo');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
    expect(screen.getByText('GitHub repo')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Repository snapshot' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Commit diff' })).toBeNull();
    expect(screen.getByTestId('code-content').querySelector('[data-diff]')).toBeNull();
  });

  it('shows no commit link or diff colouring for pasted code', async () => {
    vi.mocked(submissionService.get).mockResolvedValue(
      makeSubmission({ source_type: 'paste', source_url: null, code_content: '+x = 1' }),
    );
    renderPage();

    expect(await screen.findByRole('heading', { name: 'Code' })).toBeInTheDocument();
    expect(screen.getByText('Paste')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /View commit/ })).toBeNull();
    expect(screen.getByTestId('code-content').querySelector('[data-diff]')).toBeNull();
  });
});
