import { Badge, type BadgeProps } from '@chakra-ui/react';

export interface ScoreBadgeProps extends BadgeProps {
  score: number | null;
}

/** Color scheme for a 0-100 score. */
function scoreColorScheme(score: number): string {
  if (score >= 80) return 'green';
  if (score >= 50) return 'orange';
  return 'red';
}

/** Small pill showing a roast score, or "Not roasted" when null. */
export function ScoreBadge({ score, ...rest }: ScoreBadgeProps) {
  if (score === null) {
    return (
      <Badge colorScheme="gray" borderRadius="full" px={2} {...rest}>
        Not roasted
      </Badge>
    );
  }
  return (
    <Badge
      colorScheme={scoreColorScheme(score)}
      borderRadius="full"
      px={2}
      aria-label={`Score ${score} out of 100`}
      {...rest}
    >
      {score}/100
    </Badge>
  );
}

export default ScoreBadge;
