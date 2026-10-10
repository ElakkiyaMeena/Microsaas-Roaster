import type { ForwardRefExoticComponent, RefAttributes } from 'react';
import {
  Box,
  Button,
  Heading,
  type BoxProps,
  type ButtonProps,
  type HeadingProps,
} from '@chakra-ui/react';
import { motion, type HTMLMotionProps } from 'framer-motion';

/**
 * Chakra components wrapped with framer-motion. Chakra's own `transition` style prop is
 * replaced by framer-motion's `transition` (animation config).
 */
type MotionOverrides<T extends 'div' | 'button' | 'h2'> = Pick<
  HTMLMotionProps<T>,
  | 'initial'
  | 'animate'
  | 'exit'
  | 'whileHover'
  | 'whileTap'
  | 'whileFocus'
  | 'whileInView'
  | 'variants'
  | 'transition'
  | 'layout'
  | 'viewport'
>;

export type MotionBoxProps = Omit<BoxProps, keyof MotionOverrides<'div'>> &
  MotionOverrides<'div'>;
export type MotionButtonProps = Omit<ButtonProps, keyof MotionOverrides<'button'>> &
  MotionOverrides<'button'>;
export type MotionHeadingProps = Omit<HeadingProps, keyof MotionOverrides<'h2'>> &
  MotionOverrides<'h2'>;

export const MotionBox = motion.create(Box) as unknown as ForwardRefExoticComponent<
  MotionBoxProps & RefAttributes<HTMLDivElement>
>;
export const MotionButton = motion.create(Button) as unknown as ForwardRefExoticComponent<
  MotionButtonProps & RefAttributes<HTMLButtonElement>
>;
export const MotionHeading = motion.create(Heading) as unknown as ForwardRefExoticComponent<
  MotionHeadingProps & RefAttributes<HTMLHeadingElement>
>;
