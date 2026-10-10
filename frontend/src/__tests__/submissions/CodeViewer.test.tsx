import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CodeViewer } from '../../components/roast/CodeViewer';
import { renderWithProviders } from '../test-utils';

describe('CodeViewer', () => {
  it('renders one line number per line of code', () => {
    renderWithProviders(<CodeViewer code={'a = 1\nb = 2\nprint(a + b)\n'} language="python" />, {
      withAuth: false,
    });
    expect(screen.getByTestId('code-gutter').textContent).toBe('1\n2\n3');
    expect(screen.getByTestId('code-content').textContent).toBe('a = 1\nb = 2\nprint(a + b)');
    expect(screen.getByRole('region', { name: 'Code (Python)' })).toBeInTheDocument();
  });

  it('normalizes CRLF line endings', () => {
    renderWithProviders(<CodeViewer code={'x\r\ny\r\nz'} language="other" />, { withAuth: false });
    expect(screen.getByTestId('code-gutter').textContent).toBe('1\n2\n3');
  });

  it('renders code as text, never as HTML', () => {
    const { container } = renderWithProviders(
      <CodeViewer code={'<img src=x onerror="alert(1)"><b>bold</b>'} language="html_css" />,
      { withAuth: false },
    );
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('b')).toBeNull();
    expect(screen.getByTestId('code-content').textContent).toContain('<b>bold</b>');
  });
});
