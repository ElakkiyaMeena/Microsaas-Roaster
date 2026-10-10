import { Center, Spinner, Text, VStack, type CenterProps } from '@chakra-ui/react';

export interface LoadingScreenProps extends CenterProps {
  label?: string;
}

/** Centered spinner used for route/page loading states. */
export function LoadingScreen({ label = 'Heating up the grill...', ...rest }: LoadingScreenProps) {
  return (
    <Center minH="60vh" w="full" {...rest}>
      <VStack spacing={4} role="status" aria-live="polite">
        <Spinner size="xl" thickness="4px" color="brand.500" emptyColor="brand.100" speed="0.7s" />
        {label && (
          <Text color="text.muted" fontSize="sm">
            {label}
          </Text>
        )}
      </VStack>
    </Center>
  );
}

export default LoadingScreen;
