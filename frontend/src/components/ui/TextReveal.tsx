import type { Variants } from 'framer-motion';
import { MotionBox, MotionHeading, type MotionHeadingProps } from './motion';

export interface TextRevealProps extends Omit<MotionHeadingProps, 'children'> {
  text: string;
  /** Delay between words in seconds (default 0.06). */
  stagger?: number;
}

const wordVariants: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: 'easeOut' } },
};

/** Headline that reveals word by word. */
export function TextReveal({ text, stagger = 0.06, ...rest }: TextRevealProps) {
  const words = text.split(' ');
  return (
    <MotionHeading
      initial="hidden"
      animate="visible"
      variants={{ hidden: {}, visible: { transition: { staggerChildren: stagger } } }}
      aria-label={text}
      {...rest}
    >
      {words.map((word, i) => (
        <MotionBox
          as="span"
          key={`${word}-${i}`}
          display="inline-block"
          mr="0.25em"
          variants={wordVariants}
          aria-hidden="true"
        >
          {word}
        </MotionBox>
      ))}
    </MotionHeading>
  );
}

export default TextReveal;
