import { Box, Flex, HStack, Link, Text } from '@chakra-ui/react';
import { Link as RouterLink } from 'react-router-dom';

/** Public footer. */
export function LandingFooter() {
  return (
    <Box as="footer" borderTopWidth="1px" borderColor="border.subtle" py={8} mt={16}>
      <Flex
        maxW="container.xl"
        mx="auto"
        px={{ base: 4, md: 6 }}
        direction={{ base: 'column', sm: 'row' }}
        justify="space-between"
        align="center"
        gap={3}
      >
        <Text fontSize="sm" color="text.muted" textAlign={{ base: 'center', sm: 'left' }}>
          &copy; {new Date().getFullYear()} Assignment Roaster. We roast code, never people.
        </Text>
        <HStack spacing={4} fontSize="sm">
          <Link as={RouterLink} to="/login">
            Log in
          </Link>
          <Link as={RouterLink} to="/register">
            Sign up
          </Link>
        </HStack>
      </Flex>
    </Box>
  );
}

export default LandingFooter;
