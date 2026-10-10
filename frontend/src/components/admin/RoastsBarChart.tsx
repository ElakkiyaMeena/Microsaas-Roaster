import { Box, Flex, Text, VisuallyHidden } from '@chakra-ui/react';
import type { DailyCount } from '../../types';
import { MotionBox } from '../ui/motion';

export interface RoastsBarChartProps {
  data: DailyCount[];
  /** Chart area height in px (default 180). */
  height?: number;
}

function formatDay(date: string): string {
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleDateString(undefined, { weekday: 'short', timeZone: 'UTC' });
}

/** Simple animated bar chart (Chakra boxes + framer-motion) of roasts per day. */
export function RoastsBarChart({ data, height = 180 }: RoastsBarChartProps) {
  const max = Math.max(1, ...data.map((d) => d.count));
  const total = data.reduce((sum, d) => sum + d.count, 0);

  if (data.length === 0) {
    return (
      <Text color="text.muted" fontSize="sm">
        No data yet.
      </Text>
    );
  }

  return (
    <Box>
      <Flex
        role="list"
        aria-label={`Roasts per day over the last ${data.length} days, ${total} total`}
        align="flex-end"
        gap={{ base: 2, md: 4 }}
        h={`${height}px`}
        borderBottomWidth="1px"
        borderColor="border.subtle"
      >
        {data.map((day, index) => {
          const pct = (day.count / max) * 100;
          return (
            <Flex
              key={day.date}
              role="listitem"
              aria-label={`${day.date}: ${day.count} ${day.count === 1 ? 'roast' : 'roasts'}`}
              direction="column"
              justify="flex-end"
              align="center"
              flex="1"
              h="full"
              minW={0}
            >
              <Text fontSize="xs" fontWeight="semibold" mb={1} aria-hidden="true">
                {day.count}
              </Text>
              <MotionBox
                w="full"
                maxW="48px"
                borderTopRadius="md"
                bgGradient="linear(to-t, brand.500, accent.400)"
                initial={{ height: '0%' }}
                animate={{ height: `${Math.max(pct, day.count > 0 ? 2 : 0)}%` }}
                transition={{ duration: 0.6, delay: index * 0.06, ease: 'easeOut' }}
                aria-hidden="true"
              />
            </Flex>
          );
        })}
      </Flex>
      <Flex gap={{ base: 2, md: 4 }} mt={2} aria-hidden="true">
        {data.map((day) => (
          <Text key={day.date} flex="1" textAlign="center" fontSize="xs" color="text.muted">
            {formatDay(day.date)}
          </Text>
        ))}
      </Flex>
      <VisuallyHidden>Bar heights are relative to the busiest day ({max} roasts).</VisuallyHidden>
    </Box>
  );
}

export default RoastsBarChart;
