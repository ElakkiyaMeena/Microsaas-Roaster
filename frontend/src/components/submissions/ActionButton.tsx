import { forwardRef } from 'react';
import { MotionButton, type MotionButtonProps } from '../ui/motion';

export type ActionButtonProps = MotionButtonProps;

/** Secondary (non-gradient) Chakra button with the standard hover/tap animation. */
export const ActionButton = forwardRef<HTMLButtonElement, ActionButtonProps>(
  function ActionButton({ isDisabled, isLoading, ...rest }, ref) {
    const inactive = Boolean(isDisabled || isLoading);
    return (
      <MotionButton
        ref={ref}
        whileHover={inactive ? undefined : { scale: 1.04, y: -1 }}
        whileTap={inactive ? undefined : { scale: 0.96 }}
        transition={{ type: 'spring', stiffness: 400, damping: 20 }}
        isDisabled={isDisabled}
        isLoading={isLoading}
        {...rest}
      />
    );
  },
);

export default ActionButton;
