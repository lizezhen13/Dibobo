import type { output, ZodIssue, ZodTypeAny } from "zod";

import { ApiError, apiFetch } from "./api";

export class ApiContractError extends ApiError {
  constructor(path: string, issues: ZodIssue[]) {
    super(`接口 ${path} 返回了无法识别的数据格式`, 502);
    this.name = "ApiContractError";
    this.issues = issues;
  }

  readonly issues: ZodIssue[];
}

export async function apiFetchSchema<TSchema extends ZodTypeAny>(
  path: string,
  schema: TSchema,
  init: RequestInit = {},
): Promise<output<TSchema>> {
  const payload = await apiFetch<unknown>(path, init);
  const parsed = schema.safeParse(payload);
  if (!parsed.success) throw new ApiContractError(path, parsed.error.issues);
  return parsed.data;
}
