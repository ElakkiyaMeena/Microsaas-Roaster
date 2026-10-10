import { Badge, HStack, Icon, Text, VStack } from '@chakra-ui/react';
import { FiChevronRight } from 'react-icons/fi';
import { useNavigate } from 'react-router-dom';
import { getLanguageLabel, type SubmissionListItem } from '../../types';
import { MotionBox } from '../ui/motion';
import { ScoreBadge } from './ScoreBadge';

export interface RecentSubmissionItemProps {
  submission: SubmissionListItem;
}

/** Clickable row for a submission on the dashboard. */
export function RecentSubmissionItem({ submission }: RecentSubmissionItemProps) {
  const navigate = useNavigate();
  const roasts = submission.roast_count;
  const open = (): void => navigate(`/submissions/${submission.id}`);
  return (
    <MotionBox
      role="button"
      tabIndex={0}
      cursor="pointer"
      w="full"
      textAlign="left"
      p={4}
      borderRadius="xl"
      borderWidth="1px"
      borderColor="border.subtle"
      bg="bg.surface"
      whileHover={{ scale: 1.01, x: 4 }}
      whileTap={{ scale: 0.99 }}
      _hover={{ borderColor: 'brand.300' }}
      _focusVisible={{ outline: '2px solid', outlineColor: 'brand.400' }}
      onClick={open}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          open();
        }
      }}
      aria-label={`Open ${submission.title}`}
    >
      <HStack justify="space-between" spacing={4}>
        <VStack align="flex-start" spacing={1} minW={0}>
          <Text fontWeight="semibold" noOfLines={1}>
            {submission.title}
          </Text>
          <HStack spacing={2} flexWrap="wrap">
            <Badge variant="subtle" colorScheme="purple" borderRadius="full" px={2}>
              {getLanguageLabel(submission.language)}
            </Badge>
            <Text fontSize="sm" color="text.muted">
              {roasts} {roasts === 1 ? 'roast' : 'roasts'}
            </Text>
          </HStack>
        </VStack>
        <HStack spacing={3} flexShrink={0}>
          <ScoreBadge score={submission.latest_score} />
          <Icon as={FiChevronRight} color="text.muted" aria-hidden="true" />
        </HStack>
      </HStack>
    </MotionBox>
  );
}

export default RecentSubmissionItem;
