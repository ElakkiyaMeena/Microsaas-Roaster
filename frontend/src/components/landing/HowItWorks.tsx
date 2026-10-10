import { Badge, Heading, Icon, SimpleGrid, Stack, Text } from '@chakra-ui/react';
import type { IconType } from 'react-icons';
import { FiAward, FiThermometer, FiUploadCloud } from 'react-icons/fi';
import { GlassCard } from '../ui/GlassCard';

interface Step {
  title: string;
  description: string;
  icon: IconType;
}

const STEPS: Step[] = [
  {
    title: 'Paste or upload',
    description:
      'Drop in your assignment: paste a snippet or upload files and zips, plus the brief.',
    icon: FiUploadCloud,
  },
  {
    title: 'Pick your heat',
    description: 'Mild, Medium or Savage. Choose how hard you want the feedback to sting.',
    icon: FiThermometer,
  },
  {
    title: 'Get score, fixes & a shareable roast',
    description:
      'A 0-100 score, a concrete suggested fix for every issue, and a public link to brag (or cry).',
    icon: FiAward,
  },
];

/** Three-step explainer on the landing page. */
export function HowItWorks() {
  return (
    <Stack as="section" spacing={8} aria-labelledby="how-it-works">
      <Heading id="how-it-works" as="h2" size="xl" textAlign="center">
        How it works
      </Heading>
      <SimpleGrid columns={{ base: 1, md: 3 }} spacing={6}>
        {STEPS.map((step, index) => (
          <GlassCard key={step.title} transition={{ duration: 0.3, delay: index * 0.1 }}>
            <Stack spacing={4}>
              <Badge alignSelf="flex-start" colorScheme="orange" borderRadius="full" px={3}>
                Step {index + 1}
              </Badge>
              <Icon as={step.icon} boxSize={8} color="brand.500" aria-hidden="true" />
              <Heading as="h3" size="md">
                {step.title}
              </Heading>
              <Text color="text.muted">{step.description}</Text>
            </Stack>
          </GlassCard>
        ))}
      </SimpleGrid>
    </Stack>
  );
}

export default HowItWorks;
