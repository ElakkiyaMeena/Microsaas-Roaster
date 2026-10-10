import { HStack, Text } from '@chakra-ui/react';
import { FiChevronLeft, FiChevronRight } from 'react-icons/fi';
import { AnimatedButton } from '../dashboard/AnimatedButton';

export interface PaginationControlsProps {
  page: number;
  perPage: number;
  total: number;
  onPageChange: (page: number) => void;
  isDisabled?: boolean;
}

/** Previous / next pager with "page x of y". */
export function PaginationControls({
  page,
  perPage,
  total,
  onPageChange,
  isDisabled = false,
}: PaginationControlsProps) {
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  return (
    <HStack justify="space-between" mt={4} flexWrap="wrap" gap={2}>
      <Text fontSize="sm" color="text.muted">
        {total} total · page {page} of {totalPages}
      </Text>
      <HStack spacing={2}>
        <AnimatedButton
          size="sm"
          variant="outline"
          leftIcon={<FiChevronLeft />}
          isDisabled={isDisabled || page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          Previous
        </AnimatedButton>
        <AnimatedButton
          size="sm"
          variant="outline"
          rightIcon={<FiChevronRight />}
          isDisabled={isDisabled || page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          Next
        </AnimatedButton>
      </HStack>
    </HStack>
  );
}

export default PaginationControls;
