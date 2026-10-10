import { useState } from 'react';
import { Heading, HStack, Link, Stack, Text, useToast } from '@chakra-ui/react';
import { FiUser } from 'react-icons/fi';
import { Link as RouterLink } from 'react-router-dom';
import { PageWrapper } from '../components/layout/PageWrapper';
import { GlassCard } from '../components/ui/GlassCard';
import { IntensityRadioCards } from '../components/dashboard/IntensityRadioCards';
import { ShareLinksManager } from '../components/sharing/ShareLinksManager';
import { useAuth } from '../hooks/useAuth';
import authService from '../services/authService';
import { getErrorMessage } from '../lib/errors';
import { getIntensityOption, type RoastIntensity } from '../types';

/** User preferences: default intensity + public share links. */
export default function SettingsPage() {
  const { user, setUser } = useAuth();
  const toast = useToast();
  const [saving, setSaving] = useState<RoastIntensity | null>(null);

  const current: RoastIntensity = saving ?? user?.default_intensity ?? 'medium';

  const handleChange = async (intensity: RoastIntensity): Promise<void> => {
    if (!user || intensity === user.default_intensity || saving) return;
    setSaving(intensity);
    try {
      const updated = await authService.updateMe({ default_intensity: intensity });
      setUser(updated);
      const option = getIntensityOption(intensity);
      toast({
        status: 'success',
        title: 'Default intensity saved',
        description: `New roasts will default to ${option.label} ${option.emoji}`,
        duration: 3000,
      });
    } catch (err) {
      toast({
        status: 'error',
        title: 'Could not save your preference',
        description: getErrorMessage(err),
      });
    } finally {
      setSaving(null);
    }
  };

  return (
    <PageWrapper maxW="container.lg">
      <Stack spacing={8}>
        <Stack spacing={1}>
          <Heading size="lg">Settings</Heading>
          <HStack spacing={1} color="text.muted" fontSize="sm">
            <Text>Looking for your name or avatar?</Text>
            <Link as={RouterLink} to="/profile" display="inline-flex" alignItems="center" gap={1}>
              <FiUser aria-hidden="true" /> Edit your profile
            </Link>
          </HStack>
        </Stack>

        <GlassCard hoverable={false}>
          <Stack spacing={4}>
            <Stack spacing={1}>
              <Heading as="h2" size="md">
                Default roast intensity
              </Heading>
              <Text color="text.muted" fontSize="sm">
                Pre-selected whenever you roast a new assignment. You can still change it per
                roast.
              </Text>
            </Stack>
            <IntensityRadioCards
              value={current}
              onChange={(value) => void handleChange(value)}
              isDisabled={saving !== null || !user}
            />
          </Stack>
        </GlassCard>

        <GlassCard hoverable={false}>
          <Stack spacing={4}>
            <Stack spacing={1}>
              <Heading as="h2" size="md">
                Public share links
              </Heading>
              <Text color="text.muted" fontSize="sm">
                Links you have created to share roasts publicly. Disable or revoke them at any
                time.
              </Text>
            </Stack>
            <ShareLinksManager />
          </Stack>
        </GlassCard>
      </Stack>
    </PageWrapper>
  );
}
