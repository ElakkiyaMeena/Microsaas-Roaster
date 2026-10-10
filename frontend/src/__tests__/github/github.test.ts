import { describe, expect, it } from 'vitest';
import {
  COMMIT_URL_INVALID,
  COMMIT_URL_REQUIRED,
  GITHUB_URL_INVALID,
  GITHUB_URL_REQUIRED,
  isGithubCommitUrl,
  isGithubUrl,
  parseGithubCommitUrl,
  parseGithubUrl,
  shortCommitLabel,
  shortGithubLabel,
  validateCommitUrl,
  validateGithubUrl,
} from '../../lib/github';
import { classifyDiffLine } from '../../lib/diff';

const SHA40 = '0123456789abcdef0123456789abcdef01234567';

describe('isGithubCommitUrl', () => {
  it.each([
    'https://github.com/octo/repo/commit/abc1234',
    `https://github.com/octo/repo/commit/${SHA40}`,
    `https://github.com/octo/repo/commit/${SHA40}/`,
    'https://github.com/octo/repo/commit/ABC1234?diff=split',
    'https://github.com/octo/repo/commit/abc1234#diff-123',
    'https://www.github.com/octo-cat/my.repo_name/commit/abc1234',
    'https://github.com/octo/repo/pull/42/commits/abc1234',
    `https://github.com/octo/repo/pull/42/commits/${SHA40}?w=1`,
    '  https://github.com/octo/repo/commit/abc1234  ',
  ])('accepts %s', (url) => {
    expect(isGithubCommitUrl(url)).toBe(true);
  });

  it.each([
    '',
    'not a url',
    'http://github.com/octo/repo/commit/abc1234',
    'https://gitlab.com/octo/repo/commit/abc1234',
    'https://github.com.evil.com/octo/repo/commit/abc1234',
    'https://evil.com/github.com/octo/repo/commit/abc1234',
    'https://github.com/octo/repo/commit/abc12',
    'https://github.com/octo/repo/commit/xyz1234',
    `https://github.com/octo/repo/commit/${SHA40}0`,
    'https://github.com/octo/repo',
    'https://github.com/octo/repo/tree/main',
    'https://github.com/octo/repo/pull/42',
    'https://github.com/octo/../commit/abc1234',
    'https://github.com/octo/repo/commit/abc1234/extra',
  ])('rejects %s', (url) => {
    expect(isGithubCommitUrl(url)).toBe(false);
  });
});

describe('parseGithubCommitUrl / shortCommitLabel', () => {
  it('extracts owner, repo and lowercased sha', () => {
    expect(parseGithubCommitUrl('https://github.com/Octo/Repo/commit/ABCDEF1234')).toEqual({
      owner: 'Octo',
      repo: 'Repo',
      sha: 'abcdef1234',
    });
  });

  it('formats owner/repo@sha7', () => {
    expect(shortCommitLabel(`https://github.com/octo/repo/commit/${SHA40}`)).toBe('octo/repo@0123456');
    expect(shortCommitLabel('https://github.com/octo/repo/pull/3/commits/abcdef12345')).toBe(
      'octo/repo@abcdef1',
    );
  });

  it('falls back to the raw value when unparseable', () => {
    expect(shortCommitLabel('https://example.com')).toBe('https://example.com');
  });
});

describe('validateCommitUrl', () => {
  it('returns messages for empty and invalid values', () => {
    expect(validateCommitUrl('   ')).toBe(COMMIT_URL_REQUIRED);
    expect(validateCommitUrl('https://github.com/octo/repo')).toBe(COMMIT_URL_INVALID);
    expect(validateCommitUrl('https://github.com/octo/repo/commit/abc1234')).toBeUndefined();
  });
});

describe('classifyDiffLine', () => {
  it('classifies unified diff lines', () => {
    expect(classifyDiffLine('+added')).toBe('add');
    expect(classifyDiffLine('-removed')).toBe('del');
    expect(classifyDiffLine('@@ -1,2 +1,3 @@')).toBe('hunk');
    expect(classifyDiffLine('+++ b/app.py')).toBe('meta');
    expect(classifyDiffLine('--- a/app.py')).toBe('meta');
    expect(classifyDiffLine('diff --git a/x b/x')).toBe('meta');
    expect(classifyDiffLine(' context')).toBe('context');
  });
});

describe('parseGithubUrl', () => {
  it.each([
    ['https://github.com/octo/repo', { kind: 'repo', owner: 'octo', repo: 'repo' }],
    ['https://github.com/octo/repo/', { kind: 'repo', owner: 'octo', repo: 'repo' }],
    ['https://www.github.com/octo/repo', { kind: 'repo', owner: 'octo', repo: 'repo' }],
    ['https://github.com/octo/repo.git', { kind: 'repo', owner: 'octo', repo: 'repo' }],
    ['https://github.com/octo/my.repo_name?tab=readme', { kind: 'repo', owner: 'octo', repo: 'my.repo_name' }],
    ['https://github.com/octo/repo#readme', { kind: 'repo', owner: 'octo', repo: 'repo' }],
    ['https://github.com/octo/repo/tree/main', { kind: 'repo', owner: 'octo', repo: 'repo', ref: 'main' }],
    [
      'https://github.com/octo/repo/tree/feature/login-form/',
      { kind: 'repo', owner: 'octo', repo: 'repo', ref: 'feature/login-form' },
    ],
    ['  https://github.com/octo/repo  ', { kind: 'repo', owner: 'octo', repo: 'repo' }],
    [
      `https://github.com/octo/repo/commit/${SHA40.toUpperCase()}`,
      { kind: 'commit', owner: 'octo', repo: 'repo', sha: SHA40 },
    ],
    [
      'https://github.com/octo/repo/pull/7/commits/abcdef1',
      { kind: 'commit', owner: 'octo', repo: 'repo', sha: 'abcdef1' },
    ],
  ])('parses %s', (url, expected) => {
    expect(parseGithubUrl(url)).toEqual(expected);
  });

  it.each([
    '',
    'https://github.com/octo',
    'https://github.com/octo/',
    'https://github.com/octo/repo/issues',
    'https://github.com/octo/repo/issues/12',
    'https://github.com/octo/repo/blob/main/app.py',
    'https://github.com/octo/repo/pull/42',
    'https://github.com/octo/repo/tree/',
    'https://github.com/octo/repo/tree/../main',
    'http://github.com/octo/repo',
    'https://gitlab.com/octo/repo',
    'https://github.com.evil.com/octo/repo',
    'https://gist.github.com/octo/abcdef1234567',
    'https://github.com/orgs/octo',
    'https://github.com/octo/..',
  ])('rejects %s', (url) => {
    expect(parseGithubUrl(url)).toBeNull();
    expect(isGithubUrl(url)).toBe(false);
  });
});

describe('shortGithubLabel / validateGithubUrl', () => {
  it('formats repo, ref and commit links', () => {
    expect(shortGithubLabel('https://github.com/octo/repo.git')).toBe('octo/repo');
    expect(shortGithubLabel('https://github.com/octo/repo/tree/dev')).toBe('octo/repo (dev)');
    expect(shortGithubLabel(`https://github.com/octo/repo/commit/${SHA40}`)).toBe('octo/repo@0123456');
    expect(shortGithubLabel('https://example.com/x')).toBe('https://example.com/x');
  });

  it('returns messages for empty and invalid values', () => {
    expect(validateGithubUrl('  ')).toBe(GITHUB_URL_REQUIRED);
    expect(validateGithubUrl('https://github.com/octo/repo/issues')).toBe(GITHUB_URL_INVALID);
    expect(validateGithubUrl('https://github.com/octo/repo')).toBeUndefined();
    expect(validateGithubUrl('https://github.com/octo/repo/commit/abc1234')).toBeUndefined();
  });
});
