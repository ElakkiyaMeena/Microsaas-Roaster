import type { ReactNode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { AxiosError, AxiosHeaders } from 'axios';
import { describe, expect, it, vi } from 'vitest';
import { getErrorMessage, TOO_LARGE_MESSAGE } from '../../lib/errors';
import { shouldRetryQuery } from '../../lib/queryClient';
import { UPLOAD_LIMITS, validateIncomingFiles } from '../../components/submissions/uploadValidation';
import { roastKeys, useDeleteRoast } from '../../hooks/useRoasts';
import { submissionKeys, useDeleteSubmission } from '../../hooks/useSubmissions';
import * as roastService from '../../services/roastService';
import * as submissionService from '../../services/submissionService';
import { createTestQueryClient } from '../test-utils';

function axiosErrorWith(status: number, data: unknown): AxiosError {
  const config = { headers: new AxiosHeaders() };
  return new AxiosError('Request failed', 'ERR_BAD_RESPONSE', config, null, {
    status,
    statusText: '',
    headers: {},
    config,
    data,
  });
}

function fileOfSize(name: string, size: number): File {
  const file = new File(['x'], name);
  Object.defineProperty(file, 'size', { value: size });
  return file;
}

describe('getErrorMessage for proxy / size errors', () => {
  it('maps an HTML 413 from nginx to a friendly message', () => {
    const err = axiosErrorWith(413, '<html><body>413 Request Entity Too Large</body></html>');
    expect(getErrorMessage(err)).toBe(TOO_LARGE_MESSAGE);
  });

  it('maps the backend REQUEST_TOO_LARGE code', () => {
    const err = axiosErrorWith(413, { detail: 'Body exceeds limit', code: 'REQUEST_TOO_LARGE' });
    expect(getErrorMessage(err)).toBe(TOO_LARGE_MESSAGE);
  });

  it('maps an HTML 502 to a temporary-unavailability message', () => {
    expect(getErrorMessage(axiosErrorWith(502, '<html>Bad Gateway</html>'))).toMatch(/temporarily unavailable/);
  });
});

describe('shouldRetryQuery', () => {
  it('never retries 4xx and retries other errors once', () => {
    expect(shouldRetryQuery(0, axiosErrorWith(404, {}))).toBe(false);
    expect(shouldRetryQuery(0, axiosErrorWith(401, {}))).toBe(false);
    expect(shouldRetryQuery(0, axiosErrorWith(500, {}))).toBe(true);
    expect(shouldRetryQuery(1, axiosErrorWith(500, {}))).toBe(false);
    expect(shouldRetryQuery(0, new Error('network'))).toBe(true);
  });
});

describe('validateIncomingFiles total size', () => {
  it('rejects files that would push the selection over 25 MB', () => {
    const existing = [0, 1, 2, 3, 4].map((i) => fileOfSize(`a${i}.zip`, 4.8 * 1024 * 1024));
    const incoming = [fileOfSize('b.zip', 1.5 * 1024 * 1024), fileOfSize('c.py', 1000)];
    const result = validateIncomingFiles(existing, incoming);
    expect(UPLOAD_LIMITS.maxTotalBytes).toBe(25 * 1024 * 1024);
    expect(result.accepted.map((f) => f.name)).toEqual(['c.py']);
    expect(result.errors[0]).toMatch(/b\.zip: would exceed the 25\.0 MB total upload limit/);
  });
});

describe('delete mutations invalidate share links and quota', () => {
  function setup() {
    const queryClient = createTestQueryClient();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const invalidatedKeys = (): unknown[] => invalidate.mock.calls.map(([filters]) => filters?.queryKey);
    return { wrapper, invalidatedKeys };
  }

  it('useDeleteSubmission', async () => {
    vi.spyOn(submissionService, 'remove').mockResolvedValue(undefined);
    const { wrapper, invalidatedKeys } = setup();
    const { result } = renderHook(() => useDeleteSubmission(), { wrapper });
    await act(() => result.current.mutateAsync(7));
    expect(invalidatedKeys()).toEqual(
      expect.arrayContaining([submissionKeys.lists(), ['share-links'], roastKeys.quota()]),
    );
  });

  it('useDeleteRoast', async () => {
    vi.spyOn(roastService, 'remove').mockResolvedValue(undefined);
    const { wrapper, invalidatedKeys } = setup();
    const { result } = renderHook(() => useDeleteRoast(), { wrapper });
    await act(() => result.current.mutateAsync({ id: 3, submissionId: 7 }));
    expect(invalidatedKeys()).toEqual(expect.arrayContaining([['share-links'], roastKeys.quota()]));
  });
});
