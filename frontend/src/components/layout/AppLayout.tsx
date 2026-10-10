import { Suspense } from 'react';
import {
  Avatar,
  Box,
  Button,
  Drawer,
  DrawerBody,
  DrawerCloseButton,
  DrawerContent,
  DrawerHeader,
  DrawerOverlay,
  Flex,
  HStack,
  IconButton,
  Menu,
  MenuButton,
  MenuDivider,
  MenuItem,
  MenuList,
  Text,
  VStack,
  useColorMode,
  useColorModeValue,
  useDisclosure,
} from '@chakra-ui/react';
import { Link as RouterLink, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import type { IconType } from 'react-icons';
import {
  FiFileText,
  FiGrid,
  FiLogOut,
  FiMenu,
  FiMoon,
  FiPlus,
  FiSettings,
  FiShield,
  FiSun,
  FiUser,
} from 'react-icons/fi';
import { useAuth } from '../../hooks/useAuth';
import { GradientButton } from '../ui/GradientButton';
import { LoadingScreen } from '../ui/LoadingScreen';
import { ErrorBoundary } from '../ErrorBoundary';

interface NavItem {
  label: string;
  to: string;
  icon: IconType;
  adminOnly?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', to: '/dashboard', icon: FiGrid },
  { label: 'Submissions', to: '/submissions', icon: FiFileText },
  { label: 'Settings', to: '/settings', icon: FiSettings },
  { label: 'Admin', to: '/admin', icon: FiShield, adminOnly: true },
];

interface NavLinkButtonProps {
  item: NavItem;
  onNavigate?: () => void;
  fullWidth?: boolean;
}

function NavLinkButton({ item, onNavigate, fullWidth = false }: NavLinkButtonProps) {
  const activeColor = useColorModeValue('brand.600', 'brand.300');
  const activeBg = useColorModeValue('brand.50', 'whiteAlpha.100');
  return (
    <NavLink to={item.to} onClick={onNavigate}>
      {({ isActive }) => (
        <Button
          as="span"
          variant="ghost"
          colorScheme="gray"
          size="sm"
          w={fullWidth ? 'full' : undefined}
          justifyContent={fullWidth ? 'flex-start' : 'center'}
          leftIcon={<item.icon />}
          color={isActive ? activeColor : undefined}
          bg={isActive ? activeBg : undefined}
        >
          {item.label}
        </Button>
      )}
    </NavLink>
  );
}

/** Authenticated app shell: responsive navbar + routed content. */
export function AppLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { colorMode, toggleColorMode } = useColorMode();
  const drawer = useDisclosure();
  const navBg = useColorModeValue('whiteAlpha.800', 'blackAlpha.500');

  const items = NAV_ITEMS.filter((item) => !item.adminOnly || user?.is_admin);
  const displayName = user?.full_name || user?.email || 'Account';

  const handleLogout = async (): Promise<void> => {
    drawer.onClose();
    await logout();
    navigate('/login', { replace: true });
  };

  const goNewRoast = (): void => {
    drawer.onClose();
    navigate('/submissions/new');
  };

  return (
    <Flex direction="column" minH="100vh">
      <Box
        as="header"
        position="sticky"
        top={0}
        zIndex="sticky"
        bg={navBg}
        backdropFilter="blur(12px)"
        borderBottomWidth="1px"
        borderColor="border.subtle"
      >
        <Flex
          maxW="container.xl"
          mx="auto"
          px={{ base: 4, md: 6 }}
          h={16}
          align="center"
          justify="space-between"
          gap={4}
        >
          <HStack spacing={8}>
            <Text
              as={RouterLink}
              to="/dashboard"
              fontWeight="extrabold"
              fontSize="lg"
              bgGradient="linear(to-r, brand.500, accent.500)"
              bgClip="text"
              whiteSpace="nowrap"
            >
              🔥 Assignment Roaster
            </Text>
            <HStack as="nav" spacing={1} display={{ base: 'none', md: 'flex' }} aria-label="Main">
              {items.map((item) => (
                <NavLinkButton key={item.to} item={item} />
              ))}
            </HStack>
          </HStack>

          <HStack spacing={2}>
            <GradientButton
              size="sm"
              leftIcon={<FiPlus />}
              onClick={goNewRoast}
              display={{ base: 'none', sm: 'inline-flex' }}
            >
              New Roast
            </GradientButton>
            <IconButton
              aria-label={colorMode === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
              icon={colorMode === 'light' ? <FiMoon /> : <FiSun />}
              variant="ghost"
              colorScheme="gray"
              size="sm"
              onClick={toggleColorMode}
            />
            <Menu placement="bottom-end">
              <MenuButton
                as={Button}
                variant="ghost"
                colorScheme="gray"
                size="sm"
                px={1}
                aria-label="Account menu"
                display={{ base: 'none', md: 'inline-flex' }}
              >
                <Avatar size="sm" name={displayName} src={user?.avatar_url ?? undefined} />
              </MenuButton>
              <MenuList>
                <Box px={3} py={2}>
                  <Text fontWeight="semibold" noOfLines={1}>
                    {displayName}
                  </Text>
                  <Text fontSize="sm" color="text.muted" noOfLines={1}>
                    {user?.email}
                  </Text>
                </Box>
                <MenuDivider />
                <MenuItem as={RouterLink} to="/profile" icon={<FiUser />}>
                  Profile
                </MenuItem>
                <MenuItem as={RouterLink} to="/settings" icon={<FiSettings />}>
                  Settings
                </MenuItem>
                <MenuDivider />
                <MenuItem icon={<FiLogOut />} onClick={() => void handleLogout()}>
                  Logout
                </MenuItem>
              </MenuList>
            </Menu>
            <IconButton
              aria-label="Open menu"
              icon={<FiMenu />}
              variant="ghost"
              colorScheme="gray"
              display={{ base: 'inline-flex', md: 'none' }}
              onClick={drawer.onOpen}
            />
          </HStack>
        </Flex>
      </Box>

      <Drawer isOpen={drawer.isOpen} placement="right" onClose={drawer.onClose}>
        <DrawerOverlay />
        <DrawerContent>
          <DrawerCloseButton />
          <DrawerHeader borderBottomWidth="1px">
            <HStack spacing={3}>
              <Avatar size="sm" name={displayName} src={user?.avatar_url ?? undefined} />
              <Box minW={0}>
                <Text fontSize="md" noOfLines={1}>
                  {displayName}
                </Text>
                <Text fontSize="xs" color="text.muted" fontWeight="normal" noOfLines={1}>
                  {user?.email}
                </Text>
              </Box>
            </HStack>
          </DrawerHeader>
          <DrawerBody>
            <VStack as="nav" align="stretch" spacing={2} py={4} aria-label="Mobile">
              <GradientButton leftIcon={<FiPlus />} onClick={goNewRoast}>
                New Roast
              </GradientButton>
              {items.map((item) => (
                <NavLinkButton key={item.to} item={item} onNavigate={drawer.onClose} fullWidth />
              ))}
              <NavLinkButton
                item={{ label: 'Profile', to: '/profile', icon: FiUser }}
                onNavigate={drawer.onClose}
                fullWidth
              />
              <Button
                variant="ghost"
                colorScheme="gray"
                size="sm"
                justifyContent="flex-start"
                leftIcon={<FiLogOut />}
                onClick={() => void handleLogout()}
              >
                Logout
              </Button>
            </VStack>
          </DrawerBody>
        </DrawerContent>
      </Drawer>

      <Box as="main" flex="1">
        {/* Per-route boundary: a crashing page keeps the navbar usable; resets on navigation. */}
        <ErrorBoundary resetKey={pathname} inline>
          <Suspense fallback={<LoadingScreen />}>
            <Outlet />
          </Suspense>
        </ErrorBoundary>
      </Box>
    </Flex>
  );
}

export default AppLayout;
