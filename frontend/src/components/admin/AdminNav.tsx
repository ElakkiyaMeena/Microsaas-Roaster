import { HStack } from '@chakra-ui/react';
import type { IconType } from 'react-icons';
import { FiBarChart2, FiLink, FiUsers } from 'react-icons/fi';
import { useLocation, useNavigate } from 'react-router-dom';
import { AnimatedButton } from '../dashboard/AnimatedButton';

interface AdminNavItem {
  label: string;
  to: string;
  icon: IconType;
}

const ITEMS: AdminNavItem[] = [
  { label: 'Overview', to: '/admin', icon: FiBarChart2 },
  { label: 'Users', to: '/admin/users', icon: FiUsers },
  { label: 'Share links', to: '/admin/share-links', icon: FiLink },
];

/** Sub-navigation between admin pages. */
export function AdminNav() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  return (
    <HStack as="nav" aria-label="Admin" spacing={2} mb={6} overflowX="auto" pb={1}>
      {ITEMS.map((item) => {
        const active = pathname === item.to;
        return (
          <AnimatedButton
            key={item.to}
            size="sm"
            variant={active ? 'solid' : 'ghost'}
            colorScheme={active ? 'brand' : 'gray'}
            leftIcon={<item.icon />}
            aria-current={active ? 'page' : undefined}
            onClick={() => navigate(item.to)}
            flexShrink={0}
          >
            {item.label}
          </AnimatedButton>
        );
      })}
    </HStack>
  );
}

export default AdminNav;
