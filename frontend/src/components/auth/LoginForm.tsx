import { useState, type ChangeEvent, type FormEvent } from 'react';
import { Alert, AlertDescription, AlertIcon, Stack } from '@chakra-ui/react';
import { AnimatedInput } from '../ui/AnimatedInput';
import { GradientButton } from '../ui/GradientButton';
import { useAuth } from '../../hooks/useAuth';
import { getErrorCode, getErrorMessage, getErrorStatus } from '../../lib/errors';
import type { User } from '../../types';

export interface LoginFormProps {
  /** Called after a successful sign-in with the loaded user. */
  onSuccess?: (user: User) => void;
}

interface LoginValues {
  email: string;
  password: string;
}

type LoginErrors = Partial<Record<keyof LoginValues, string>>;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Client-side validation for the login form. Returns an empty object when valid. */
function validateLogin(values: LoginValues): LoginErrors {
  const errors: LoginErrors = {};
  const email = values.email.trim();
  if (!email) {
    errors.email = 'Email is required';
  } else if (!EMAIL_PATTERN.test(email)) {
    errors.email = 'Enter a valid email address';
  }
  if (!values.password) {
    errors.password = 'Password is required';
  }
  return errors;
}

function loginErrorMessage(err: unknown): string {
  const code = getErrorCode(err);
  const status = getErrorStatus(err);
  if (code === 'INVALID_CREDENTIALS' || status === 401) {
    return 'Incorrect email or password.';
  }
  if (code === 'USER_INACTIVE') {
    return 'This account has been deactivated. Contact support if you think this is a mistake.';
  }
  if (status === 429) {
    return 'Too many sign-in attempts. Take a breather and try again in a minute.';
  }
  return getErrorMessage(err, 'Sign in failed. Please try again.');
}

/** Email + password sign-in form. */
export function LoginForm({ onSuccess }: LoginFormProps) {
  const { login } = useAuth();
  const [values, setValues] = useState<LoginValues>({ email: '', password: '' });
  const [errors, setErrors] = useState<LoginErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const handleChange = (event: ChangeEvent<HTMLInputElement>): void => {
    const field = event.target.name as keyof LoginValues;
    const { value } = event.target;
    setValues((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  const handleSubmit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setFormError(null);
    const validation = validateLogin(values);
    setErrors(validation);
    if (Object.keys(validation).length > 0) return;

    setIsSubmitting(true);
    try {
      const user = await login(values.email.trim(), values.password);
      onSuccess?.(user);
    } catch (err) {
      setFormError(loginErrorMessage(err));
      setIsSubmitting(false);
    }
  };

  return (
    <Stack
      as="form"
      spacing={5}
      noValidate
      aria-label="Sign in form"
      onSubmit={(event: FormEvent) => void handleSubmit(event)}
    >
      {formError && (
        <Alert status="error" borderRadius="xl">
          <AlertIcon />
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      )}
      <AnimatedInput
        id="login-email"
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
      <AnimatedInput
        id="login-password"
        name="password"
        type="password"
        label="Password"
        autoComplete="current-password"
        placeholder="Your password"
        value={values.password}
        onChange={handleChange}
        error={errors.password}
        isRequired
      />
      <GradientButton type="submit" size="lg" w="full" isLoading={isSubmitting} loadingText="Signing in">
        Sign in
      </GradientButton>
    </Stack>
  );
}

export default LoginForm;
