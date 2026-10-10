import { useEffect, useState } from 'react';
import { Text, VStack } from '@chakra-ui/react';
import { AnimatePresence } from 'framer-motion';
import { MotionBox } from '../ui/motion';

export interface RoastLoadingProps {
  /** Optional override for the rotating messages. */
  messages?: string[];
  /** Interval between messages in ms (default 2200). */
  intervalMs?: number;
}

const DEFAULT_MESSAGES = [
  'Heating up the grill…',
  'Reading your variable names (with concern)…',
  'Counting nested if-statements…',
  'Sharpening the comedy knives…',
  'Consulting a very tired senior engineer…',
  'Seasoning the feedback with constructive fixes…',
  'Almost done. Plating the roast…',
];

/** Animated flame with rotating "cooking" messages shown while a roast is generated. */
export function RoastLoading({ messages = DEFAULT_MESSAGES, intervalMs = 2200 }: RoastLoadingProps) {
  const [index, setIndex] = useState<number>(0);

  useEffect(() => {
    if (messages.length <= 1) return undefined;
    const timer = window.setInterval(() => {
      setIndex((prev) => (prev + 1) % messages.length);
    }, intervalMs);
    return () => window.clearInterval(timer);
  }, [messages.length, intervalMs]);

  const message = messages[index % Math.max(messages.length, 1)] ?? '';

  return (
    <VStack spacing={5} py={10} role="status" aria-live="polite" aria-busy="true">
      <MotionBox
        fontSize="6xl"
        lineHeight="1"
        aria-hidden="true"
        animate={{ scale: [1, 1.15, 0.95, 1.1, 1], rotate: [0, -6, 4, -3, 0], y: [0, -6, 0, -3, 0] }}
        transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
        filter="drop-shadow(0 0 18px rgba(255, 90, 31, 0.55))"
      >
        🔥
      </MotionBox>
      <MotionBox
        h="3px"
        w="160px"
        borderRadius="full"
        bgGradient="linear(to-r, brand.400, accent.500, brand.400)"
        bgSize="200% 100%"
        animate={{ backgroundPosition: ['0% 0%', '200% 0%'] }}
        transition={{ duration: 1.8, repeat: Infinity, ease: 'linear' }}
        aria-hidden="true"
      />
      <MotionBox minH="1.5em" textAlign="center">
        <AnimatePresence mode="wait">
          <MotionBox
            key={message}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.3 }}
          >
            <Text color="text.muted" fontWeight="medium">
              {message}
            </Text>
          </MotionBox>
        </AnimatePresence>
      </MotionBox>
      <Text fontSize="xs" color="text.muted">
        This usually takes 10–40 seconds.
      </Text>
    </VStack>
  );
}

export default RoastLoading;
