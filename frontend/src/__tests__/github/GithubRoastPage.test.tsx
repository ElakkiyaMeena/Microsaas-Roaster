import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError } from 'axios';
import { Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Roast, SubmissionDetail } from '../../types';

vi.mock('../../services/submissionService', () => ({
  DEFAULT_PER_PAGE: 10,
  list: vi.fn(),
  get: vi.fn(),
  createPaste: vi.fn(),
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
import GithubRoastPage from '../../pages/GithubRoastPage';
import { renderWithProviders } from '../test-utils';

const COMMIT_URL = 'https://github.com/octo/repo/commit/abcdef1234567';
const HEADLINE = 'Machi, intha commit message enna da';

const submission: SubmissionDetail = {
  id: 77,
  title: 'Add login form',
  assignment_brief: null,
  language: 'javascript',
  source_type: 'github_commit',
  source_url: 'https://github.com/octo/repo/commit/abcdef1234567890abcdef1234567890abcdef12',
  code_content: '+const a = 1;',
  created_at: '2026-10-10T10:00:00Z',
  updated_at: null,
  files: [],
  roasts: [],
};

const roast: Roast = {
  id: 9,
  submission_id: 77,
  intensity: 'savage',
  status: 'completed',
  score: 64,
  headline: HEADLINE,
  summary: 'Diff is okay-ish.',
  issues: [],
  strengths: ['Small focused change'],
  model: 'test',
  error_message: null,
  created_at: '2026-10-10T10:00:00Z',
  completed_at: '2026-10-10T10:00:01Z',
  share_link: null,
};

function apiError(status: number, detail: string, code: string): AxiosError {
  return new AxiosError('fail', 'ERR_BAD_REQUEST', undefined, undefined, {
    status,
    statusText: '',
    data: { detail, code },
    headers: {},
    config: { headers: {} } as never,
  });
}

function renderPage() {
  return renderWithProviders(
    <Routes>
      <Route path="/github-roast" element={<GithubRoastPage />} />
      <Route path="/submissions/:id" element={<div>detail page</div>} />
    </Routes>,
    { initialEntries: ['/github-roast'] },
  );
}

describe('GithubRoastPage', () => {
  beforeEach(() => {
    vi.mocked(roastService.getQuota).mockResolvedValue({ limit: 10, used_today: 3, remaining: 7 });
    vi.mocked(submissionService.createFromGithubCommit).mockReset();
    vi.mocked(roastService.create).mockReset();
  });

  it('validates the commit URL and does not call the API', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: /Roast this commit/ }));
    expect(await screen.findByText('Paste a GitHub commit link.')).toBeInTheDocument();

    const input = screen.getByLabelText(/Commit link/);
    await user.type(input, 'https://github.com/octo/repo/tree/main');
    await user.tab();
    expect(await screen.findByText(/look like a GitHub commit link/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Roast this commit/ }));

    expect(submissionService.createFromGithubCommit).not.toHaveBeenCalled();
    expect(roastService.create).not.toHaveBeenCalled();

    // Fixing the URL clears the error inline.
    await user.clear(input);
    await user.type(input, COMMIT_URL);
    expect(screen.queryByText(/look like a GitHub commit link/)).toBeNull();
    expect(screen.getByText(/Public repositories only/)).toBeInTheDocument();
  });

  it('creates the submission with language null (auto-detect), roasts it and shows the result here', async () => {
    vi.mocked(submissionService.createFromGithubCommit).mockResolvedValue(submission);
    vi.mocked(roastService.create).mockResolvedValue(roast);
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByText('7 of 10 roasts left today')).toBeInTheDocument();
    await user.type(screen.getByLabelText(/Commit link/), COMMIT_URL);
    await user.click(screen.getByRole('button', { name: /More options/ }));
    expect(screen.getByLabelText(/Language/)).toHaveDisplayValue('Auto-detect');
    expect(screen.getByLabelText(/Title/)).toHaveAttribute(
      'placeholder',
      'Defaults to the commit message',
    );
    await user.click(screen.getByRole('radio', { name: 'Savage intensity' }));
    await user.click(screen.getByRole('button', { name: /Roast this commit/ }));

    expect(await screen.findByRole('heading', { name: HEADLINE })).toBeInTheDocument();
    expect(submissionService.createFromGithubCommit).toHaveBeenCalledWith({
      commit_url: COMMIT_URL,
      language: null,
    });
    expect(roastService.create).toHaveBeenCalledWith(77, { intensity: 'savage' });

    const link = screen.getByRole('link', { name: /View commit octo\/repo@abcdef1 on GitHub/ });
    expect(link).toHaveAttribute('target', '_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
    expect(screen.getByRole('button', { name: /Share/ })).toBeInTheDocument();
    expect(screen.getByText('Small focused change')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /View full details/ }));
    expect(await screen.findByText('detail page')).toBeInTheDocument();
  });

  it('sends an explicit language, title and brief when chosen', async () => {
    vi.mocked(submissionService.createFromGithubCommit).mockResolvedValue(submission);
    vi.mocked(roastService.create).mockResolvedValue(roast);
    const user = userEvent.setup();
    renderPage();

    await user.type(await screen.findByLabelText(/Commit link/), COMMIT_URL);
    await user.click(screen.getByRole('button', { name: /More options/ }));
    await user.type(screen.getByLabelText(/Title/), 'Week 4');
    await user.selectOptions(screen.getByLabelText(/Language/), 'typescript');
    await user.type(screen.getByLabelText(/Assignment brief/), 'Build a form');
    await user.click(screen.getByRole('button', { name: /Roast this commit/ }));

    await waitFor(() =>
      expect(submissionService.createFromGithubCommit).toHaveBeenCalledWith({
        commit_url: COMMIT_URL,
        title: 'Week 4',
        assignment_brief: 'Build a form',
        language: 'typescript',
      }),
    );
  });

  it('shows a friendly alert when the commit is not found and does not roast', async () => {
    vi.mocked(submissionService.createFromGithubCommit).mockRejectedValue(
      apiError(
        404,
        'That commit does not exist or the repository is private.',
        'GITHUB_COMMIT_NOT_FOUND',
      ),
    );
    const user = userEvent.setup();
    renderPage();

    await user.type(await screen.findByLabelText(/Commit link/), COMMIT_URL);
    await user.click(screen.getByRole('button', { name: /Roast this commit/ }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Commit not found');
    expect(alert).toHaveTextContent('That commit does not exist or the repository is private.');
    expect(roastService.create).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /Roast this commit/ })).toBeEnabled();
  });

  it('shows the failure message with a retry button when the roast fails', async () => {
    vi.mocked(submissionService.createFromGithubCommit).mockResolvedValue(submission);
    vi.mocked(roastService.create)
      .mockResolvedValueOnce({
        ...roast,
        status: 'failed',
        score: null,
        headline: null,
        error_message: 'AI tripped.',
      })
      .mockResolvedValueOnce(roast);
    const user = userEvent.setup();
    renderPage();

    await user.type(await screen.findByLabelText(/Commit link/), COMMIT_URL);
    await user.click(screen.getByRole('button', { name: /Roast this commit/ }));

    expect(await screen.findByText('AI tripped.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('heading', { name: HEADLINE })).toBeInTheDocument();
    expect(roastService.create).toHaveBeenCalledTimes(2);
  });

  it('shows the daily limit message and resets for another commit', async () => {
    vi.mocked(submissionService.createFromGithubCommit).mockResolvedValue(submission);
    vi.mocked(roastService.create).mockRejectedValue(
      apiError(429, 'Daily roast limit reached.', 'ROAST_LIMIT_REACHED'),
    );
    const user = userEvent.setup();
    renderPage();

    await user.type(await screen.findByLabelText(/Commit link/), COMMIT_URL);
    await user.click(screen.getByRole('button', { name: /Roast this commit/ }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Daily roast limit reached');
    await user.click(screen.getByRole('button', { name: /Roast another commit/ }));
    expect(screen.getByLabelText(/Commit link/)).toHaveValue('');
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
