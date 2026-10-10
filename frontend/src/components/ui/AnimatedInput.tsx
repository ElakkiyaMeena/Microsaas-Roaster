import { forwardRef } from 'react';
import {
  FormControl,
  FormErrorMessage,
  FormHelperText,
  FormLabel,
  Input,
  type FormControlProps,
  type InputProps,
} from '@chakra-ui/react';

export interface AnimatedInputProps extends InputProps {
  label?: string;
  /** Error message; when set the field is marked invalid. */
  error?: string;
  helperText?: string;
  /** Props for the wrapping FormControl. */
  controlProps?: FormControlProps;
}

/** Labeled input with validation message and a subtle focus animation. Forwards ref to <input>. */
export const AnimatedInput = forwardRef<HTMLInputElement, AnimatedInputProps>(
  function AnimatedInput(
    { label, error, helperText, controlProps, isRequired, isDisabled, id, name, ...rest },
    ref,
  ) {
    const inputId = id ?? name;
    return (
      <FormControl
        isInvalid={Boolean(error)}
        isRequired={isRequired}
        isDisabled={isDisabled}
        {...controlProps}
      >
        {label && (
          <FormLabel htmlFor={inputId} fontSize="sm" fontWeight="medium">
            {label}
          </FormLabel>
        )}
        <Input
          ref={ref}
          id={inputId}
          name={name}
          size="lg"
          borderRadius="xl"
          borderWidth="2px"
          transition="all 0.2s ease"
          _hover={{ borderColor: 'brand.300' }}
          _focus={{ transform: 'scale(1.01)' }}
          {...rest}
        />
        {error ? (
          <FormErrorMessage>{error}</FormErrorMessage>
        ) : (
          helperText && <FormHelperText>{helperText}</FormHelperText>
        )}
      </FormControl>
    );
  },
);

export default AnimatedInput;
