import { Box, Code, Flex } from '@chakra-ui/react';
import { getLanguageLabel } from '../../types';

export interface CodeViewerProps {
  code: string;
  language: string;
}

/** Normalize line endings and drop a single trailing newline so the gutter matches the code. */
function normalize(code: string): string {
  return code.replace(/\r\n?/g, '\n').replace(/\n$/, '');
}

/**
 * Plain-text code viewer with a line-number gutter, horizontal scroll and a max height.
 * Code is rendered strictly as text (never as HTML).
 */
export function CodeViewer({ code, language }: CodeViewerProps) {
  const text = normalize(code);
  const lineCount = text.split('\n').length;
  const gutter = Array.from({ length: lineCount }, (_, i) => String(i + 1)).join('\n');

  return (
    <Box
      as="section"
      role="region"
      aria-label={`Code (${getLanguageLabel(language)})`}
      tabIndex={0}
      borderWidth="1px"
      borderColor="border.subtle"
      borderRadius="xl"
      overflow="auto"
      maxH="70vh"
      bg="blackAlpha.50"
      _focusVisible={{ outline: '2px solid', outlineColor: 'brand.400' }}
      data-language={language}
    >
      <Flex fontFamily="mono" fontSize="sm" minW="max-content" lineHeight="1.6">
        <Code
          data-testid="code-gutter"
          whiteSpace="pre"
          textAlign="right"
          px={3}
          py={3}
          color="text.muted"
          bg="bg.canvas"
          borderRightWidth="1px"
          borderColor="border.subtle"
          userSelect="none"
          aria-hidden="true"
          borderRadius={0}
          lineHeight="inherit"
          position="sticky"
          left={0}
        >
          {gutter}
        </Code>
        <Code
          data-testid="code-content"
          whiteSpace="pre"
          px={4}
          py={3}
          bg="transparent"
          flex="1"
          borderRadius={0}
          lineHeight="inherit"
        >
          {text}
        </Code>
      </Flex>
    </Box>
  );
}

export default CodeViewer;
