import { forwardRef } from 'react';
import { MotionButton, type MotionButtonProps } from '../ui/motion';

/** Secondary/ghost button with the app's standard hover + tap animation. */
export const MotionAction = forwardRef<HTMLButtonElement, MotionButtonProps>(
  function MotionAction({ isDisabled, isLoading, ...rest }, ref) {
    const inactive = Boolean(isDisabled || isLoading);
    return (
      <MotionButton
        ref={ref}
        whileHover={inactive ? undefined : { scale: 1.04 }}
        whileTap={inactive ? undefined : { scale: 0.95 }}
        transition={{ type: 'spring', stiffness: 400, damping: 20 }}
        isDisabled={isDisabled}
        isLoading={isLoading}
        {...rest}
      />
    );
  },
);

export default MotionAction;
