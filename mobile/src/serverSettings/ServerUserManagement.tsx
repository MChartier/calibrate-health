import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useInfiniteQuery, useMutation, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { ApiError, type ServerUser, type ServerUserRole, type ServerUsersResponse } from '@calibrate/api-client';
import { useAuth } from '../auth/AuthContext';
import { AppButton } from '../components/AppButton';
import { AppNotice } from '../components/AppNotice';
import { AppSection } from '../components/AppSection';
import { AppText } from '../components/AppText';
import { BottomSheetModal } from '../components/BottomSheetModal';
import { SectionHeader } from '../components/SectionHeader';
import { SkeletonBlock } from '../components/SkeletonBlock';
import { TextField } from '../components/TextField';
import { getSafeActionErrorMessage } from '../errors/presentation';
import { useAppTheme } from '../theme';
import { serverSettingsQueryKey } from './useServerSettings';

const ADMIN_ROLE: ServerUserRole = 'admin';
const MEMBER_ROLE: ServerUserRole = 'member';
const ROLE_LABELS: Record<ServerUserRole, string> = { admin: 'Administrator', member: 'Member' };
// Bound the directory's initial request and keep loading content from collapsing the section.
const DIRECTORY_PAGE_SIZE = 25;
const MAX_EMAIL_SEARCH_LENGTH = 254;
const DIRECTORY_PLACEHOLDER_HEIGHT = 160;
// Wrap long email addresses and action buttons independently on narrow screens.
const ACCOUNT_COPY_MIN_WIDTH = 180;

const serverUsersQueryKey = (serverUrl: string, userId?: number) =>
    ['server-administration', serverUrl, userId, 'users'] as const;

type RoleChange = { user: ServerUser; role: ServerUserRole };

function isAuthorizationError(error: unknown) {
    return error instanceof ApiError && (error.status === 401 || error.status === 403);
}

function roleChangeErrorMessage(error: unknown) {
    if (error instanceof ApiError) {
        if (error.code === 'LAST_ADMIN_REQUIRED') {
            return 'Keep at least one verified administrator. Make another verified member an administrator before removing this role.';
        }
        if (error.code === 'EMAIL_VERIFICATION_REQUIRED') {
            return 'This member must verify their email before becoming an administrator.';
        }
        if (error.code === 'USER_NOT_FOUND') return 'This account no longer exists. Refresh the user list.';
    }
    return getSafeActionErrorMessage(error, 'The role could not be changed. Try again.');
}

/** The parent mounts this directory only while the current server confirms administrator access. */
export function ServerUserManagement({ onAuthorizationLost }: { onAuthorizationLost: () => void }) {
    const { api, serverUrl, user } = useAuth();
    const theme = useAppTheme();
    const queryClient = useQueryClient();
    const mutationInFlight = useRef(false);
    const activeScope = useRef(true);
    const requestController = useRef(new AbortController());
    useEffect(() => {
        activeScope.current = true;
        if (requestController.current.signal.aborted) requestController.current = new AbortController();
        return () => {
            activeScope.current = false;
            requestController.current.abort();
        };
    }, []);
    const [searchInput, setSearchInput] = useState('');
    const [search, setSearch] = useState('');
    const [confirmation, setConfirmation] = useState<RoleChange | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const usersKey = serverUsersQueryKey(serverUrl, user?.id);
    const settingsKey = serverSettingsQueryKey(serverUrl, user?.id);
    const directoryKey = [...usersKey, search];
    const directory = useInfiniteQuery({
        queryKey: directoryKey,
        queryFn: ({ pageParam, signal }) => api.getServerUsers({
            search: search || undefined,
            cursor: pageParam,
            limit: DIRECTORY_PAGE_SIZE
        }, signal),
        initialPageParam: undefined as number | undefined,
        getNextPageParam: (page) => page.next_cursor ?? undefined,
        staleTime: 0,
        retry: false,
        refetchOnWindowFocus: 'always',
        refetchOnReconnect: 'always'
    });
    const accounts = useMemo(() => {
        if (directory.isError) return [];
        return directory.data?.pages.flatMap((page) => page.users) ?? [];
    }, [directory.data, directory.isError]);
    const mutation = useMutation({
        mutationFn: (change: RoleChange) => api.updateServerUserRole(change.user.id, change.role, requestController.current.signal),
        onSuccess: async ({ user: updatedUser }) => {
            if (!activeScope.current) return;
            // Keep local access closed even if an earlier settings save responds after self-demotion.
            if (updatedUser.id === user?.id && updatedUser.role === MEMBER_ROLE) onAuthorizationLost();
            setConfirmation(null);
            setNotice(`${updatedUser.email}: ${ROLE_LABELS[updatedUser.role]} role saved.`);
            // Refresh every cached search and the current account's effective permissions.
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: usersKey }),
                queryClient.invalidateQueries({ queryKey: settingsKey })
            ]);
        },
        onError: async (error) => {
            if (!activeScope.current) return;
            if (isAuthorizationError(error)) {
                onAuthorizationLost();
                setConfirmation(null);
                await queryClient.invalidateQueries({ queryKey: settingsKey });
            }
        },
        onSettled: () => { mutationInFlight.current = false; }
    });
    useEffect(() => {
        if (directory.isFetching || !isAuthorizationError(directory.error)) return;
        onAuthorizationLost();
        setConfirmation(null);
        void queryClient.invalidateQueries({ queryKey: serverSettingsQueryKey(serverUrl, user?.id) });
    }, [directory.error, directory.isFetching, onAuthorizationLost, queryClient, serverUrl, user?.id]);

    function closeConfirmation() {
        if (mutationInFlight.current || mutation.isPending) return;
        setConfirmation(null);
        mutation.reset();
    }

    function submitSearch() {
        if (mutationInFlight.current || mutation.isPending) return;
        setConfirmation(null);
        mutation.reset();
        setNotice(null);
        const nextSearch = searchInput.trim();
        if (nextSearch === search) void directory.refetch();
        else setSearch(nextSearch);
    }

    function openConfirmation(account: ServerUser) {
        if (mutationInFlight.current || mutation.isPending || directory.isFetching) return;
        mutation.reset();
        setNotice(null);
        setConfirmation({ user: account, role: account.role === ADMIN_ROLE ? MEMBER_ROLE : ADMIN_ROLE });
    }

    function confirmRoleChange() {
        if (!confirmation || mutationInFlight.current || mutation.isPending || directory.isFetching || directory.isError) return;
        // Read the latest cache too: a completed refresh can precede the observer's next render.
        const currentAccount = queryClient.getQueryData<InfiniteData<ServerUsersResponse>>(directoryKey)
            ?.pages.flatMap((page) => page.users).find((account) => account.id === confirmation.user.id);
        if (!currentAccount || currentAccount.role !== confirmation.user.role
            || currentAccount.email_verified !== confirmation.user.email_verified) {
            setConfirmation(null);
            setNotice('This account changed. Review its current role before trying again.');
            return;
        }
        // Claim synchronously so repeated presses before React rerenders cannot send twice.
        mutationInFlight.current = true;
        mutation.mutate(confirmation);
    }

    const changingToAdmin = confirmation?.role === ADMIN_ROLE;
    const confirmationTitle = changingToAdmin ? 'Make this member an administrator?' : 'Remove administrator access?';
    let directoryError = 'The user list could not be loaded. Try again.';
    if (isAuthorizationError(directory.error)) directoryError = 'Administrator access could not be confirmed. Refresh your server permissions to continue.';
    if (directory.error instanceof ApiError && directory.error.status === 404) {
        directoryError = 'This server does not support user management yet. Update the server to manage roles here.';
    }
    const actionDisabled = mutation.isPending || directory.isFetching;
    const confirmationIsSelf = confirmation?.user.id === user?.id;
    const mutationError = mutation.isError ? roleChangeErrorMessage(mutation.error) : null;

    return <AppSection divider>
        <SectionHeader title="Users and roles" description="Choose who can manage this server. Role changes apply immediately." />
        <AppText variant="muted">Administrators manage server settings and user roles. Members use Calibrate with their own account.</AppText>
        <AppText variant="caption">On a new self-hosted server, the first account becomes an administrator. Administrator access requires a verified email. Keep at least one verified administrator.</AppText>
        <TextField
            label="Search users by email"
            value={searchInput}
            onChangeText={setSearchInput}
            maxLength={MAX_EMAIL_SEARCH_LENGTH}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            returnKeyType="search"
            editable={!mutation.isPending}
            onSubmitEditing={submitSearch}
        />
        <AppButton title="Search users" variant="secondary" disabled={mutation.isPending} onPress={submitSearch} />
        {notice && <AppText accessibilityLiveRegion="polite">{notice}</AppText>}
        {mutationError && !confirmation && <AppNotice tone="danger" accessibilityRole="alert"><AppText>{mutationError}</AppText></AppNotice>}
        {directory.isPending && <>
            <AppText>Loading users...</AppText>
            <SkeletonBlock height={DIRECTORY_PLACEHOLDER_HEIGHT} />
        </>}
        {directory.isError && <>
            <AppNotice tone="danger" accessibilityRole="alert"><AppText>{directoryError}</AppText></AppNotice>
            <AppButton title="Retry user list" variant="secondary" onPress={() => void directory.refetch()} />
        </>}
        {!directory.isPending && !directory.isError && <>
            <AppText variant="caption" accessibilityLiveRegion="polite">
                {directory.isFetching ? 'Refreshing users...' : `${accounts.length} ${accounts.length === 1 ? 'user' : 'users'} shown`}
            </AppText>
            {accounts.length === 0 && <AppText>{search ? 'No users match this email search.' : 'No users found.'}</AppText>}
            {accounts.map((account) => {
                const isAdmin = account.role === ADMIN_ROLE;
                const unverifiedMember = !isAdmin && !account.email_verified;
                const accountLabel = account.id === user?.id ? `${account.email} (you)` : account.email;
                const actionLabel = isAdmin ? 'Make member' : 'Make administrator';
                return <View key={account.id} style={{
                    flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: theme.spacing.md,
                    paddingVertical: theme.spacing.md, borderBottomWidth: StyleSheet.hairlineWidth,
                    borderBottomColor: theme.colors.outlineVariant
                }}>
                    <View style={{ flex: 1, minWidth: ACCOUNT_COPY_MIN_WIDTH, gap: theme.spacing.xs }}>
                        <AppText variant="label" selectable>{accountLabel}</AppText>
                        <AppText variant="caption">{ROLE_LABELS[account.role]} | {account.email_verified ? 'Email verified' : 'Email not verified'}</AppText>
                        {unverifiedMember && <AppText variant="caption">Verify email before granting administrator access.</AppText>}
                    </View>
                    <AppButton
                        title={actionLabel}
                        accessibilityLabel={`${actionLabel}: ${account.email}`}
                        variant="secondary"
                        style={{ maxWidth: '100%' }}
                        disabled={actionDisabled || unverifiedMember}
                        onPress={() => openConfirmation(account)}
                    />
                </View>;
            })}
            {directory.hasNextPage && <AppButton
                title="Load more users"
                variant="secondary"
                busy={directory.isFetchingNextPage}
                busyLabel="Loading users..."
                disabled={actionDisabled}
                onPress={() => void directory.fetchNextPage()}
            />}
            <AppButton title="Refresh user list" variant="ghost" disabled={actionDisabled} onPress={() => void directory.refetch()} />
        </>}
        <BottomSheetModal
            visible={Boolean(confirmation)}
            title={confirmationTitle}
            accessibilityLabel={confirmationTitle}
            showCloseButton
            dismissDisabled={mutation.isPending}
            onRequestClose={closeConfirmation}
        >
            <AppSection>
                <AppText variant="label" selectable>{confirmation?.user.email}</AppText>
                <AppText>{changingToAdmin
                    ? 'This person will be able to change server settings and grant or remove administrator access for other users.'
                    : 'This person will become a member and lose access to server settings and user role management.'}</AppText>
                {confirmationIsSelf && !changingToAdmin && <AppNotice tone="warning">
                    <AppText>You are removing your own administrator access. Another administrator will need to restore it if you need it again.</AppText>
                </AppNotice>}
                {!changingToAdmin && <AppText variant="caption">The server will prevent this change if it would remove the last verified administrator.</AppText>}
                {mutationError && <AppNotice tone="danger" accessibilityRole="alert"><AppText>{mutationError}</AppText></AppNotice>}
                <AppButton
                    title={changingToAdmin ? 'Confirm administrator access' : 'Confirm member role'}
                    variant={changingToAdmin ? 'primary' : 'danger'}
                    busy={mutation.isPending}
                    busyLabel="Changing role..."
                    disabled={directory.isFetching || directory.isError}
                    onPress={confirmRoleChange}
                />
                <AppButton title="Cancel" variant="secondary" disabled={mutation.isPending} onPress={closeConfirmation} />
            </AppSection>
        </BottomSheetModal>
    </AppSection>;
}
