import { Heading, Icon, Text, VStack, type StackProps } from '@chakra-ui/react';
import type { ReactNode } from 'react';
import type { IconType } from 'react-icons';

export interface EmptyStateProps extends Omit<StackProps, 'title'> {
  icon?: IconType;
  title: string;
  description?: ReactNode;
  /** Optional CTA, e.g. a <GradientButton>. */
  action?: ReactNode;
}

/** Friendly placeholder for empty lists / missing data. */
export function EmptyState({ icon, title, description, action, ...rest }: EmptyStateProps) {
  return (
    <VStack spacing={4} py={12} px={6} textAlign="center" {...rest}>
      {icon && <Icon as={icon} boxSize={12} color="brand.400" />}
      <Heading size="md">{title}</Heading>
      {description && (
        <Text color="text.muted" maxW="md">
          {description}
        </Text>
      )}
      {action}
    </VStack>
  );
}

export default EmptyState;
