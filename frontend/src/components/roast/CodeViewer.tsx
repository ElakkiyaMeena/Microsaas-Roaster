import { Fragment } from 'react';
import { Box, Code, Flex } from '@chakra-ui/react';
import { getLanguageLabel } from '../../types';
import { classifyDiffLine, type DiffLineKind } from '../../lib/diff';

export interface CodeViewerProps {
  code: string;
  language: string;
  /** Colour unified-diff lines (`+` green, `-` red, `@@` hunk headers). Still plain text. */
  diff?: boolean;
}

interface DiffLineStyle {
  color?: string;
  dark?: string;
  fontWeight?: string;
}

const DIFF_STYLES: Record<DiffLineKind, DiffLineStyle> = {
  add: { color: 'green.600', dark: 'green.300' },
  del: { color: 'red.600', dark: 'red.300' },
  hunk: { color: 'purple.600', dark: 'purple.300' },
  meta: { fontWeight: 'bold' },
  context: {},
};

/** Render diff lines as coloured spans; newlines stay as text so copy/paste is unchanged. */
function DiffLines({ text }: { text: string }) {
  return (
    <>
      {text.split('\n').map((line, i) => {
        const kind = classifyDiffLine(line);
        const style = DIFF_STYLES[kind];
        return (
          <Fragment key={i}>
            {i > 0 && '\n'}
            <Box
              as="span"
              data-diff={kind}
              color={style.color}
              fontWeight={style.fontWeight}
              _dark={style.dark ? { color: style.dark } : undefined}
            >
              {line}
            </Box>
          </Fragment>
        );
      })}
    </>
  );
}

/** Normalize line endings and drop a single trailing newline so the gutter matches the code. */
function normalize(code: string): string {
  return code.replace(/\r\n?/g, '\n').replace(/\n$/, '');
}

/**
 * Plain-text code viewer with a line-number gutter, horizontal scroll and a max height.
 * Code is rendered strictly as text (never as HTML).
 */
export function CodeViewer({ code, language, diff = false }: CodeViewerProps) {
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
      data-diff-view={diff ? 'true' : undefined}
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
          {diff ? <DiffLines text={text} /> : text}
        </Code>
      </Flex>
    </Box>
  );
}

export default CodeViewer;
