import { Badge, HStack, Text } from '@chakra-ui/react';
import type { Roast } from '../../types';
import { getIntensityOption } from '../../types';
import { AnimatedList } from '../ui/AnimatedList';
import { MotionButton } from '../ui/motion';
import { formatDateTime, getScoreColorScheme } from './scoreColor';

export interface RoastHistoryProps {
  roasts: Roast[];
  selectedId: number | null;
  onSelect: (roastId: number) => void;
}

/** List of all roasts of a submission (newest first); clicking one selects it. */
export function RoastHistory({ roasts, selectedId, onSelect }: RoastHistoryProps) {
  return (
    <AnimatedList spacing={2} stagger={0.05} as="nav" aria-label="Roast history">
      {roasts.map((roast) => {
        const intensity = getIntensityOption(roast.intensity);
        const isSelected = roast.id === selectedId;
        return (
          <MotionButton
            key={roast.id}
            onClick={() => onSelect(roast.id)}
            whileHover={{ x: 4 }}
            whileTap={{ scale: 0.98 }}
            variant={isSelected ? 'solid' : 'ghost'}
            colorScheme={isSelected ? 'brand' : 'gray'}
            justifyContent="space-between"
            w="full"
            h="auto"
            py={2}
            px={3}
            borderRadius="lg"
            fontWeight="normal"
            aria-current={isSelected ? 'true' : undefined}
            aria-label={`Roast from ${formatDateTime(roast.created_at)}, ${intensity.label}, ${
              roast.status === 'completed' ? `score ${roast.score ?? 'none'}` : roast.status
            }`}
          >
            <HStack spacing={2}>
              <Text as="span" aria-hidden="true">
                {intensity.emoji}
              </Text>
              <Text as="span" fontSize="sm">
                {formatDateTime(roast.created_at)}
              </Text>
            </HStack>
            {roast.status === 'completed' ? (
              <Badge colorScheme={getScoreColorScheme(roast.score)} borderRadius="full" px={2}>
                {roast.score ?? '–'}
              </Badge>
            ) : (
              <Badge colorScheme={roast.status === 'failed' ? 'red' : 'gray'} variant="outline">
                {roast.status}
              </Badge>
            )}
          </MotionButton>
        );
      })}
    </AnimatedList>
  );
}

export default RoastHistory;
