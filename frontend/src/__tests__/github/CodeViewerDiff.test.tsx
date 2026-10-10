import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CodeViewer } from '../../components/roast/CodeViewer';
import { renderWithProviders } from '../test-utils';

const DIFF = [
  'diff --git a/app.py b/app.py',
  '--- a/app.py',
  '+++ b/app.py',
  '@@ -1,2 +1,2 @@',
  ' import os',
  '-print("old")',
  '+print("new") <b>x</b>',
].join('\n');

describe('CodeViewer diff mode', () => {
  it('colours added / removed / hunk lines while keeping the text identical', () => {
    const { container } = renderWithProviders(<CodeViewer code={DIFF} language="python" diff />, {
      withAuth: false,
    });
    const content = screen.getByTestId('code-content');
    expect(content.textContent).toBe(DIFF);
    expect(screen.getByTestId('code-gutter').textContent).toBe('1\n2\n3\n4\n5\n6\n7');

    const kinds = Array.from(content.querySelectorAll('[data-diff]')).map((el) =>
      el.getAttribute('data-diff'),
    );
    expect(kinds).toEqual(['meta', 'meta', 'meta', 'hunk', 'context', 'del', 'add']);

    const added = content.querySelector('[data-diff="add"]');
    const removed = content.querySelector('[data-diff="del"]');
    expect(added?.textContent).toBe('+print("new") <b>x</b>');
    expect(removed?.textContent).toBe('-print("old")');
    // Colours come from Chakra style props (classes), not inline styles or injected HTML.
    expect(added?.getAttribute('style')).toBeNull();
    expect(added?.className).not.toBe(removed?.className);
    expect(container.querySelector('b')).toBeNull();
  });

  it('renders plain text without diff spans by default', () => {
    renderWithProviders(<CodeViewer code={'+not a diff'} language="python" />, { withAuth: false });
    expect(screen.getByTestId('code-content').querySelector('[data-diff]')).toBeNull();
  });
});
