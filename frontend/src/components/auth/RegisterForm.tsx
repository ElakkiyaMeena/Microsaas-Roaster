import { useState, type ChangeEvent, type FormEvent } from 'react';
import { Alert, AlertDescription, AlertIcon, Box, Progress, Stack, Text } from '@chakra-ui/react';
import { AnimatedInput } from '../ui/AnimatedInput';
import { GradientButton } from '../ui/GradientButton';
import { useAuth } from '../../hooks/useAuth';
import { getErrorCode, getErrorMessage, getErrorStatus } from '../../lib/errors';
import type { User } from '../../types';

export interface RegisterFormProps {
  /** Called after the account is created and the user is signed in. */
  onSuccess?: (user: User) => void;
}

interface RegisterValues {
  fullName: string;
  email: string;
  password: string;
  confirmPassword: string;
}

type RegisterErrors = Partial<Record<keyof RegisterValues, string>>;

const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 128;
const FULL_NAME_MAX_LENGTH = 255;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Client-side validation for the registration form. Returns an empty object when valid. */
function validateRegister(values: RegisterValues): RegisterErrors {
  const errors: RegisterErrors = {};
  const email = values.email.trim();
  if (values.fullName.trim().length > FULL_NAME_MAX_LENGTH) {
    errors.fullName = `Name must be at most ${FULL_NAME_MAX_LENGTH} characters`;
  }
  if (!email) {
    errors.email = 'Email is required';
  } else if (!EMAIL_PATTERN.test(email)) {
    errors.email = 'Enter a valid email address';
  }
  if (!values.password) {
    errors.password = 'Password is required';
  } else if (values.password.length < PASSWORD_MIN_LENGTH) {
    errors.password = `Password must be at least ${PASSWORD_MIN_LENGTH} characters`;
  } else if (values.password.length > PASSWORD_MAX_LENGTH) {
    errors.password = `Password must be at most ${PASSWORD_MAX_LENGTH} characters`;
  }
  if (!values.confirmPassword) {
    errors.confirmPassword = 'Please confirm your password';
  } else if (values.confirmPassword !== values.password) {
    errors.confirmPassword = 'Passwords do not match';
  }
  return errors;
}

interface PasswordStrength {
  /** 0-100 for the progress bar. */
  value: number;
  label: string;
  colorScheme: 'red' | 'orange' | 'yellow' | 'green';
}

/** Rough password strength estimate used only for the UI hint. */
function getPasswordStrength(password: string): PasswordStrength {
  if (!password) return { value: 0, label: 'Enter a password', colorScheme: 'red' };
  let score = 0;
  if (password.length >= PASSWORD_MIN_LENGTH) score += 1;
  if (password.length >= 12) score += 1;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;
  if (/\d/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;

  if (password.length < PASSWORD_MIN_LENGTH || score <= 1) {
    return { value: 20, label: 'Weak: easier to crack than your first for-loop', colorScheme: 'red' };
  }
  if (score === 2) return { value: 45, label: 'Fair: add numbers or symbols', colorScheme: 'orange' };
  if (score === 3) return { value: 70, label: 'Good: a bit longer would be even better', colorScheme: 'yellow' };
  return { value: 100, label: 'Strong: roast-proof', colorScheme: 'green' };
}

function registerErrorMessage(err: unknown): string {
  if (getErrorCode(err) === 'EMAIL_EXISTS' || getErrorStatus(err) === 409) {
    return 'An account with this email already exists. Try signing in instead.';
  }
  if (getErrorStatus(err) === 429) {
    return 'Too many sign-up attempts. Please wait a minute and try again.';
  }
  return getErrorMessage(err, 'Registration failed. Please try again.');
}

/** Account creation form (registers then signs in automatically). */
export function RegisterForm({ onSuccess }: RegisterFormProps) {
  const { register } = useAuth();
  const [values, setValues] = useState<RegisterValues>({
    fullName: '',
    email: '',
    password: '',
    confirmPassword: '',
  });
  const [errors, setErrors] = useState<RegisterErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const strength = getPasswordStrength(values.password);

  const handleChange = (event: ChangeEvent<HTMLInputElement>): void => {
    const field = event.target.name as keyof RegisterValues;
    const { value } = event.target;
    setValues((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  const handleSubmit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setFormError(null);
    const validation = validateRegister(values);
    setErrors(validation);
    if (Object.keys(validation).length > 0) return;

    setIsSubmitting(true);
    const fullName = values.fullName.trim();
    try {
      const user = await register({
        email: values.email.trim(),
        password: values.password,
        ...(fullName ? { full_name: fullName } : {}),
      });
      onSuccess?.(user);
    } catch (err) {
      setFormError(registerErrorMessage(err));
      setIsSubmitting(false);
    }
  };

  return (
    <Stack
      as="form"
      spacing={5}
      noValidate
      aria-label="Create account form"
      onSubmit={(event: FormEvent) => void handleSubmit(event)}
    >
      {formError && (
        <Alert status="error" borderRadius="xl">
          <AlertIcon />
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      )}
      <AnimatedInput
        id="register-full-name"
        name="fullName"
        label="Full name (optional)"
        autoComplete="name"
        placeholder="Ada Lovelace"
        value={values.fullName}
        onChange={handleChange}
        error={errors.fullName}
      />
      <AnimatedInput
        id="register-email"
        name="email"
        type="email"
        label="Email"
        autoComplete="email"
        placeholder="you@bootcamp.dev"
        value={values.email}
        onChange={handleChange}
        error={errors.email}
        isRequired
      />
      <Box>
        <AnimatedInput
          id="register-password"
          name="password"
          type="password"
          label="Password"
          autoComplete="new-password"
          placeholder="At least 8 characters"
          value={values.password}
          onChange={handleChange}
          error={errors.password}
          helperText={`${PASSWORD_MIN_LENGTH}–${PASSWORD_MAX_LENGTH} characters. Mix cases, numbers and symbols.`}
          isRequired
        />
        {values.password && (
          <Box mt={2} aria-live="polite">
            <Progress
              value={strength.value}
              colorScheme={strength.colorScheme}
              size="xs"
              borderRadius="full"
              aria-label="Password strength"
            />
            <Text fontSize="xs" color="text.muted" mt={1}>
              {strength.label}
            </Text>
          </Box>
        )}
      </Box>
      <AnimatedInput
        id="register-confirm-password"
        name="confirmPassword"
        type="password"
        label="Confirm password"
        autoComplete="new-password"
        placeholder="Type it again"
        value={values.confirmPassword}
        onChange={handleChange}
        error={errors.confirmPassword}
        isRequired
      />
      <GradientButton
        type="submit"
        size="lg"
        w="full"
        isLoading={isSubmitting}
        loadingText="Creating account"
      >
        Create account
      </GradientButton>
    </Stack>
  );
}

export default RegisterForm;
