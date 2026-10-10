import {
  Box,
  SimpleGrid,
  Text,
  useRadio,
  useRadioGroup,
  type UseRadioProps,
} from '@chakra-ui/react';
import { INTENSITIES, type IntensityOption, type RoastIntensity } from '../../types';
import { MotionBox } from '../ui/motion';

export interface IntensityPickerProps {
  value: RoastIntensity;
  onChange: (value: RoastIntensity) => void;
  isDisabled?: boolean;
  /** Radio group name (default "intensity"). */
  name?: string;
  /** Compact layout (smaller cards, no description). */
  compact?: boolean;
}

interface IntensityCardProps extends UseRadioProps {
  option: IntensityOption;
  compact: boolean;
}

function IntensityCard({ option, compact, ...radioProps }: IntensityCardProps) {
  const { state, getInputProps, getRadioProps, getLabelProps } = useRadio(radioProps);
  const input = getInputProps();
  const radio = getRadioProps();

  return (
    <Box as="label" {...getLabelProps()} cursor={state.isDisabled ? 'not-allowed' : 'pointer'}>
      <input {...input} aria-label={`${option.label} intensity`} />
      <MotionBox
        {...radio}
        whileHover={state.isDisabled ? undefined : { y: -3, scale: 1.02 }}
        whileTap={state.isDisabled ? undefined : { scale: 0.97 }}
        transition={{ type: 'spring', stiffness: 400, damping: 22 }}
        h="full"
        p={compact ? 3 : 4}
        borderRadius="xl"
        borderWidth="2px"
        borderColor={state.isChecked ? 'brand.400' : 'border.subtle'}
        bg={state.isChecked ? 'brand.50' : 'bg.surface'}
        _dark={{ bg: state.isChecked ? 'whiteAlpha.200' : 'bg.surface' }}
        boxShadow={state.isChecked ? 'md' : 'none'}
        opacity={state.isDisabled ? 0.6 : 1}
        _focusVisible={{ outline: '2px solid', outlineColor: 'brand.400' }}
      >
        <Text fontSize={compact ? 'xl' : '2xl'} aria-hidden="true">
          {option.emoji}
        </Text>
        <Text fontWeight="bold">{option.label}</Text>
        {!compact && (
          <Text fontSize="sm" color="text.muted" mt={1}>
            {option.description}
          </Text>
        )}
      </MotionBox>
    </Box>
  );
}

function isIntensity(value: string): value is RoastIntensity {
  return INTENSITIES.some((o) => o.value === value);
}

/** Radio cards for choosing roast intensity (mild / medium / savage). */
export function IntensityPicker({
  value,
  onChange,
  isDisabled = false,
  name = 'intensity',
  compact = false,
}: IntensityPickerProps) {
  const { getRootProps, getRadioProps } = useRadioGroup({
    name,
    value,
    isDisabled,
    onChange: (next: string) => {
      if (isIntensity(next)) onChange(next);
    },
  });

  return (
    <SimpleGrid
      columns={{ base: compact ? 3 : 1, md: 3 }}
      spacing={3}
      {...getRootProps()}
      role="radiogroup"
      aria-label="Roast intensity"
    >
      {INTENSITIES.map((option) => (
        <IntensityCard
          key={option.value}
          option={option}
          compact={compact}
          {...getRadioProps({ value: option.value })}
        />
      ))}
    </SimpleGrid>
  );
}

export default IntensityPicker;
