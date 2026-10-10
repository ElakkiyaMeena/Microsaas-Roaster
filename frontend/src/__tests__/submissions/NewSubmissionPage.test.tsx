import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Roast, SubmissionDetail } from '../../types';

vi.mock('../../services/submissionService', () => ({
  DEFAULT_PER_PAGE: 10,
  list: vi.fn(),
  get: vi.fn(),
  createPaste: vi.fn(),
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
import NewSubmissionPage from '../../pages/NewSubmissionPage';
import { renderWithProviders } from '../test-utils';

const submission: SubmissionDetail = {
  id: 42,
  title: 'Week 1',
  assignment_brief: null,
  language: 'python',
  source_type: 'paste',
  source_url: null,
  code_content: 'print(1)',
  created_at: '2026-10-10T10:00:00Z',
  updated_at: null,
  files: [],
  roasts: [],
};

const roast: Roast = {
  id: 9,
  submission_id: 42,
  intensity: 'medium',
  status: 'completed',
  score: 80,
  headline: 'Not bad',
  summary: 'ok',
  issues: [],
  strengths: [],
  model: 'test',
  error_message: null,
  created_at: '2026-10-10T10:00:00Z',
  completed_at: '2026-10-10T10:00:01Z',
  share_link: null,
};

function renderPage() {
  return renderWithProviders(
    <Routes>
      <Route path="/submissions/new" element={<NewSubmissionPage />} />
      <Route path="/submissions/:id" element={<div>detail page</div>} />
    </Routes>,
    { initialEntries: ['/submissions/new'] },
  );
}

describe('NewSubmissionPage', () => {
  beforeEach(() => {
    vi.mocked(roastService.getQuota).mockResolvedValue({ limit: 10, used_today: 3, remaining: 7 });
    vi.mocked(submissionService.createPaste).mockReset();
    vi.mocked(roastService.create).mockReset();
  });

  it('requires a title and does not call the API', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: /Roast it/ }));
    expect(await screen.findByText('Title is required.')).toBeInTheDocument();
    expect(screen.getByText('Paste some code to roast.')).toBeInTheDocument();
    expect(submissionService.createPaste).not.toHaveBeenCalled();
    expect(roastService.create).not.toHaveBeenCalled();
  });

  it('shows the remaining quota', async () => {
    renderPage();
    expect(await screen.findByText('7 of 10 roasts left today')).toBeInTheDocument();
  });

  it('creates the submission, roasts it, then navigates to the detail page', async () => {
    vi.mocked(submissionService.createPaste).mockResolvedValue(submission);
    vi.mocked(roastService.create).mockResolvedValue(roast);
    const user = userEvent.setup();
    renderPage();

    await user.type(await screen.findByLabelText(/Title/), 'Week 1');
    await user.type(screen.getByLabelText(/Your code/), 'print(1)');
    await user.click(screen.getByRole('radio', { name: 'Savage intensity' }));
    await user.click(screen.getByRole('button', { name: /Roast it/ }));

    expect(await screen.findByText('detail page')).toBeInTheDocument();
    expect(submissionService.createPaste).toHaveBeenCalledWith({
      title: 'Week 1',
      language: 'python',
      assignment_brief: null,
      code_content: 'print(1)',
    });
    expect(roastService.create).toHaveBeenCalledWith(42, { intensity: 'savage' });
  });

  it('still navigates to the submission when the daily roast limit is hit', async () => {
    vi.mocked(submissionService.createPaste).mockResolvedValue(submission);
    const { AxiosError } = await import('axios');
    const err = new AxiosError('limit', 'ERR_BAD_REQUEST', undefined, undefined, {
      status: 429,
      statusText: 'Too Many Requests',
      data: { detail: 'Daily roast limit reached.', code: 'ROAST_LIMIT_REACHED' },
      headers: {},
      config: { headers: {} } as never,
    });
    vi.mocked(roastService.create).mockRejectedValue(err);
    const user = userEvent.setup();
    renderPage();

    await user.type(await screen.findByLabelText(/Title/), 'Week 1');
    await user.type(screen.getByLabelText(/Your code/), 'x = 1');
    await user.click(screen.getByRole('button', { name: /Roast it/ }));

    await waitFor(() => expect(screen.getByText('detail page')).toBeInTheDocument());
    expect(await screen.findByText('Daily roast limit reached')).toBeInTheDocument();
  });
});
