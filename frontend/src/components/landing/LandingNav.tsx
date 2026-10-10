import { Box, Flex, Heading, HStack } from '@chakra-ui/react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { AnimatedButton } from '../dashboard/AnimatedButton';
import { GradientButton } from '../ui/GradientButton';

/** Public top navigation: logo + auth links. */
export function LandingNav() {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  return (
    <Box
      as="header"
      position="sticky"
      top={0}
      zIndex="sticky"
      backdropFilter="blur(12px)"
      borderBottomWidth="1px"
      borderColor="border.subtle"
    >
      <Flex
        as="nav"
        aria-label="Primary"
        maxW="container.xl"
        mx="auto"
        px={{ base: 4, md: 6 }}
        h={16}
        align="center"
        justify="space-between"
        gap={3}
      >
        <Heading
          as="h2"
          size="md"
          fontWeight="extrabold"
          whiteSpace="nowrap"
          fontSize={{ base: 'md', sm: 'lg' }}
        >
          <Box as={RouterLink} to="/" display="inline-flex" alignItems="center" gap={2}>
            <Box as="span" aria-hidden="true">
              🔥
            </Box>
            <Box as="span" bgGradient="linear(to-r, brand.500, accent.500)" bgClip="text">
              Assignment Roaster
            </Box>
          </Box>
        </Heading>
        <HStack spacing={{ base: 1, sm: 2 }}>
          {isAuthenticated ? (
            <GradientButton size="sm" onClick={() => navigate('/dashboard')}>
              Dashboard
            </GradientButton>
          ) : (
            <>
              <AnimatedButton
                variant="ghost"
                colorScheme="gray"
                size="sm"
                onClick={() => navigate('/login')}
              >
                Log in
              </AnimatedButton>
              <GradientButton size="sm" onClick={() => navigate('/register')}>
                Sign up
              </GradientButton>
            </>
          )}
        </HStack>
      </Flex>
    </Box>
  );
}

export default LandingNav;
