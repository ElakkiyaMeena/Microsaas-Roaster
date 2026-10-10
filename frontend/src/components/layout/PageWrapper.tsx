import { Container, type ContainerProps } from '@chakra-ui/react';
import type { ReactNode } from 'react';
import { MotionBox } from '../ui/motion';

export interface PageWrapperProps extends ContainerProps {
  children: ReactNode;
}

/** Every page is wrapped in this: fade-in animation + responsive container. */
export function PageWrapper({
  children,
  maxW = 'container.xl',
  py = { base: 6, md: 10 },
  ...rest
}: PageWrapperProps) {
  return (
    <MotionBox
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      w="full"
    >
      <Container maxW={maxW} py={py} px={{ base: 4, md: 6 }} {...rest}>
        {children}
      </Container>
    </MotionBox>
  );
}

export default PageWrapper;
