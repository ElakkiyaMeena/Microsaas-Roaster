import { HStack, Icon, Skeleton, Stat, StatHelpText, StatLabel, StatNumber } from '@chakra-ui/react';
import type { ReactNode } from 'react';
import type { IconType } from 'react-icons';
import { GlassCard } from '../ui/GlassCard';

export interface StatCardProps {
  label: string;
  value: ReactNode;
  helpText?: ReactNode;
  icon?: IconType;
  isLoading?: boolean;
}

/** Glass stat tile used on the user and admin dashboards. */
export function StatCard({ label, value, helpText, icon, isLoading = false }: StatCardProps) {
  return (
    <GlassCard>
      <Stat>
        <HStack justify="space-between" align="flex-start">
          <StatLabel color="text.muted" fontSize="sm">
            {label}
          </StatLabel>
          {icon && <Icon as={icon} boxSize={5} color="brand.400" aria-hidden="true" />}
        </HStack>
        <Skeleton isLoaded={!isLoading} mt={2} borderRadius="md" minH={9}>
          <StatNumber fontSize="3xl" fontWeight="extrabold">
            {value}
          </StatNumber>
        </Skeleton>
        {helpText && <StatHelpText mb={0}>{helpText}</StatHelpText>}
      </Stat>
    </GlassCard>
  );
}

export default StatCard;
