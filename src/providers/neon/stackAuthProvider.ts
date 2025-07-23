//import { Provider, SupabaseClient, User } from '@supabase/supabase-js';
import { StackClientApp, User} from "@stackframe/js";
import { ProviderType as Provider } from '@stackframe/stack-shared/dist/utils/oauth';
import { AuthProvider, UserIdentity } from 'ra-core';



function getSearchString() {
    const search = window.location.search;
    const hash = window.location.hash.substring(1);

    return search && search !== ''
        ? search
        : hash.includes('?')
        ? hash.split('?')[1]
        : hash;
}

export const stackAuthProvider = (
    client: StackClientApp,
    { getIdentity, getPermissions, redirectTo }: StackAuthProviderOptions
): StackAuthProvider => {
    const authProvider: StackAuthProvider = {
        async login(params) {
            const emailPasswordParams = params as LoginWithEmailPasswordParams;
            if (emailPasswordParams.email && emailPasswordParams.password) {
                console.log(emailPasswordParams);
                const result = await client.signInWithCredential(
                    emailPasswordParams
                );

                if (result.status === "error") {
                    throw result.error;
                }
                console.log(result);
                return;
            }

            const oauthParams = params as LoginWithOAuthParams;
            if (oauthParams.provider) {
                await client.signInWithOAuth(oauthParams.provider);
                // To avoid react-admin to consider this as an immediate success,
                // we return a rejected promise that is handled by the default OAuth login buttons
                return Promise.reject();
            }
            return Promise.reject(new Error('Invalid login parameters'));
        },
        async setPassword({
            oldPassword,
            newPassword,
        }: SetPasswordParams) {
            
            const user = await client.getUser();
            if (user == null) {
                throw new Error("User not found");
            }
            const result = await user.updatePassword({ oldPassword, newPassword });
            if (result.status === "error") {
                throw result.error;
            }
            return undefined;
        },
        async resetPassword(params: ResetPasswordParams) {
            const { email } = params;
            const result = await client.sendForgotPasswordEmail(email);
            if (result.status === "error") {
                throw result.error;
            }
            return undefined;
        },
        async logout() {
            const user = await client.getUser();
            await user?.signOut();    
            return undefined;
        },
        async checkError(error) {
            if (
                error.status === 401 ||
                error.status === 403 ||
                // Supabase returns 400 when the session is missing, we need to check this case too.
                (error.status === 400 &&
                    error.name === 'AuthSessionMissingError')
            ) {
                return Promise.reject();
            }

            return Promise.resolve();
        },
        async handleCallback() {
            const { access_token, refresh_token, type } = getUrlParams();

            // Users have reset their password or have just been invited and must set a new password
            if (type === 'recovery' || type === 'invite') {
                if (access_token && refresh_token) {
                    return {
                        redirectTo: () => ({
                            pathname: redirectTo
                                ? `${redirectTo}/set-password`
                                : '/set-password',
                            search: `access_token=${access_token}&refresh_token=${refresh_token}&type=${type}`,
                        }),
                    };
                }

                if (process.env.NODE_ENV === 'development') {
                    console.error(
                        'Missing access_token or refresh_token for an invite or recovery'
                    );
                }
            }
        },
        async checkAuth() {
            // Users are on the set-password page, nothing to do
            if (
                window.location.pathname === '/set-password' ||
                window.location.hash.includes('#/set-password')
            ) {
                return;
            }
            // Users are on the forgot-password page, nothing to do
            if (
                window.location.pathname === '/forgot-password' ||
                window.location.hash.includes('#/forgot-password')
            ) {
                return;
            }

            const { access_token, refresh_token, type } = getUrlParams();
            // Users have reset their password or have just been invited and must set a new password
            if (type === 'recovery' || type === 'invite') {
                if (access_token && refresh_token) {
                    // eslint-disable-next-line no-throw-literal
                    throw {
                        redirectTo: () => ({
                            pathname: redirectTo
                                ? `${redirectTo}/set-password`
                                : '/set-password',
                            search: `access_token=${access_token}&refresh_token=${refresh_token}&type=${type}`,
                        }),
                        message: false,
                    };
                }

                if (process.env.NODE_ENV === 'development') {
                    console.error(
                        'Missing access_token or refresh_token for an invite or recovery'
                    );
                }
            }

            // const { data } = await client.auth.getSession();
            // if (data.session == null) {
            //     return Promise.reject();
            // }
            const user = await client.getUser();
            if (user == null) {
                return Promise.reject();
            }
            if (user.currentSession == null) {
                return Promise.reject();
            }

            return Promise.resolve();
        },
        async getPermissions() {
            if (typeof getPermissions !== 'function') {
                return;
            }
            // No permissions when users are on the set-password page
            // or on the forgot-password page.
            if (
                window.location.pathname === '/set-password' ||
                window.location.hash.includes('#/set-password') ||
                window.location.pathname === '/forgot-password' ||
                window.location.hash.includes('#/forgot-password')
            ) {
                return;
            }

            const user = await client.getUser();
            if (user == null) {
                return;
            }

            const permissions = await getPermissions(user);
            return permissions;
        },
    };

    if (typeof getIdentity === 'function') {
        authProvider.getIdentity = async () => {
            const user = await client.getUser();
            if (user == null) {
                throw new Error("User not found");
            }
            const identity = await getIdentity(user);
            return identity;
        };
    }

    return authProvider;
};

export type GetIdentity = (user: User) => Promise<UserIdentity>;
export type GetPermissions = (user: User) => Promise<any>;
export type StackAuthProviderOptions = {
    getIdentity?: GetIdentity;
    getPermissions?: GetPermissions;
    redirectTo?: string;
};

type LoginWithEmailPasswordParams = {
    email: string;
    password: string;
};

type LoginWithOAuthParams = {
    provider: Provider;
};

type LoginWithMagicLink = {
    email: string;
};

export interface StackAuthProvider extends AuthProvider {
    login: (
        params:
            | LoginWithEmailPasswordParams
            | LoginWithMagicLink
            | LoginWithOAuthParams
    ) => ReturnType<AuthProvider['login']>;
    setPassword: (params: SetPasswordParams) => Promise<void>;
    resetPassword: (params: ResetPasswordParams) => Promise<void>;
}

export type SetPasswordParams = {
    oldPassword: string;
    newPassword: string;
};

export type ResetPasswordParams = {
    email: string;
    redirectTo?: string;
    captchaToken?: string;
};

const getUrlParams = () => {
    const searchStr = getSearchString();
    const urlSearchParams = new URLSearchParams(searchStr);
    const access_token = urlSearchParams.get('access_token');
    const refresh_token = urlSearchParams.get('refresh_token');
    const type = urlSearchParams.get('type');

    return { access_token, refresh_token, type };
};
