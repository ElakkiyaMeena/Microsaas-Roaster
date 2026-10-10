import { Box, useColorModeValue } from '@chakra-ui/react';
import { MotionBox } from '../ui/motion';

interface Blob {
  top?: string;
  bottom?: string;
  left?: string;
  right?: string;
  color: string;
  size: string;
  delay: number;
}

const BLOBS: Blob[] = [
  { top: '-10%', left: '15%', color: 'brand.300', size: '28rem', delay: 0 },
  { bottom: '-15%', right: '10%', color: 'accent.300', size: '32rem', delay: 1.5 },
  { top: '35%', right: '35%', color: 'ember.500', size: '20rem', delay: 3 },
];

/** Fixed, blurred gradient blobs for landing/auth pages. Purely decorative. */
export function MeshBackground() {
  const base = useColorModeValue(
    'linear(to-br, brand.50, white, accent.50)',
    'linear(to-br, gray.900, gray.900, gray.800)',
  );
  const opacity = useColorModeValue(0.35, 0.18);
  return (
    <Box
      position="fixed"
      inset={0}
      zIndex={-1}
      overflow="hidden"
      pointerEvents="none"
      aria-hidden="true"
    >
      <Box position="absolute" inset={0} bgGradient={base} />
      {BLOBS.map((blob) => (
        <MotionBox
          key={`${blob.color}-${blob.delay}`}
          position="absolute"
          top={blob.top}
          bottom={blob.bottom}
          left={blob.left}
          right={blob.right}
          w={blob.size}
          h={blob.size}
          bg={blob.color}
          borderRadius="full"
          filter="blur(80px)"
          opacity={opacity}
          animate={{ scale: [1, 1.12, 1] }}
          transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut', delay: blob.delay }}
        />
      ))}
    </Box>
  );
}

export default MeshBackground;
