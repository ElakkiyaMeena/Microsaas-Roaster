import { beforeEach, describe, expect, it, vi } from 'vitest';

const post = vi.fn();
const get = vi.fn();

vi.mock('../../services/api', () => ({
  default: { post: (...args: unknown[]) => post(...args), get: (...args: unknown[]) => get(...args) },
}));

import { buildUploadFormData, list, upload } from '../../services/submissionService';

describe('submissionService', () => {
  beforeEach(() => {
    post.mockReset();
    get.mockReset();
  });

  it('upload() posts multipart FormData with repeated `files` fields', async () => {
    post.mockResolvedValue({ data: { id: 7 } });
    const a = new File(['print(1)'], 'a.py', { type: 'text/x-python' });
    const b = new File(['console.log(1)'], 'b.js', { type: 'text/javascript' });

    const result = await upload({
      title: 'My upload',
      language: 'python',
      assignment_brief: '  Build a CLI  ',
      files: [a, b],
    });

    expect(result).toEqual({ id: 7 });
    expect(post).toHaveBeenCalledTimes(1);
    const [url, body, config] = post.mock.calls[0] as [string, FormData, { headers: Record<string, string> }];
    expect(url).toBe('/submissions/upload');
    expect(body).toBeInstanceOf(FormData);
    expect(body.get('title')).toBe('My upload');
    expect(body.get('language')).toBe('python');
    expect(body.get('assignment_brief')).toBe('Build a CLI');
    const files = body.getAll('files') as File[];
    expect(files).toHaveLength(2);
    expect(files.map((f) => f.name)).toEqual(['a.py', 'b.js']);
    expect(config.headers['Content-Type']).toBe('multipart/form-data');
  });

  it('omits an empty assignment brief', () => {
    const form = buildUploadFormData({
      title: 't',
      language: 'go',
      assignment_brief: '   ',
      files: [new File(['x'], 'main.go')],
    });
    expect(form.has('assignment_brief')).toBe(false);
  });

  it('reports upload progress as a percentage', async () => {
    post.mockImplementation(
      (_url: string, _body: FormData, config: { onUploadProgress: (e: { loaded: number; total: number }) => void }) => {
        config.onUploadProgress({ loaded: 50, total: 200 });
        return Promise.resolve({ data: { id: 1 } });
      },
    );
    const onProgress = vi.fn();
    await upload(
      { title: 't', language: 'python', files: [new File(['x'], 'a.py')] },
      { onUploadProgress: onProgress },
    );
    expect(onProgress).toHaveBeenCalledWith(25);
  });

  it('list() passes pagination params', async () => {
    get.mockResolvedValue({ data: { items: [], total: 0, page: 2, per_page: 5 } });
    await list(2, 5);
    expect(get).toHaveBeenCalledWith('/submissions', { params: { page: 2, per_page: 5 } });
  });
});
