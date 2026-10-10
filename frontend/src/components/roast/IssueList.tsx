import {
  Accordion,
  AccordionButton,
  AccordionIcon,
  AccordionItem,
  AccordionPanel,
  Badge,
  Box,
  Code,
  Heading,
  HStack,
  Stack,
  Text,
} from '@chakra-ui/react';
import type { IssueSeverity, RoastIssue } from '../../types';
import { SEVERITY_META, SEVERITY_ORDER } from './scoreColor';

export interface IssueListProps {
  issues: RoastIssue[];
}

interface IssueGroup {
  severity: IssueSeverity;
  issues: RoastIssue[];
}

function groupBySeverity(issues: RoastIssue[]): IssueGroup[] {
  return SEVERITY_ORDER.map((severity) => ({
    severity,
    issues: issues.filter((issue) => issue.severity === severity),
  })).filter((group) => group.issues.length > 0);
}

function formatLocation(issue: RoastIssue): string | null {
  if (!issue.file && issue.line === null) return null;
  const file = issue.file ?? 'line';
  return issue.line !== null ? `${file}:${issue.line}` : file;
}

/** Issues grouped by severity (high → low); each issue expands to show its suggested fix. */
export function IssueList({ issues }: IssueListProps) {
  const groups = groupBySeverity(issues);
  if (groups.length === 0) {
    return (
      <Text color="text.muted" fontSize="sm">
        No issues found. Suspiciously clean. 🧐
      </Text>
    );
  }

  return (
    <Stack spacing={5}>
      {groups.map((group) => {
        const meta = SEVERITY_META[group.severity];
        return (
          <Box key={group.severity} data-testid={`issue-group-${group.severity}`}>
            <HStack mb={2} spacing={2}>
              <Heading as="h4" size="xs" textTransform="uppercase" letterSpacing="wider">
                {meta.label}
              </Heading>
              <Badge colorScheme={meta.colorScheme} borderRadius="full">
                {group.issues.length}
              </Badge>
            </HStack>
            <Accordion allowMultiple>
              {group.issues.map((issue, index) => {
                const location = formatLocation(issue);
                return (
                  <AccordionItem
                    key={`${issue.file ?? ''}-${issue.line ?? ''}-${index}`}
                    borderWidth="1px"
                    borderColor="border.subtle"
                    borderRadius="lg"
                    mb={2}
                    overflow="hidden"
                  >
                    <AccordionButton
                      alignItems="flex-start"
                      gap={3}
                      py={3}
                      _hover={{ bg: 'blackAlpha.50' }}
                    >
                      <Stack flex="1" spacing={1} textAlign="left">
                        <HStack spacing={2} flexWrap="wrap">
                          <Badge colorScheme={meta.colorScheme}>{issue.severity}</Badge>
                          <Badge variant="outline">{issue.category}</Badge>
                          {location && (
                            <Text as="span" fontSize="xs" fontFamily="mono" color="text.muted">
                              {location}
                            </Text>
                          )}
                        </HStack>
                        <Text fontSize="sm">{issue.message}</Text>
                      </Stack>
                      <AccordionIcon mt={1} />
                    </AccordionButton>
                    <AccordionPanel pb={4}>
                      <Text fontSize="xs" fontWeight="semibold" color="text.muted" mb={1}>
                        Suggested fix
                      </Text>
                      <Code
                        display="block"
                        whiteSpace="pre-wrap"
                        wordBreak="break-word"
                        p={3}
                        borderRadius="md"
                        w="full"
                      >
                        {issue.suggested_fix}
                      </Code>
                    </AccordionPanel>
                  </AccordionItem>
                );
              })}
            </Accordion>
          </Box>
        );
      })}
    </Stack>
  );
}

export default IssueList;
