import { Badge, Flex, HStack, LinkBox, LinkOverlay, Stack, Text } from '@chakra-ui/react';
import { Link as RouterLink } from 'react-router-dom';
import { FiTrash2 } from 'react-icons/fi';
import type { SubmissionListItem } from '../../types';
import { getLanguageLabel } from '../../types';
import { GlassCard } from '../ui/GlassCard';
import { formatDate, getScoreColorScheme } from '../roast/scoreColor';
import { ActionButton } from './ActionButton';
import { SOURCE_TYPE_META } from './sourceType';

export interface SubmissionCardProps {
  submission: SubmissionListItem;
  onDelete: (submission: SubmissionListItem) => void;
}

/** Card for one submission in the list. Whole card links to the detail page. */
export function SubmissionCard({ submission, onDelete }: SubmissionCardProps) {
  const scheme = getScoreColorScheme(submission.latest_score);
  const source = SOURCE_TYPE_META[submission.source_type] ?? SOURCE_TYPE_META.paste;
  const SourceIcon = source.icon;

  return (
    <LinkBox as="article" aria-label={submission.title}>
      <GlassCard p={5}>
        <Flex gap={4} align={{ base: 'flex-start', sm: 'center' }} direction={{ base: 'column', sm: 'row' }}>
          <Stack flex="1" spacing={2} minW={0}>
            <LinkOverlay as={RouterLink} to={`/submissions/${submission.id}`}>
              <Text fontWeight="bold" fontSize="lg" noOfLines={1}>
                {submission.title}
              </Text>
            </LinkOverlay>
            <HStack spacing={2} flexWrap="wrap">
              <Badge colorScheme="purple" variant="subtle">
                {getLanguageLabel(submission.language)}
              </Badge>
              <Badge variant="outline" display="inline-flex" alignItems="center" gap={1}>
                <SourceIcon aria-hidden="true" />
                {source.label}
              </Badge>
              <Text fontSize="xs" color="text.muted">
                {formatDate(submission.created_at)}
              </Text>
            </HStack>
          </Stack>

          <HStack spacing={4} flexShrink={0}>
            <Stack spacing={0} align="center">
              <Text fontSize="xs" color="text.muted">
                Roasts
              </Text>
              <Text fontWeight="bold">{submission.roast_count}</Text>
            </Stack>
            <Stack spacing={0} align="center">
              <Text fontSize="xs" color="text.muted">
                Latest
              </Text>
              <Badge
                colorScheme={scheme}
                fontSize="md"
                borderRadius="full"
                px={3}
                aria-label={
                  submission.latest_score === null
                    ? 'Not scored yet'
                    : `Latest score ${submission.latest_score}`
                }
              >
                {submission.latest_score ?? '–'}
              </Badge>
            </Stack>
            <ActionButton
              size="sm"
              variant="ghost"
              colorScheme="red"
              leftIcon={<FiTrash2 />}
              onClick={() => onDelete(submission)}
              aria-label={`Delete ${submission.title}`}
              position="relative"
              zIndex={1}
            >
              Delete
            </ActionButton>
          </HStack>
        </Flex>
      </GlassCard>
    </LinkBox>
  );
}

export default SubmissionCard;
