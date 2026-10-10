import { forwardRef } from 'react';
import { MotionButton, type MotionButtonProps } from './motion';

export type GradientButtonProps = MotionButtonProps;

/**
 * Primary call-to-action button: brand -> accent gradient with hover/tap animation.
 * Accepts all Chakra ButtonProps (isLoading, loadingText, leftIcon, rightIcon, size, type, onClick, as...).
 */
export const GradientButton = forwardRef<HTMLButtonElement, GradientButtonProps>(
  function GradientButton({ children, isDisabled, isLoading, ...rest }, ref) {
    const inactive = Boolean(isDisabled || isLoading);
    return (
      <MotionButton
        ref={ref}
        whileHover={inactive ? undefined : { scale: 1.03, y: -2 }}
        whileTap={inactive ? undefined : { scale: 0.97 }}
        transition={{ type: 'spring', stiffness: 400, damping: 20 }}
        isDisabled={isDisabled}
        isLoading={isLoading}
        borderRadius="full"
        fontWeight="semibold"
        color="white"
        bgGradient="linear(to-r, brand.500, accent.500)"
        boxShadow="glow"
        px={6}
        _hover={{ bgGradient: 'linear(to-r, brand.600, accent.600)', boxShadow: 'lg' }}
        _active={{ bgGradient: 'linear(to-r, brand.700, accent.700)' }}
        _disabled={{ opacity: 0.6, cursor: 'not-allowed', boxShadow: 'none' }}
        {...rest}
      >
        {children}
      </MotionButton>
    );
  },
);

export default GradientButton;
