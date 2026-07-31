export type ProviderType = "fuyao" | "fuyao_compatible";
export type CapabilityState = "supported" | "unsupported" | "partial";

export interface DataSource {
  id: string;
  name: string;
  provider_type: ProviderType;
  base_url: string;
  api_key_mask: string;
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
  api_key: string;
}

export interface ConnectionTestResult {
  status: "success" | "failed";
  latency_ms: number;
  tested_at: string;
  message: string;
  capabilities: Record<string, CapabilityState>;
}

