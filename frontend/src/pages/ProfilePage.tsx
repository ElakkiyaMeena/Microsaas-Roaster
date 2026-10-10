import { useState, type ChangeEvent, type FormEvent } from 'react';
import {
  Avatar,
  Badge,
  Box,
  FormControl,
  FormLabel,
  HStack,
  SimpleGrid,
  Stack,
  Text,
  useRadio,
  useRadioGroup,
  useToast,
  type UseRadioProps,
} from '@chakra-ui/react';
import { FiSave } from 'react-icons/fi';
import { PageWrapper } from '../components/layout/PageWrapper';
import { AnimatedInput } from '../components/ui/AnimatedInput';
import { GlassCard } from '../components/ui/GlassCard';
import { GradientButton } from '../components/ui/GradientButton';
import { LoadingScreen } from '../components/ui/LoadingScreen';
import { MotionBox } from '../components/ui/motion';
import { TextReveal } from '../components/ui/TextReveal';
import { useAuth } from '../hooks/useAuth';
import { getErrorMessage } from '../lib/errors';
import { updateMe } from '../services/authService';
import { INTENSITIES, type IntensityOption, type RoastIntensity, type User } from '../types';

const FULL_NAME_MAX_LENGTH = 255;

interface IntensityRadioCardProps extends UseRadioProps {
  option: IntensityOption;
}

/** Selectable card for one roast intensity (accessible radio input under the hood). */
function IntensityRadioCard({ option, ...radioProps }: IntensityRadioCardProps) {
  const { getInputProps, getRadioProps } = useRadio(radioProps);
  const input = getInputProps();
  const checkbox = getRadioProps();

  return (
    <Box as="label" cursor="pointer" h="full">
      <input {...input} aria-label={`${option.label} intensity`} />
      <MotionBox
        {...checkbox}
        whileHover={{ y: -3, scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        transition={{ type: 'spring', stiffness: 400, damping: 25 }}
        h="full"
        p={4}
        borderRadius="xl"
        borderWidth="2px"
        borderColor="border.subtle"
        bg="bg.surface"
        _checked={{ borderColor: 'brand.500', boxShadow: 'glow' }}
        _focusVisible={{ boxShadow: 'outline' }}
      >
        <Text fontSize="2xl" aria-hidden="true">
          {option.emoji}
        </Text>
        <Text fontWeight="bold">{option.label}</Text>
        <Text fontSize="sm" color="text.muted">
          {option.description}
        </Text>
      </MotionBox>
    </Box>
  );
}

function formatProvider(provider: string | null): string {
  if (!provider) return 'Email & password';
  if (provider.toLowerCase() === 'google') return 'Google';
  return provider.charAt(0).toUpperCase() + provider.slice(1);
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'Unknown';
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
}

interface ProfileFormProps {
  user: User;
  onSaved: (user: User) => void;
}

function ProfileForm({ user, onSaved }: ProfileFormProps) {
  const toast = useToast();
  const [fullName, setFullName] = useState<string>(user.full_name ?? '');
  const [intensity, setIntensity] = useState<RoastIntensity>(user.default_intensity);
  const [nameError, setNameError] = useState<string | undefined>(undefined);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  const { getRootProps, getRadioProps } = useRadioGroup({
    name: 'default_intensity',
    value: intensity,
    onChange: (next: string) => setIntensity(next as RoastIntensity),
  });

  const trimmedName = fullName.trim();
  const isDirty =
    trimmedName !== (user.full_name ?? '').trim() || intensity !== user.default_intensity;

  const handleNameChange = (event: ChangeEvent<HTMLInputElement>): void => {
    setFullName(event.target.value);
    setNameError(undefined);
  };

  const handleSubmit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    if (trimmedName.length > FULL_NAME_MAX_LENGTH) {
      setNameError(`Name must be at most ${FULL_NAME_MAX_LENGTH} characters`);
      return;
    }
    setIsSaving(true);
    try {
      const updated = await updateMe({
        full_name: trimmedName === '' ? null : trimmedName,
        default_intensity: intensity,
      });
      onSaved(updated);
      toast({ status: 'success', title: 'Profile updated', duration: 3000, isClosable: true });
    } catch (err) {
      toast({
        status: 'error',
        title: 'Could not update profile',
        description: getErrorMessage(err),
        duration: 5000,
        isClosable: true,
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Stack
      as="form"
      spacing={6}
      noValidate
      aria-label="Profile form"
      onSubmit={(event: FormEvent) => void handleSubmit(event)}
    >
      <AnimatedInput
        id="profile-full-name"
        name="full_name"
        label="Full name"
        autoComplete="name"
        placeholder="How should the roaster address you?"
        value={fullName}
        onChange={handleNameChange}
        error={nameError}
      />
      <FormControl as="fieldset">
        <FormLabel as="legend" fontSize="sm" fontWeight="medium">
          Default roast intensity
        </FormLabel>
        <SimpleGrid columns={{ base: 1, md: 3 }} spacing={3} {...getRootProps()}>
          {INTENSITIES.map((option) => (
            <IntensityRadioCard
              key={option.value}
              option={option}
              {...getRadioProps({ value: option.value })}
            />
          ))}
        </SimpleGrid>
      </FormControl>
      <HStack justify="flex-end">
        <GradientButton
          type="submit"
          leftIcon={<FiSave />}
          isLoading={isSaving}
          loadingText="Saving"
          isDisabled={!isDirty}
        >
          Save changes
        </GradientButton>
      </HStack>
    </Stack>
  );
}

export default function ProfilePage() {
  const { user, setUser } = useAuth();

  if (!user) {
    return <LoadingScreen />;
  }

  const displayName = user.full_name || user.email;

  return (
    <PageWrapper maxW="container.md">
      <Stack spacing={6}>
        <TextReveal as="h1" text="Your profile" size="xl" />

        <GlassCard>
          <Stack direction={{ base: 'column', sm: 'row' }} spacing={5} align={{ base: 'flex-start', sm: 'center' }}>
            <Avatar size="xl" name={displayName} src={user.avatar_url ?? undefined} />
            <Stack spacing={1} minW={0}>
              <Text fontSize="xl" fontWeight="bold" noOfLines={1}>
                {displayName}
              </Text>
              <Text color="text.muted" noOfLines={1}>
                {user.email}
              </Text>
              <HStack spacing={2} flexWrap="wrap" pt={1}>
                <Badge colorScheme="orange">{formatProvider(user.oauth_provider)}</Badge>
                {user.is_verified && <Badge colorScheme="green">Verified</Badge>}
                {user.is_admin && <Badge colorScheme="purple">Admin</Badge>}
              </HStack>
              <Text fontSize="sm" color="text.muted" pt={1}>
                Member since {formatDate(user.created_at)}
              </Text>
            </Stack>
          </Stack>
        </GlassCard>

        <GlassCard hoverable={false}>
          <Stack spacing={5}>
            <Text fontSize="lg" fontWeight="bold" as="h2">
              Preferences
            </Text>
            <ProfileForm key={user.id} user={user} onSaved={setUser} />
          </Stack>
        </GlassCard>
      </Stack>
    </PageWrapper>
  );
}
