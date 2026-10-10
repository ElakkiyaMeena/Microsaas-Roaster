import { AxiosError, AxiosHeaders } from 'axios';
import { describe, expect, it } from 'vitest';
import { getErrorCode, getErrorMessage } from '../lib/errors';

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

describe('getErrorMessage', () => {
  it('reads response.data.detail', () => {
    const err = axiosErrorWith(409, { detail: 'Email already registered', code: 'EMAIL_EXISTS' });
    expect(getErrorMessage(err)).toBe('Email already registered');
    expect(getErrorCode(err)).toBe('EMAIL_EXISTS');
  });

  it('falls back when detail is not a string', () => {
    const err = axiosErrorWith(422, { detail: [{ msg: 'bad' }] });
    expect(getErrorMessage(err, 'Fallback')).toBe('Fallback');
  });

  it('handles plain errors and unknown values', () => {
    expect(getErrorMessage(new Error('boom'))).toBe('boom');
    expect(getErrorMessage('weird', 'Fallback')).toBe('Fallback');
  });
});
