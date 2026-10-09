// src/infrastructure/supabase/config.ts

declare const process: any;

/**
 * Public client configuration for Supabase and Google Auth.
 * Only public URL and anon/public key are included here.
 * Never include service-role keys or payment/live secrets in the mobile app.
 */
export const SUPABASE_URL: string =
  process.env.EXPO_PUBLIC_SUPABASE_URL ||
  process.env.REACT_APP_SUPABASE_URL ||
  "https://wfovneedmwetxnzhhobh.supabase.co";

export const SUPABASE_ANON_KEY: string =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.REACT_APP_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.placeholder";

export const GOOGLE_WEB_CLIENT_ID: string =
  process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ||
  process.env.REACT_APP_GOOGLE_WEB_CLIENT_ID ||
  process.env.GOOGLE_WEB_CLIENT_ID ||
  "136317108021-8h1kt3nk4hnibettk41uds85fghdvqgl.apps.googleusercontent.com";

let dynamicGoogleWebClientId: string = GOOGLE_WEB_CLIENT_ID;

export const setGoogleWebClientId = (clientId: string): void => {
  dynamicGoogleWebClientId = clientId.trim();
};

export const getGoogleWebClientId = (): string => {
  return dynamicGoogleWebClientId || GOOGLE_WEB_CLIENT_ID;
};
