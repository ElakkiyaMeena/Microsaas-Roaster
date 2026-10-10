import {
  Badge,
  Box,
  Code,
  Divider,
  Heading,
  HStack,
  List,
  ListIcon,
  ListItem,
  Stack,
  Text,
} from '@chakra-ui/react';
import { FiCheckCircle } from 'react-icons/fi';
import type { IssueCategory, IssueSeverity } from '../../types';
import { GlassCard } from '../ui/GlassCard';

interface SampleIssue {
  severity: IssueSeverity;
  category: IssueCategory;
  message: string;
  fix: string;
}

interface SampleRoast {
  title: string;
  score: number;
  headline: string;
  summary: string;
  issues: SampleIssue[];
  strengths: string[];
}

const SAMPLE: SampleRoast = {
  title: 'Week 3: Todo List API',
  score: 62,
  headline: 'Your variables have the naming creativity of a ransom note.',
  summary:
    'The core logic works, but error handling is on vacation and "data2" is not a name, it is a cry for help.',
  issues: [
    {
      severity: 'high',
      category: 'bug',
      message: 'Deleting a missing todo crashes with an IndexError.',
      fix: 'Check that the id exists first and return a 404 instead.',
    },
    {
      severity: 'medium',
      category: 'readability',
      message: '"data", "data2" and "tmp" tell the reader nothing.',
      fix: 'Rename them to todos, completed_todos and next_id.',
    },
  ],
  strengths: ['Routes are cleanly separated', 'Consistent JSON responses'],
};

const SEVERITY_SCHEME: Record<IssueSeverity, string> = {
  low: 'blue',
  medium: 'orange',
  high: 'red',
};

/** Static example roast (illustration only, not real data). */
export function SampleRoastCard() {
  return (
    <GlassCard maxW="xl" w="full" mx="auto" aria-label="Sample roast preview">
      <Stack spacing={4}>
        <HStack justify="space-between" align="flex-start" spacing={4}>
          <Stack spacing={1} minW={0}>
            <Text fontSize="xs" textTransform="uppercase" letterSpacing="wider" color="text.muted">
              Sample roast · Medium 🔥
            </Text>
            <Heading as="h3" size="sm" noOfLines={1}>
              {SAMPLE.title}
            </Heading>
          </Stack>
          <Box
            flexShrink={0}
            textAlign="center"
            px={4}
            py={2}
            borderRadius="xl"
            bgGradient="linear(to-br, brand.500, accent.500)"
            color="white"
            role="img"
            aria-label={`Score ${SAMPLE.score} out of 100`}
          >
            <Text fontSize="2xl" fontWeight="extrabold" lineHeight="1">
              {SAMPLE.score}
            </Text>
            <Text fontSize="xs">/ 100</Text>
          </Box>
        </HStack>
        <Text fontWeight="bold" fontSize="lg">
          &ldquo;{SAMPLE.headline}&rdquo;
        </Text>
        <Text color="text.muted">{SAMPLE.summary}</Text>
        <Divider />
        <Stack spacing={3}>
          {SAMPLE.issues.map((issue) => (
            <Box
              key={issue.message}
              p={3}
              borderRadius="lg"
              borderWidth="1px"
              borderColor="border.subtle"
            >
              <HStack spacing={2} mb={1}>
                <Badge colorScheme={SEVERITY_SCHEME[issue.severity]}>{issue.severity}</Badge>
                <Badge variant="outline">{issue.category}</Badge>
              </HStack>
              <Text fontSize="sm">{issue.message}</Text>
              <Text fontSize="sm" color="text.muted" mt={1}>
                <Code fontSize="xs" colorScheme="green" mr={1}>
                  fix
                </Code>
                {issue.fix}
              </Text>
            </Box>
          ))}
        </Stack>
        <List spacing={1}>
          {SAMPLE.strengths.map((strength) => (
            <ListItem key={strength} fontSize="sm">
              <ListIcon as={FiCheckCircle} color="green.400" />
              {strength}
            </ListItem>
          ))}
        </List>
      </Stack>
    </GlassCard>
  );
}

export default SampleRoastCard;
