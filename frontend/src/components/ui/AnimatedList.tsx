import { Children, isValidElement, type ReactNode } from 'react';
import type { Variants } from 'framer-motion';
import { MotionBox, type MotionBoxProps } from './motion';

export interface AnimatedListProps extends Omit<MotionBoxProps, 'children'> {
  /** Items to stagger in. Element keys are preserved (give each child a `key`). */
  children: ReactNode | ReactNode[];
  /** Delay between items in seconds (default 0.08). */
  stagger?: number;
  /** Gap between items (Chakra space token, default 3). */
  spacing?: MotionBoxProps['gap'];
}

function containerVariants(stagger: number): Variants {
  return {
    hidden: {},
    visible: { transition: { staggerChildren: stagger } },
  };
}

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: 'easeOut' } },
};

/** Vertical list whose children fade/slide in with a stagger. */
export function AnimatedList({
  children,
  stagger = 0.08,
  spacing = 3,
  ...rest
}: AnimatedListProps) {
  const items = Children.toArray(children);
  return (
    <MotionBox
      initial="hidden"
      animate="visible"
      variants={containerVariants(stagger)}
      display="flex"
      flexDirection="column"
      gap={spacing}
      {...rest}
    >
      {items.map((child, index) => (
        <MotionBox
          key={isValidElement(child) && child.key !== null ? child.key : index}
          variants={itemVariants}
        >
          {child}
        </MotionBox>
      ))}
    </MotionBox>
  );
}

export default AnimatedList;
