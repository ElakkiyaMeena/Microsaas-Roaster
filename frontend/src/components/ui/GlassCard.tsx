import type { ReactNode } from 'react';
import { MotionBox, type MotionBoxProps } from './motion';

export interface GlassCardProps extends MotionBoxProps {
  children?: ReactNode;
  /** Lift on hover (default true). */
  hoverable?: boolean;
}

/** Frosted-glass card with fade-in and hover elevation. */
export function GlassCard({ children, hoverable = true, ...rest }: GlassCardProps) {
  return (
    <MotionBox
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={hoverable ? { y: -4, scale: 1.01 } : undefined}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      p={6}
      borderRadius="2xl"
      bg="bg.surface"
      backdropFilter="blur(16px)"
      borderWidth="1px"
      borderColor="border.subtle"
      boxShadow="xl"
      _hover={hoverable ? { boxShadow: '2xl' } : undefined}
      {...rest}
    >
      {children}
    </MotionBox>
  );
}

export default GlassCard;
