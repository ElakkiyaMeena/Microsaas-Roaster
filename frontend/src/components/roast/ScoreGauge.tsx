import { useEffect, useState } from 'react';
import { CircularProgress, CircularProgressLabel, Text, VStack } from '@chakra-ui/react';
import { animate } from 'framer-motion';
import { getScoreColorScheme } from './scoreColor';

export interface ScoreGaugeProps {
  score: number | null;
  /** Diameter (Chakra size token or CSS length). Default 140px. */
  size?: string;
}

/** Animated circular score (0–100), colored red / orange / green. */
export function ScoreGauge({ score, size = '140px' }: ScoreGaugeProps) {
  const target = score === null ? 0 : Math.max(0, Math.min(100, score));
  const [displayed, setDisplayed] = useState<number>(0);

  useEffect(() => {
    const controls = animate(0, target, {
      duration: 1.1,
      ease: 'easeOut',
      onUpdate: (latest) => setDisplayed(latest),
    });
    return () => controls.stop();
  }, [target]);

  const scheme = getScoreColorScheme(score);
  const label = score === null ? 'No score' : `Score ${score} out of 100`;

  return (
    <VStack spacing={1}>
      <CircularProgress
        value={displayed}
        size={size}
        thickness="10px"
        color={`${scheme}.400`}
        trackColor="blackAlpha.100"
        capIsRound
        role="img"
        aria-label={label}
        // Drop the progressbar value attributes Chakra adds (invalid on role="img").
        aria-valuenow={undefined}
        aria-valuemin={undefined}
        aria-valuemax={undefined}
        aria-valuetext={undefined}
        data-testid="score-gauge"
      >
        <CircularProgressLabel fontWeight="extrabold" fontSize="3xl" aria-hidden="true">
          {score === null ? '–' : score}
        </CircularProgressLabel>
      </CircularProgress>
      <Text
        fontSize="xs"
        color="text.muted"
        textTransform="uppercase"
        letterSpacing="wider"
        aria-hidden="true"
      >
        out of 100
      </Text>
    </VStack>
  );
}

export default ScoreGauge;
