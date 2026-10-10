import { fireEvent, render, screen } from '@testing-library/react';
import { ChakraProvider } from '@chakra-ui/react';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { ErrorBoundary } from '../../components/ErrorBoundary';
import {
  CHUNK_RELOAD_FLAG,
  claimChunkReload,
  isChunkLoadError,
  pageActions,
} from '../../lib/chunkErrors';
import theme from '../../theme';

function Boom({ error }: { error: Error }): JSX.Element {
  throw error;
}

function renderBoundary(child: JSX.Element, resetKey?: string) {
  return render(
    <ChakraProvider theme={theme}>
      <ErrorBoundary resetKey={resetKey}>{child}</ErrorBoundary>
    </ChakraProvider>,
  );
}

describe('ErrorBoundary', () => {
  let reload: MockInstance<() => void>;
  let consoleError: MockInstance<typeof console.error>;

  beforeEach(() => {
    window.sessionStorage.clear();
    reload = vi.spyOn(pageActions, 'reload').mockImplementation(() => undefined);
    // React logs caught render errors; keep test output clean.
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    // Restore only our spies (restoreAllMocks would also wipe the global matchMedia stub).
    reload.mockRestore();
    consoleError.mockRestore();
    window.sessionStorage.clear();
  });

  it('renders children when nothing throws', () => {
    renderBoundary(<p>all good</p>);
    expect(screen.getByText('all good')).toBeInTheDocument();
  });

  it('shows a fallback with a Reload button on a render error', () => {
    renderBoundary(<Boom error={new Error('kaboom')} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Well, that got burnt.');
    expect(reload).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Reload' }));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('auto-reloads once on a chunk load error, then shows the fallback', () => {
    const chunkError = new TypeError('Failed to fetch dynamically imported module: /assets/x.js');
    const first = renderBoundary(<Boom error={chunkError} />);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(window.sessionStorage.getItem(CHUNK_RELOAD_FLAG)).not.toBeNull();
    expect(screen.getByText(/new version/i)).toBeInTheDocument();
    first.unmount();

    // Same session, right after the reload: no reload loop.
    renderBoundary(<Boom error={chunkError} />);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument();
  });

  it('resets when resetKey changes (e.g. navigation)', () => {
    const { rerender } = renderBoundary(<Boom error={new Error('x')} />, '/a');
    expect(screen.getByRole('alert')).toBeInTheDocument();
    rerender(
      <ChakraProvider theme={theme}>
        <ErrorBoundary resetKey="/b">
          <p>recovered</p>
        </ErrorBoundary>
      </ChakraProvider>,
    );
    expect(screen.getByText('recovered')).toBeInTheDocument();
  });
});

describe('chunk error helpers', () => {
  afterEach(() => window.sessionStorage.clear());

  it('detects chunk load errors', () => {
    expect(isChunkLoadError(new TypeError('Failed to fetch dynamically imported module: x'))).toBe(true);
    expect(isChunkLoadError(new Error('Importing a module script failed.'))).toBe(true);
    expect(isChunkLoadError(new Error('nope'))).toBe(false);
    expect(isChunkLoadError('Failed to fetch dynamically imported module')).toBe(false);
  });

  it('allows another automatic reload only after the window has passed', () => {
    expect(claimChunkReload(1_000_000)).toBe(true);
    expect(claimChunkReload(1_000_000 + 5_000)).toBe(false);
    expect(claimChunkReload(1_000_000 + 61_000)).toBe(true);
  });
});
