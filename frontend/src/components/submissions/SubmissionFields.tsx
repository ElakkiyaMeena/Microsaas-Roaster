import {
  FormControl,
  FormErrorMessage,
  FormHelperText,
  FormLabel,
  HStack,
  Select,
  Stack,
  Text,
  Textarea,
} from '@chakra-ui/react';
import { LANGUAGES, type Language } from '../../types';
import { AnimatedInput } from '../ui/AnimatedInput';
import { MAX_BRIEF_CHARS, MAX_TITLE_CHARS } from './uploadValidation';
import type { SubmissionFieldErrors, SubmissionFieldValues } from './formValidation';

export interface SubmissionFieldsProps {
  values: SubmissionFieldValues;
  errors: SubmissionFieldErrors;
  onChange: <K extends keyof SubmissionFieldValues>(field: K, value: SubmissionFieldValues[K]) => void;
  isDisabled?: boolean;
  /** Title not required (shows "(optional)" and no required marker). */
  titleOptional?: boolean;
  /** Override the title placeholder. */
  titlePlaceholder?: string;
  /**
   * When provided, the language select gets a first "Auto-detect" option.
   * `selected` controls whether it is the current choice.
   */
  autoDetect?: {
    selected: boolean;
    onSelect: (selected: boolean) => void;
  };
}

const AUTO_DETECT_VALUE = '__auto__';

function isLanguage(value: string): value is Language {
  return LANGUAGES.some((l) => l.value === value);
}

/** Title, language and assignment-brief fields shared by the new/edit submission pages. */
export function SubmissionFields({
  values,
  errors,
  onChange,
  isDisabled = false,
  titleOptional = false,
  titlePlaceholder = 'e.g. Week 3 — Todo API',
  autoDetect,
}: SubmissionFieldsProps) {
  const briefOver = values.brief.length > MAX_BRIEF_CHARS;
  return (
    <Stack spacing={5}>
      <Stack direction={{ base: 'column', md: 'row' }} spacing={5} align="flex-start">
        <AnimatedInput
          id="submission-title"
          name="title"
          label={titleOptional ? 'Title (optional)' : 'Title'}
          placeholder={titlePlaceholder}
          value={values.title}
          onChange={(e) => onChange('title', e.target.value)}
          error={errors.title}
          isRequired={!titleOptional}
          isDisabled={isDisabled}
          maxLength={MAX_TITLE_CHARS + 20}
          controlProps={{ flex: 2 }}
        />
        <FormControl flex={1} isRequired={!autoDetect} isDisabled={isDisabled}>
          <FormLabel htmlFor="submission-language" fontSize="sm" fontWeight="medium">
            Language
          </FormLabel>
          <Select
            id="submission-language"
            size="lg"
            borderRadius="xl"
            borderWidth="2px"
            value={autoDetect?.selected ? AUTO_DETECT_VALUE : values.language}
            onChange={(e) => {
              const next = e.target.value;
              if (autoDetect && next === AUTO_DETECT_VALUE) {
                autoDetect.onSelect(true);
                return;
              }
              if (isLanguage(next)) {
                autoDetect?.onSelect(false);
                onChange('language', next);
              }
            }}
          >
            {autoDetect && <option value={AUTO_DETECT_VALUE}>Auto-detect</option>}
            {LANGUAGES.map((lang) => (
              <option key={lang.value} value={lang.value}>
                {lang.label}
              </option>
            ))}
          </Select>
        </FormControl>
      </Stack>

      <FormControl isInvalid={Boolean(errors.brief) || briefOver} isDisabled={isDisabled}>
        <HStack justify="space-between" align="baseline">
          <FormLabel htmlFor="submission-brief" fontSize="sm" fontWeight="medium">
            Assignment brief <Text as="span" color="text.muted">(optional)</Text>
          </FormLabel>
          <Text
            fontSize="xs"
            color={briefOver ? 'red.400' : 'text.muted'}
            aria-live="polite"
            data-testid="brief-counter"
          >
            {values.brief.length.toLocaleString()} / {MAX_BRIEF_CHARS.toLocaleString()}
          </Text>
        </HStack>
        <Textarea
          id="submission-brief"
          value={values.brief}
          onChange={(e) => onChange('brief', e.target.value)}
          placeholder="Paste the assignment requirements so the roast can judge against them."
          rows={4}
          borderRadius="xl"
          borderWidth="2px"
          resize="vertical"
        />
        {errors.brief ? (
          <FormErrorMessage>{errors.brief}</FormErrorMessage>
        ) : (
          <FormHelperText>Helps the roaster check you actually did what was asked.</FormHelperText>
        )}
      </FormControl>
    </Stack>
  );
}

export default SubmissionFields;
