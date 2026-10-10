import { Box, SimpleGrid, Text, useRadio, useRadioGroup, type UseRadioProps } from '@chakra-ui/react';
import type { ReactNode } from 'react';
import { INTENSITIES, type RoastIntensity } from '../../types';
import { MotionBox } from '../ui/motion';

interface RadioCardProps extends UseRadioProps {
  children: ReactNode;
}

function RadioCard({ children, ...radioProps }: RadioCardProps) {
  const { getInputProps, getRadioProps } = useRadio(radioProps);
  return (
    <Box as="label" cursor={radioProps.isDisabled ? 'not-allowed' : 'pointer'} h="full">
      <input {...getInputProps()} />
      <MotionBox
        {...getRadioProps()}
        whileHover={radioProps.isDisabled ? undefined : { y: -3 }}
        whileTap={radioProps.isDisabled ? undefined : { scale: 0.98 }}
        h="full"
        p={4}
        borderRadius="xl"
        borderWidth="2px"
        borderColor="border.subtle"
        bg="bg.surface"
        _checked={{ borderColor: 'brand.500', boxShadow: 'glow' }}
        _focusVisible={{ outline: '2px solid', outlineColor: 'brand.400' }}
        _disabled={{ opacity: 0.6 }}
      >
        {children}
      </MotionBox>
    </Box>
  );
}

export interface IntensityRadioCardsProps {
  value: RoastIntensity;
  onChange: (value: RoastIntensity) => void;
  isDisabled?: boolean;
}

function isIntensity(value: string): value is RoastIntensity {
  return INTENSITIES.some((i) => i.value === value);
}

/** Radio cards for choosing a roast intensity. */
export function IntensityRadioCards({ value, onChange, isDisabled }: IntensityRadioCardsProps) {
  const { getRootProps, getRadioProps } = useRadioGroup({
    name: 'default-intensity',
    value,
    isDisabled,
    onChange: (next: string) => {
      if (isIntensity(next)) onChange(next);
    },
  });
  return (
    <SimpleGrid
      columns={{ base: 1, md: 3 }}
      spacing={4}
      {...getRootProps()}
      role="radiogroup"
      aria-label="Default roast intensity"
    >
      {INTENSITIES.map((option) => (
        <RadioCard key={option.value} {...getRadioProps({ value: option.value })}>
          <Text fontSize="2xl" aria-hidden="true">
            {option.emoji}
          </Text>
          <Text fontWeight="bold" mt={1}>
            {option.label}
          </Text>
          <Text fontSize="sm" color="text.muted" mt={1}>
            {option.description}
          </Text>
        </RadioCard>
      ))}
    </SimpleGrid>
  );
}

export default IntensityRadioCards;
