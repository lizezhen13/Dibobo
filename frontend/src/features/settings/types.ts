export type ProviderType = "fuyao" | "fuyao_compatible" | "longbridge";
export type AuthType = "api_key" | "oauth";
export type CapabilityState = "supported" | "unsupported" | "partial";

export interface DataSource {
  id: string;
  name: string;
  provider_type: ProviderType;
  base_url: string;
  auth_type: AuthType;
  api_key_mask: string;
  credential_mask: string;
  oauth_client_id: string | null;
  oauth_expires_at: string | null;
  oauth_authorized_at: string | null;
  is_active: boolean;
  last_test_status: "success" | "failed" | null;
  last_test_latency_ms: number | null;
  last_test_at: string | null;
  last_test_message: string | null;
  capabilities: Record<string, CapabilityState>;
  created_at: string;
  updated_at: string;
}

export interface DataSourcePayload {
  name: string;
  provider_type: ProviderType;
  base_url: string;
  auth_type: AuthType;
  api_key?: string;
  app_key?: string;
  app_secret?: string;
  access_token?: string;
}

export interface OAuthStartPayload {
  name?: string;
  source_id?: string;
  base_url?: string;
}

export interface OAuthStartResult {
  authorization_url: string;
  source_id: string;
}

export interface ConnectionTestResult {
  status: "success" | "failed";
  latency_ms: number;
  tested_at: string;
  message: string;
  capabilities: Record<string, CapabilityState>;
}
