import { FcGoogle } from 'react-icons/fc';
import { MotionButton, type MotionButtonProps } from '../ui/motion';
import { googleLoginUrl } from '../../services/authService';

export interface GoogleLoginButtonProps extends Omit<MotionButtonProps, 'onClick' | 'children'> {
  /** Button text (default "Continue with Google"). */
  label?: string;
}

/** Starts the Google OAuth flow by sending the browser to the backend's /auth/google endpoint. */
export function GoogleLoginButton({ label = 'Continue with Google', ...rest }: GoogleLoginButtonProps) {
  const handleClick = (): void => {
    window.location.assign(googleLoginUrl());
  };

  return (
    <MotionButton
      type="button"
      variant="outline"
      colorScheme="gray"
      size="lg"
      w="full"
      borderRadius="full"
      borderWidth="2px"
      leftIcon={<FcGoogle aria-hidden="true" />}
      whileHover={{ scale: 1.02, y: -1 }}
      whileTap={{ scale: 0.97 }}
      transition={{ type: 'spring', stiffness: 400, damping: 20 }}
      onClick={handleClick}
      {...rest}
    >
      {label}
    </MotionButton>
  );
}

export default GoogleLoginButton;
