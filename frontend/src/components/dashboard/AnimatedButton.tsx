import { forwardRef } from 'react';
import { MotionButton, type MotionButtonProps } from '../ui/motion';

export type AnimatedButtonProps = MotionButtonProps;

/** Regular Chakra button with a subtle hover/tap spring (for secondary actions). */
export const AnimatedButton = forwardRef<HTMLButtonElement, AnimatedButtonProps>(
  function AnimatedButton({ isDisabled, isLoading, ...rest }, ref) {
    const inactive = Boolean(isDisabled || isLoading);
    return (
      <MotionButton
        ref={ref}
        whileHover={inactive ? undefined : { scale: 1.04 }}
        whileTap={inactive ? undefined : { scale: 0.96 }}
        transition={{ type: 'spring', stiffness: 400, damping: 20 }}
        isDisabled={isDisabled}
        isLoading={isLoading}
        {...rest}
      />
    );
  },
);

export default AnimatedButton;
