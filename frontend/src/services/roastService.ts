import api from './api';
import type { CreateRoastPayload, Roast, RoastQuota } from '../types';

/**
 * POST /submissions/{id}/roasts. Generated synchronously; resolves with a roast whose
 * status is `completed` or `failed`. Rejects with 429 ROAST_LIMIT_REACHED / 503 AI_NOT_CONFIGURED.
 */
export async function create(submissionId: number, payload: CreateRoastPayload = {}): Promise<Roast> {
  const { data } = await api.post<Roast>(`/submissions/${submissionId}/roasts`, payload);
  return data;
}

/** GET /submissions/{id}/roasts — newest first. */
export async function listForSubmission(submissionId: number): Promise<Roast[]> {
  const { data } = await api.get<Roast[]>(`/submissions/${submissionId}/roasts`);
  return data;
}

/** GET /roasts/{id}. */
export async function get(id: number): Promise<Roast> {
  const { data } = await api.get<Roast>(`/roasts/${id}`);
  return data;
}

/** DELETE /roasts/{id}. */
export async function remove(id: number): Promise<void> {
  await api.delete(`/roasts/${id}`);
}

/** GET /roasts/quota — today's roast usage. */
export async function getQuota(): Promise<RoastQuota> {
  const { data } = await api.get<RoastQuota>('/roasts/quota');
  return data;
}

const roastService = { create, listForSubmission, get, remove, getQuota };
export default roastService;
