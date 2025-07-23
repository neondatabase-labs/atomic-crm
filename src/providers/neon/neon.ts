import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { PostgrestClient } from '@supabase/postgrest-js';
import { StackClientApp } from "@stackframe/js";
import { fetchUtils } from 'ra-core';

export const stackClientApp = new StackClientApp({
  // You should store these in environment variables based on your project setup
  projectId: import.meta.env.VITE_STACK_PROJECT_ID,
  publishableClientKey: import.meta.env.VITE_STACK_PUBLISHABLE_CLIENT_KEY,
  tokenStore: "cookie",
});

async function accessToken() {
    const user = await stackClientApp.getUser();
    if (!user) {
        return null;
    }
    const tokens = await user.currentSession?.getTokens();
    return tokens?.accessToken;
}

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    {
        accessToken: accessToken
    }
);

export const supabaseHttpClient =
    ({
        apiKey,
        supabaseClient,
    }: {
        apiKey: string;
        supabaseClient: SupabaseClient;
    }) =>
    async (url: string, options: any = {}) => {
        //const { data } = await supabaseClient.auth.getSession();
        const token = await accessToken();
        if (!options.headers) options.headers = new Headers({});

        if (supabaseClient['headers']) {
            Object.entries(supabaseClient['headers']).forEach(([name, value]) =>
                options.headers.set(name, value)
            );
        }
        if (token) {
            options.user = {
                authenticated: true,
                // This ensures that users are identified correctly and that RLS can be applied
                token: `Bearer ${token}`,
            };
        }
        // Always send the apiKey even if there isn't a session
        options.headers.set('apiKey', apiKey);

        return fetchUtils.fetchJson(url, options);
    };

// hack to override the hardcoded /rest/v1 prefix in the supabase client
// @ts-ignore
supabase.rest = new PostgrestClient(SUPABASE_URL, {
    // @ts-ignore
    headers: supabase.headers,
    //schema: settings.db.schema,
    // @ts-ignore
    fetch: supabase.fetch,
})

export { supabase };