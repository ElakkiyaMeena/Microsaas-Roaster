import { useRef, useState } from 'react';
import {
  Alert,
  AlertDescription,
  AlertDialog,
  AlertDialogBody,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogOverlay,
  AlertIcon,
  Badge,
  Heading,
  Link,
  Skeleton,
  Table,
  TableContainer,
  Tbody,
  Td,
  Text,
  Th,
  Thead,
  Tr,
  useToast,
  VisuallyHidden,
} from '@chakra-ui/react';
import { FiLink, FiTrash2 } from 'react-icons/fi';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { GlassCard } from '../../components/ui/GlassCard';
import { EmptyState } from '../../components/ui/EmptyState';
import { AdminNav } from '../../components/admin/AdminNav';
import { PaginationControls } from '../../components/admin/PaginationControls';
import { AnimatedButton } from '../../components/dashboard/AnimatedButton';
import { useAdminShareLinks, useDeleteAdminShareLink } from '../../hooks/useAdmin';
import { getErrorMessage } from '../../lib/errors';
import type { AdminShareLinkItem } from '../../types';

const PER_PAGE = 20;

function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleDateString();
}

function isExpired(link: AdminShareLinkItem): boolean {
  return link.expires_at !== null && new Date(link.expires_at).getTime() < Date.now();
}

/** Admin moderation of all public share links. */
export default function AdminShareLinksPage() {
  const toast = useToast();
  const [page, setPage] = useState<number>(1);
  const [target, setTarget] = useState<AdminShareLinkItem | null>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  const { data, isLoading, isError, error, refetch, isFetching } = useAdminShareLinks({
    page,
    per_page: PER_PAGE,
  });
  const deleteLink = useDeleteAdminShareLink();

  const links = data?.items ?? [];

  const confirmDelete = async (): Promise<void> => {
    if (!target) return;
    try {
      await deleteLink.mutateAsync(target.id);
      toast({ status: 'success', title: 'Share link taken down', duration: 3000 });
      setTarget(null);
      if (links.length === 1 && page > 1) setPage(page - 1);
    } catch (err) {
      toast({ status: 'error', title: 'Could not take down link', description: getErrorMessage(err) });
    }
  };

  return (
    <PageWrapper>
      <Heading size="lg" mb={4}>
        Share links
      </Heading>
      <AdminNav />

      <GlassCard hoverable={false}>
        {isError ? (
          <Alert status="error" borderRadius="xl">
            <AlertIcon />
            <AlertDescription flex="1">
              {getErrorMessage(error, 'Could not load share links.')}
            </AlertDescription>
            <AnimatedButton size="sm" onClick={() => void refetch()}>
              Retry
            </AnimatedButton>
          </Alert>
        ) : isLoading ? (
          <Skeleton h="240px" borderRadius="xl" />
        ) : links.length === 0 ? (
          <EmptyState
            icon={FiLink}
            title="No share links"
            description="Nobody has shared a roast yet."
            py={8}
          />
        ) : (
          <>
            <TableContainer overflowX="auto" opacity={isFetching ? 0.7 : 1}>
              <Table size="sm">
                <Thead>
                  <Tr>
                    <Th>Submission</Th>
                    <Th>Headline</Th>
                    <Th>Owner</Th>
                    <Th isNumeric>Views</Th>
                    <Th>Status</Th>
                    <Th>Created</Th>
                    <Th>
                      <VisuallyHidden>Actions</VisuallyHidden>
                    </Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {links.map((link) => {
                    const expired = isExpired(link);
                    return (
                      <Tr key={link.id}>
                        <Td>
                          <Link href={link.url} isExternal fontWeight="semibold">
                            {link.submission_title}
                          </Link>
                        </Td>
                        <Td maxW="xs" whiteSpace="normal">
                          <Text noOfLines={2}>{link.roast_headline ?? '—'}</Text>
                        </Td>
                        <Td>{link.owner_email}</Td>
                        <Td isNumeric>{link.view_count}</Td>
                        <Td>
                          <Badge
                            colorScheme={!link.is_active ? 'gray' : expired ? 'orange' : 'green'}
                          >
                            {!link.is_active ? 'Inactive' : expired ? 'Expired' : 'Active'}
                          </Badge>
                        </Td>
                        <Td>{formatDate(link.created_at)}</Td>
                        <Td>
                          <AnimatedButton
                            size="xs"
                            colorScheme="red"
                            variant="ghost"
                            leftIcon={<FiTrash2 />}
                            onClick={() => setTarget(link)}
                            aria-label={`Take down share link for ${link.submission_title}`}
                          >
                            Take down
                          </AnimatedButton>
                        </Td>
                      </Tr>
                    );
                  })}
                </Tbody>
              </Table>
            </TableContainer>
            <PaginationControls
              page={page}
              perPage={PER_PAGE}
              total={data?.total ?? 0}
              onPageChange={setPage}
              isDisabled={isFetching}
            />
          </>
        )}
      </GlassCard>

      <AlertDialog
        isOpen={target !== null}
        leastDestructiveRef={cancelRef}
        onClose={() => {
          if (!deleteLink.isPending) setTarget(null);
        }}
        isCentered
      >
        <AlertDialogOverlay>
          <AlertDialogContent mx={4}>
            <AlertDialogHeader fontSize="lg" fontWeight="bold">
              Take down share link?
            </AlertDialogHeader>
            <AlertDialogBody>
              The public link for <strong>{target?.submission_title}</strong>
              {target ? ` (owned by ${target.owner_email})` : ''} will be permanently deleted.
              Anyone opening it will see a 404.
            </AlertDialogBody>
            <AlertDialogFooter gap={3}>
              <AnimatedButton
                ref={cancelRef}
                variant="ghost"
                colorScheme="gray"
                onClick={() => setTarget(null)}
                isDisabled={deleteLink.isPending}
              >
                Cancel
              </AnimatedButton>
              <AnimatedButton
                colorScheme="red"
                onClick={() => void confirmDelete()}
                isLoading={deleteLink.isPending}
              >
                Take down
              </AnimatedButton>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialogOverlay>
      </AlertDialog>
    </PageWrapper>
  );
}
