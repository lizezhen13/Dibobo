import { z } from "zod";

const providerTypeSchema = z.enum(["fuyao", "fuyao_compatible", "longbridge"]);
const authTypeSchema = z.enum(["api_key", "oauth"]);
const capabilityStateSchema = z.enum(["supported", "unsupported", "partial"]);

export const dataSourceSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    provider_type: providerTypeSchema,
    base_url: z.string(),
    auth_type: authTypeSchema,
    api_key_mask: z.string(),
    credential_mask: z.string(),
    oauth_client_id: z.string().nullable(),
    oauth_expires_at: z.string().nullable(),
    oauth_authorized_at: z.string().nullable(),
    is_active: z.boolean(),
    last_test_status: z.enum(["success", "failed"]).nullable(),
    last_test_latency_ms: z.number().nullable(),
    last_test_at: z.string().nullable(),
    last_test_message: z.string().nullable(),
    capabilities: z.record(z.string(), capabilityStateSchema),
    created_at: z.string(),
    updated_at: z.string(),
  })
  .passthrough();

export const dataSourcesSchema = z.array(dataSourceSchema);
