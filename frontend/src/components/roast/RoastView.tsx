import {
  Badge,
  Box,
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
import type { Roast } from '../../types';
import { getIntensityOption } from '../../types';
import { TextReveal } from '../ui/TextReveal';
import { IssueList } from './IssueList';
import { ScoreGauge } from './ScoreGauge';

export interface RoastViewProps {
  roast: Pick<Roast, 'score' | 'headline' | 'summary' | 'issues' | 'strengths' | 'intensity'>;
}

/**
 * Renders a roast: score gauge, headline, intensity, summary, issues grouped by severity and
 * strengths. Reused by the public roast page. Text only — AI output is never rendered as HTML.
 */
export function RoastView({ roast }: RoastViewProps) {
  const intensity = getIntensityOption(roast.intensity);
  const headline = roast.headline?.trim() ?? '';
  const summary = roast.summary?.trim() ?? '';

  return (
    <Stack spacing={6}>
      <Stack direction={{ base: 'column', sm: 'row' }} spacing={6} align="center">
        <ScoreGauge score={roast.score} />
        <Stack spacing={3} flex="1" w="full">
          <HStack>
            <Badge
              colorScheme="brand"
              variant="subtle"
              borderRadius="full"
              px={3}
              py={1}
              aria-label={`Intensity: ${intensity.label}`}
            >
              {intensity.emoji} {intensity.label}
            </Badge>
          </HStack>
          {headline && (
            <TextReveal
              as="h2"
              text={headline}
              size={{ base: 'md', md: 'lg' }}
              lineHeight="short"
            />
          )}
          {summary && (
            <Text color="text.muted" whiteSpace="pre-line">
              {summary}
            </Text>
          )}
        </Stack>
      </Stack>

      <Divider />

      <Box>
        <Heading as="h3" size="sm" mb={3}>
          Issues ({roast.issues.length})
        </Heading>
        <IssueList issues={roast.issues} />
      </Box>

      {roast.strengths.length > 0 && (
        <Box>
          <Heading as="h3" size="sm" mb={3}>
            Strengths
          </Heading>
          <List spacing={2}>
            {roast.strengths.map((strength, i) => (
              <ListItem key={`${i}-${strength.slice(0, 24)}`} display="flex" alignItems="flex-start">
                <ListIcon as={FiCheckCircle} color="green.400" mt={1} aria-hidden="true" />
                <Text as="span">{strength}</Text>
              </ListItem>
            ))}
          </List>
        </Box>
      )}
    </Stack>
  );
}

export default RoastView;
