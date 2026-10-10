import {
  FormControl,
  FormErrorMessage,
  FormLabel,
  HStack,
  Text,
  Textarea,
} from '@chakra-ui/react';
import { MAX_CODE_CHARS } from './uploadValidation';

export interface CodeTextareaProps {
  value: string;
  onChange: (value: string) => void;
  error?: string;
  isDisabled?: boolean;
  label?: string;
}

/** Monospace code textarea with a character counter (max 100k). */
export function CodeTextarea({
  value,
  onChange,
  error,
  isDisabled = false,
  label = 'Your code',
}: CodeTextareaProps) {
  const over = value.length > MAX_CODE_CHARS;
  return (
    <FormControl isInvalid={Boolean(error) || over} isDisabled={isDisabled} isRequired>
      <HStack justify="space-between" align="baseline">
        <FormLabel htmlFor="submission-code" fontSize="sm" fontWeight="medium">
          {label}
        </FormLabel>
        <Text fontSize="xs" color={over ? 'red.400' : 'text.muted'} aria-live="polite">
          {value.length.toLocaleString()} / {MAX_CODE_CHARS.toLocaleString()}
        </Text>
      </HStack>
      <Textarea
        id="submission-code"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={'def main():\n    print("roast me")'}
        fontFamily="mono"
        fontSize="sm"
        rows={16}
        whiteSpace="pre"
        overflowX="auto"
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        borderRadius="xl"
        borderWidth="2px"
        resize="vertical"
      />
      {error && <FormErrorMessage>{error}</FormErrorMessage>}
    </FormControl>
  );
}

export default CodeTextarea;
