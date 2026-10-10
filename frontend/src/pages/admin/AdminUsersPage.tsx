import { useEffect, useState } from 'react';
import {
  Alert,
  AlertDescription,
  AlertIcon,
  Badge,
  Heading,
  Input,
  InputGroup,
  InputLeftElement,
  Skeleton,
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
  useToast,
} from '@chakra-ui/react';
import { FiSearch, FiUsers } from 'react-icons/fi';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { GlassCard } from '../../components/ui/GlassCard';
import { EmptyState } from '../../components/ui/EmptyState';
import { AdminNav } from '../../components/admin/AdminNav';
import { PaginationControls } from '../../components/admin/PaginationControls';
import { AnimatedButton } from '../../components/dashboard/AnimatedButton';
import { useAdminUsers, useUpdateAdminUser } from '../../hooks/useAdmin';
import { useAuth } from '../../hooks/useAuth';
import { getErrorMessage } from '../../lib/errors';
import type { AdminUpdateUserPayload, AdminUserItem } from '../../types';

const PER_PAGE = 20;
const SEARCH_DEBOUNCE_MS = 350;

function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleDateString();
}

/** Admin user management: search, paginate, activate/deactivate, promote/demote. */
export default function AdminUsersPage() {
  const { user: me } = useAuth();
  const toast = useToast();
  const [searchInput, setSearchInput] = useState<string>('');
  const [search, setSearch] = useState<string>('');
  const [page, setPage] = useState<number>(1);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const { data, isLoading, isError, error, refetch, isFetching } = useAdminUsers({
    page,
    per_page: PER_PAGE,
    search: search || undefined,
  });
  const updateUser = useUpdateAdminUser();
  const pendingId = updateUser.isPending ? updateUser.variables?.id : undefined;

  const toggle = async (target: AdminUserItem, payload: AdminUpdateUserPayload): Promise<void> => {
    try {
      await updateUser.mutateAsync({ id: target.id, payload });
      const label = target.full_name || target.email;
      const what =
        payload.is_active !== undefined
          ? payload.is_active
            ? 'activated'
            : 'deactivated'
          : payload.is_admin
            ? 'promoted to admin'
            : 'removed from admins';
      toast({ status: 'success', title: `${label} ${what}`, duration: 3000 });
    } catch (err) {
      toast({ status: 'error', title: 'Update failed', description: getErrorMessage(err) });
    }
  };

  const users = data?.items ?? [];

  return (
    <PageWrapper>
      <Heading size="lg" mb={4}>
        Users
      </Heading>
      <AdminNav />

      <GlassCard hoverable={false}>
        <InputGroup mb={4} maxW={{ base: 'full', md: 'sm' }}>
          <InputLeftElement pointerEvents="none">
            <FiSearch aria-hidden="true" />
          </InputLeftElement>
          <Input
            placeholder="Search by email or name"
            aria-label="Search users"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            borderRadius="full"
          />
        </InputGroup>

        {isError ? (
          <Alert status="error" borderRadius="xl">
            <AlertIcon />
            <AlertDescription flex="1">
              {getErrorMessage(error, 'Could not load users.')}
            </AlertDescription>
            <AnimatedButton size="sm" onClick={() => void refetch()}>
              Retry
            </AnimatedButton>
          </Alert>
        ) : isLoading ? (
          <Skeleton h="240px" borderRadius="xl" />
        ) : users.length === 0 ? (
          <EmptyState
            icon={FiUsers}
            title="No users found"
            description={search ? `Nobody matches "${search}".` : undefined}
            py={8}
          />
        ) : (
          <>
            <TableContainer overflowX="auto" opacity={isFetching ? 0.7 : 1}>
              <Table size="sm">
                <Thead>
                  <Tr>
                    <Th>Email</Th>
                    <Th>Name</Th>
                    <Th isNumeric>Submissions</Th>
                    <Th isNumeric>Roasts</Th>
                    <Th>Active</Th>
                    <Th>Admin</Th>
                    <Th>Joined</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {users.map((u) => {
                    const isSelf = me?.id === u.id;
                    const busy = pendingId === u.id;
                    const disabled = isSelf || busy;
                    const name = u.full_name || u.email;
                    return (
                      <Tr key={u.id}>
                        <Td>
                          <Text>{u.email}</Text>
                          {isSelf && (
                            <Badge colorScheme="purple" mt={1}>
                              You
                            </Badge>
                          )}
                        </Td>
                        <Td>{u.full_name ?? '—'}</Td>
                        <Td isNumeric>{u.submission_count}</Td>
                        <Td isNumeric>{u.roast_count}</Td>
                        <Td>
                          <Tooltip label="You cannot modify yourself" isDisabled={!isSelf}>
                            <span>
                              <Switch
                                colorScheme="green"
                                isChecked={u.is_active}
                                isDisabled={disabled}
                                aria-label={`Active: ${name}`}
                                onChange={(e) => void toggle(u, { is_active: e.target.checked })}
                              />
                            </span>
                          </Tooltip>
                        </Td>
                        <Td>
                          <Tooltip label="You cannot modify yourself" isDisabled={!isSelf}>
                            <span>
                              <Switch
                                colorScheme="brand"
                                isChecked={u.is_admin}
                                isDisabled={disabled}
                                aria-label={`Admin: ${name}`}
                                onChange={(e) => void toggle(u, { is_admin: e.target.checked })}
                              />
                            </span>
                          </Tooltip>
                        </Td>
                        <Td>{formatDate(u.created_at)}</Td>
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
    </PageWrapper>
  );
}
