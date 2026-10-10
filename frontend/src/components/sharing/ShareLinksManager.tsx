import { useRef, useState } from 'react';
import {
  AlertDialog,
  AlertDialogBody,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogOverlay,
  Badge,
  Box,
  FormControl,
  FormLabel,
  HStack,
  Link,
  Stack,
  Switch,
  Table,
  TableContainer,
  Tbody,
  Td,
  Text,
  Th,
  Thead,
  Tooltip,
  Tr,
  useBreakpointValue,
  useToast,
} from '@chakra-ui/react';
import { FiAlertTriangle, FiCopy, FiExternalLink, FiLink, FiTrash2 } from 'react-icons/fi';
import { EmptyState } from '../ui/EmptyState';
import { GlassCard } from '../ui/GlassCard';
import { GradientButton } from '../ui/GradientButton';
import { LoadingScreen } from '../ui/LoadingScreen';
import { MotionAction } from './MotionAction';
import {
  useDeleteShareLink,
  useMyShareLinks,
  useUpdateShareLink,
} from '../../hooks/useShareLinks';
import { getErrorMessage } from '../../lib/errors';
import type { ShareLinkListItem, UpdateSharePayload } from '../../types';
import { copyToClipboard, formatDate, isExpired } from './shareUtils';

interface RowActions {
  onToggle: (link: ShareLinkListItem, payload: UpdateSharePayload) => void;
  onCopy: (link: ShareLinkListItem) => void;
  onRevoke: (link: ShareLinkListItem) => void;
  pendingId: number | null;
}

function ExpiresCell({ link }: { link: ShareLinkListItem }) {
  if (link.expires_at && isExpired(link)) {
    return (
      <Badge colorScheme="red" variant="subtle">
        Expired {formatDate(link.expires_at)}
      </Badge>
    );
  }
  return <Text fontSize="sm">{formatDate(link.expires_at)}</Text>;
}

function LinkActions({ link, onCopy, onRevoke }: { link: ShareLinkListItem } & RowActions) {
  return (
    <HStack spacing={1}>
      <Tooltip label="Copy link">
        <MotionAction
          aria-label={`Copy link for ${link.submission_title}`}
          size="sm"
          variant="ghost"
          px={2}
          onClick={() => onCopy(link)}
        >
          <FiCopy />
        </MotionAction>
      </Tooltip>
      <Tooltip label="Open public page">
        <Link href={link.url} isExternal rel="noopener noreferrer" aria-label="Open public page">
          <MotionAction as="span" size="sm" variant="ghost" px={2}>
            <FiExternalLink />
          </MotionAction>
        </Link>
      </Tooltip>
      <Tooltip label="Revoke link">
        <MotionAction
          aria-label={`Revoke link for ${link.submission_title}`}
          size="sm"
          variant="ghost"
          colorScheme="red"
          px={2}
          onClick={() => onRevoke(link)}
        >
          <FiTrash2 />
        </MotionAction>
      </Tooltip>
    </HStack>
  );
}

function buildSwitches({
  link,
  onToggle,
  pendingId,
  compact,
}: { link: ShareLinkListItem; compact?: boolean } & RowActions) {
  const busy = pendingId === link.id;
  const activeSwitch = (
    <Switch
      id={`active-${link.id}`}
      aria-label="Active"
      colorScheme="green"
      isChecked={link.is_active}
      isDisabled={busy}
      onChange={(e) => onToggle(link, { is_active: e.target.checked })}
    />
  );
  const codeSwitch = (
    <Switch
      id={`code-${link.id}`}
      aria-label="Show code"
      colorScheme="brand"
      isChecked={link.show_code}
      isDisabled={busy}
      onChange={(e) => onToggle(link, { show_code: e.target.checked })}
    />
  );
  if (!compact) return { activeSwitch, codeSwitch };
  return {
    activeSwitch: (
      <FormControl display="flex" alignItems="center" gap={2} w="auto">
        {activeSwitch}
        <FormLabel htmlFor={`active-${link.id}`} mb={0} fontSize="sm">
          Active
        </FormLabel>
      </FormControl>
    ),
    codeSwitch: (
      <FormControl display="flex" alignItems="center" gap={2} w="auto">
        {codeSwitch}
        <FormLabel htmlFor={`code-${link.id}`} mb={0} fontSize="sm">
          Show code
        </FormLabel>
      </FormControl>
    ),
  };
}

function LinksTable({ links, actions }: { links: ShareLinkListItem[]; actions: RowActions }) {
  return (
    <TableContainer>
      <Table size="sm" variant="simple">
        <Thead>
          <Tr>
            <Th>Submission</Th>
            <Th>Roast</Th>
            <Th isNumeric>Views</Th>
            <Th>Active</Th>
            <Th>Show code</Th>
            <Th>Expires</Th>
            <Th>Actions</Th>
          </Tr>
        </Thead>
        <Tbody>
          {links.map((link) => {
            const { activeSwitch, codeSwitch } = buildSwitches({ link, ...actions });
            return (
              <Tr key={link.id}>
                <Td fontWeight="semibold" maxW="12rem" whiteSpace="normal">
                  {link.submission_title}
                </Td>
                <Td maxW="16rem" whiteSpace="normal" color="text.muted">
                  {link.roast_headline ?? '—'}
                </Td>
                <Td isNumeric>{link.view_count}</Td>
                <Td>{activeSwitch}</Td>
                <Td>{codeSwitch}</Td>
                <Td>
                  <ExpiresCell link={link} />
                </Td>
                <Td>
                  <LinkActions link={link} {...actions} />
                </Td>
              </Tr>
            );
          })}
        </Tbody>
      </Table>
    </TableContainer>
  );
}

function LinksCards({ links, actions }: { links: ShareLinkListItem[]; actions: RowActions }) {
  return (
    <Stack spacing={3}>
      {links.map((link) => {
        const { activeSwitch, codeSwitch } = buildSwitches({ link, compact: true, ...actions });
        return (
          <GlassCard key={link.id} p={4} hoverable={false}>
            <Stack spacing={2}>
              <Text fontWeight="semibold">{link.submission_title}</Text>
              {link.roast_headline && (
                <Text fontSize="sm" color="text.muted">
                  {link.roast_headline}
                </Text>
              )}
              <HStack spacing={4} fontSize="sm" flexWrap="wrap">
                <Text>{link.view_count} views</Text>
                <HStack spacing={1}>
                  <Text color="text.muted">Expires:</Text>
                  <ExpiresCell link={link} />
                </HStack>
              </HStack>
              <HStack spacing={4} flexWrap="wrap">
                {activeSwitch}
                {codeSwitch}
              </HStack>
              <LinkActions link={link} {...actions} />
            </Stack>
          </GlassCard>
        );
      })}
    </Stack>
  );
}

/** Lists the current user's public share links with toggle / copy / revoke actions. */
export function ShareLinksManager() {
  const toast = useToast();
  const { data: links, isLoading, isError, error, refetch } = useMyShareLinks();
  const updateMutation = useUpdateShareLink();
  const deleteMutation = useDeleteShareLink();
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<ShareLinkListItem | null>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const layout = useBreakpointValue<'cards' | 'table'>({ base: 'cards', md: 'table' }, { ssr: false });

  const handleToggle = async (link: ShareLinkListItem, payload: UpdateSharePayload) => {
    setPendingId(link.id);
    try {
      await updateMutation.mutateAsync({ id: link.id, payload });
    } catch (err) {
      toast({
        title: 'Could not update link',
        description: getErrorMessage(err),
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    } finally {
      setPendingId(null);
    }
  };

  const handleCopy = async (link: ShareLinkListItem) => {
    const ok = await copyToClipboard(link.url);
    toast(
      ok
        ? { title: 'Link copied', status: 'success', duration: 2000 }
        : { title: 'Could not copy', description: link.url, status: 'warning', duration: 5000 },
    );
  };

  const handleConfirmRevoke = async () => {
    if (!revokeTarget) return;
    try {
      await deleteMutation.mutateAsync(revokeTarget.id);
      toast({ title: 'Link revoked', status: 'info', duration: 3000 });
      setRevokeTarget(null);
    } catch (err) {
      toast({
        title: 'Could not revoke link',
        description: getErrorMessage(err),
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    }
  };

  if (isLoading) return <LoadingScreen minH="12rem" label="Loading your share links..." />;

  if (isError) {
    return (
      <EmptyState
        icon={FiAlertTriangle}
        title="Couldn't load your share links"
        description={getErrorMessage(error)}
        action={
          <GradientButton size="sm" onClick={() => void refetch()}>
            Try again
          </GradientButton>
        }
        py={8}
      />
    );
  }

  if (!links || links.length === 0) {
    return (
      <EmptyState
        icon={FiLink}
        title="No share links yet"
        description="Open a completed roast and hit Share to create a public link."
        py={8}
      />
    );
  }

  const actions: RowActions = {
    onToggle: (link, payload) => void handleToggle(link, payload),
    onCopy: (link) => void handleCopy(link),
    onRevoke: setRevokeTarget,
    pendingId,
  };

  return (
    <Box>
      {layout === 'table' ? (
        <LinksTable links={links} actions={actions} />
      ) : (
        <LinksCards links={links} actions={actions} />
      )}

      <AlertDialog
        isOpen={revokeTarget !== null}
        leastDestructiveRef={cancelRef}
        onClose={() => setRevokeTarget(null)}
        isCentered
      >
        <AlertDialogOverlay>
          <AlertDialogContent mx={4} borderRadius="2xl">
            <AlertDialogHeader>Revoke share link?</AlertDialogHeader>
            <AlertDialogBody>
              The public link for &ldquo;{revokeTarget?.submission_title}&rdquo; will stop
              working. This cannot be undone.
            </AlertDialogBody>
            <AlertDialogFooter gap={3}>
              <MotionAction ref={cancelRef} variant="ghost" onClick={() => setRevokeTarget(null)}>
                Cancel
              </MotionAction>
              <MotionAction
                colorScheme="red"
                isLoading={deleteMutation.isPending}
                onClick={() => void handleConfirmRevoke()}
              >
                Revoke
              </MotionAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialogOverlay>
      </AlertDialog>
    </Box>
  );
}

export default ShareLinksManager;
