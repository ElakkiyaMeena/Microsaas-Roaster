import { Component, type ReactNode } from 'react';
import { Heading, Text, VStack } from '@chakra-ui/react';
import { GradientButton } from './ui/GradientButton';
import { claimChunkReload, isChunkLoadError, pageActions } from '../lib/chunkErrors';

export interface ErrorBoundaryProps {
  children: ReactNode;
  /** Changing this value resets the boundary (e.g. the current pathname). */
  resetKey?: string;
  /** Compact in-page fallback (keeps surrounding layout) instead of a full-screen one. */
  inline?: boolean;
}

interface ErrorBoundaryState {
  error: Error | null;
  resetKey: string | undefined;
}

/** Catches render errors so a crash shows a recoverable fallback instead of a blank page. */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null, resetKey: this.props.resetKey };

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { error };
  }

  static getDerivedStateFromProps(
    props: ErrorBoundaryProps,
    state: ErrorBoundaryState,
  ): Partial<ErrorBoundaryState> | null {
    if (props.resetKey !== state.resetKey) {
      return { error: null, resetKey: props.resetKey };
    }
    return null;
  }

  componentDidCatch(error: Error): void {
    // React already reports the error in development; here we only recover from stale chunks
    // (a deploy replaced the hashed assets) by reloading once.
    if (isChunkLoadError(error) && claimChunkReload()) {
      pageActions.reload();
    }
  }

  private handleReload = (): void => {
    pageActions.reload();
  };

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    const { inline = false } = this.props;
    return (
      <VStack
        role="alert"
        spacing={4}
        py={inline ? 16 : 24}
        px={4}
        minH={inline ? undefined : '100vh'}
        justify="center"
        textAlign="center"
      >
        <Heading size="lg">Well, that got burnt.</Heading>
        <Text color="text.muted" maxW="md">
          {isChunkLoadError(error)
            ? 'A new version of Assignment Roaster is available. Reload to get the latest.'
            : 'Something went wrong while showing this page. Reloading usually fixes it.'}
        </Text>
        <GradientButton onClick={this.handleReload}>Reload</GradientButton>
      </VStack>
    );
  }
}

export default ErrorBoundary;
