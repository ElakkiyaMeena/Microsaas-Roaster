import { useRef, useState, type ChangeEvent } from 'react';
import {
  Box,
  FormControl,
  FormHelperText,
  FormLabel,
  HStack,
  Input,
  InputGroup,
  InputRightElement,
  Link,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Select,
  Stack,
  Stat,
  StatLabel,
  StatNumber,
  Switch,
  Text,
  Tooltip,
  useDisclosure,
  useToast,
} from '@chakra-ui/react';
import { FiCopy, FiExternalLink, FiShare2, FiTrash2 } from 'react-icons/fi';
import { GradientButton } from '../ui/GradientButton';
import { MotionAction } from './MotionAction';
import {
  useCreateShareLink,
  useDeleteShareLink,
  useUpdateShareLink,
} from '../../hooks/useShareLinks';
import { getErrorMessage } from '../../lib/errors';
import type { Roast, ShareLink } from '../../types';
import {
  EXPIRY_OPTIONS,
  copyToClipboard,
  expiryToIso,
  formatDate,
  isLinkLive,
  type ExpiryOption,
} from './shareUtils';

export interface ShareButtonProps {
  roast: Roast;
}

/**
 * Share a completed roast publicly: create a link, copy it, toggle code visibility, revoke.
 */
export function ShareButton({ roast }: ShareButtonProps) {
  const { isOpen, onOpen, onClose } = useDisclosure();
  const toast = useToast();
  const urlInputRef = useRef<HTMLInputElement>(null);

  // Local override of roast.share_link so the modal reflects mutations immediately,
  // before the parent's submission query refetches. `undefined` = use the prop.
  const [localLink, setLocalLink] = useState<ShareLink | null | undefined>(undefined);
  const [showCodeDraft, setShowCodeDraft] = useState(false);
  const [expiryDraft, setExpiryDraft] = useState<ExpiryOption>('never');
  const [confirmingRevoke, setConfirmingRevoke] = useState(false);

  const createMutation = useCreateShareLink();
  const updateMutation = useUpdateShareLink();
  const deleteMutation = useDeleteShareLink();

  const link = localLink !== undefined ? localLink : roast.share_link;
  const live = isLinkLive(link);
  const isShareable = roast.status === 'completed';

  const handleOpen = () => {
    setLocalLink(undefined);
    setShowCodeDraft(roast.share_link?.show_code ?? false);
    setExpiryDraft('never');
    setConfirmingRevoke(false);
    onOpen();
  };

  const showError = (title: string, err: unknown) => {
    toast({
      title,
      description: getErrorMessage(err),
      status: 'error',
      duration: 5000,
      isClosable: true,
    });
  };

  const handleCreate = async () => {
    try {
      const created = await createMutation.mutateAsync({
        roastId: roast.id,
        payload: { show_code: showCodeDraft, expires_at: expiryToIso(expiryDraft) },
      });
      setLocalLink(created);
      toast({ title: 'Public link created', status: 'success', duration: 3000 });
    } catch (err) {
      showError('Could not create link', err);
    }
  };

  const handleCopy = async (url: string) => {
    const ok = await copyToClipboard(url, urlInputRef.current);
    toast(
      ok
        ? { title: 'Link copied', status: 'success', duration: 2000 }
        : {
            title: 'Could not copy',
            description: 'Select the link and copy it manually.',
            status: 'warning',
            duration: 4000,
          },
    );
  };

  const handleToggleShowCode = async (
    current: ShareLink,
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const next = event.target.checked;
    try {
      const updated = await updateMutation.mutateAsync({
        id: current.id,
        payload: { show_code: next },
      });
      setLocalLink(updated);
      toast({
        title: next ? 'Code is now visible publicly' : 'Code is now hidden',
        status: 'success',
        duration: 2500,
      });
    } catch (err) {
      showError('Could not update link', err);
    }
  };

  const handleRevoke = async (current: ShareLink) => {
    try {
      await deleteMutation.mutateAsync(current.id);
      setLocalLink(null);
      setConfirmingRevoke(false);
      toast({ title: 'Link revoked', status: 'info', duration: 3000 });
    } catch (err) {
      showError('Could not revoke link', err);
    }
  };

  return (
    <>
      <Tooltip label="Only completed roasts can be shared" isDisabled={isShareable} hasArrow>
        <Box as="span" display="inline-block">
          <GradientButton
            leftIcon={<FiShare2 />}
            size="sm"
            onClick={handleOpen}
            isDisabled={!isShareable}
          >
            {isLinkLive(roast.share_link) ? 'Shared' : 'Share'}
          </GradientButton>
        </Box>
      </Tooltip>

      <Modal isOpen={isOpen} onClose={onClose} isCentered size="lg">
        <ModalOverlay backdropFilter="blur(6px)" />
        <ModalContent borderRadius="2xl" mx={4}>
          <ModalHeader>Share this roast</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            {live && link ? (
              <Stack spacing={5}>
                <FormControl>
                  <FormLabel htmlFor="share-url">Public link</FormLabel>
                  <InputGroup>
                    <Input
                      id="share-url"
                      ref={urlInputRef}
                      value={link.url}
                      isReadOnly
                      pr="6rem"
                      onFocus={(e) => e.target.select()}
                    />
                    <InputRightElement width="5.5rem" pr={1}>
                      <MotionAction
                        size="sm"
                        leftIcon={<FiCopy />}
                        onClick={() => void handleCopy(link.url)}
                      >
                        Copy
                      </MotionAction>
                    </InputRightElement>
                  </InputGroup>
                  {link.expires_at && (
                    <FormHelperText>Expires {formatDate(link.expires_at)}</FormHelperText>
                  )}
                </FormControl>

                <FormControl display="flex" alignItems="center" justifyContent="space-between">
                  <FormLabel htmlFor="share-show-code" mb={0}>
                    Show my code publicly
                  </FormLabel>
                  <Switch
                    id="share-show-code"
                    colorScheme="brand"
                    isChecked={link.show_code}
                    isDisabled={updateMutation.isPending}
                    onChange={(e) => void handleToggleShowCode(link, e)}
                  />
                </FormControl>

                <Stat>
                  <StatLabel>Views</StatLabel>
                  <StatNumber data-testid="share-view-count">{link.view_count}</StatNumber>
                </Stat>

                {confirmingRevoke && (
                  <Box borderWidth="1px" borderColor="red.300" borderRadius="lg" p={4}>
                    <Text mb={3}>
                      Revoke this link? Anyone with the URL will lose access. This cannot be
                      undone.
                    </Text>
                    <HStack justify="flex-end">
                      <MotionAction
                        size="sm"
                        variant="ghost"
                        onClick={() => setConfirmingRevoke(false)}
                      >
                        Cancel
                      </MotionAction>
                      <MotionAction
                        size="sm"
                        colorScheme="red"
                        isLoading={deleteMutation.isPending}
                        onClick={() => void handleRevoke(link)}
                      >
                        Yes, revoke
                      </MotionAction>
                    </HStack>
                  </Box>
                )}
              </Stack>
            ) : (
              <Stack spacing={5}>
                <Text color="text.muted">
                  Create a public, read-only link to this roast. Your email is never shown.
                  {link
                    ? ' Your previous link is inactive or expired; creating a link reactivates it.'
                    : ''}
                </Text>
                <FormControl display="flex" alignItems="center" justifyContent="space-between">
                  <FormLabel htmlFor="share-new-show-code" mb={0}>
                    Show my code publicly
                  </FormLabel>
                  <Switch
                    id="share-new-show-code"
                    colorScheme="brand"
                    isChecked={showCodeDraft}
                    onChange={(e) => setShowCodeDraft(e.target.checked)}
                  />
                </FormControl>
                <FormControl>
                  <FormLabel htmlFor="share-expiry">Expiry</FormLabel>
                  <Select
                    id="share-expiry"
                    value={expiryDraft}
                    onChange={(e) => setExpiryDraft(e.target.value as ExpiryOption)}
                  >
                    {EXPIRY_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </Select>
                </FormControl>
              </Stack>
            )}
          </ModalBody>

          <ModalFooter>
            {live && link ? (
              <HStack spacing={3} w="full" justify="space-between" flexWrap="wrap">
                <MotionAction
                  size="sm"
                  variant="ghost"
                  colorScheme="red"
                  leftIcon={<FiTrash2 />}
                  onClick={() => setConfirmingRevoke(true)}
                  isDisabled={confirmingRevoke}
                >
                  Revoke link
                </MotionAction>
                <Link
                  href={link.url}
                  isExternal
                  rel="noopener noreferrer"
                  _hover={{ textDecoration: 'none' }}
                >
                  <MotionAction as="span" size="sm" variant="outline" rightIcon={<FiExternalLink />}>
                    Open
                  </MotionAction>
                </Link>
              </HStack>
            ) : (
              <HStack spacing={3}>
                <MotionAction variant="ghost" onClick={onClose}>
                  Cancel
                </MotionAction>
                <GradientButton
                  onClick={() => void handleCreate()}
                  isLoading={createMutation.isPending}
                >
                  Create public link
                </GradientButton>
              </HStack>
            )}
          </ModalFooter>
        </ModalContent>
      </Modal>
    </>
  );
}

export default ShareButton;
