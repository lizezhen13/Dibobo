import { zodResolver } from "@hookform/resolvers/zod";
import { KeyRound, Link2, ShieldCheck } from "lucide-react";
import { useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "../../components/ui/button";
import { FormField, InlineAlert, LoadingButton } from "../../components/patterns";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { Input } from "../../components/ui/input";
import { Select } from "../../components/ui/select";
import { ApiError } from "../../lib/api";
import { useCreateDataSourceMutation, useStartLongbridgeOAuthMutation, useUpdateDataSourceMutation } from "./queries";
import type { DataSource, DataSourcePayload } from "./types";

interface DataSourceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  source: DataSource | null;
}

export function DataSourceDialog({ open, onOpenChange, source }: DataSourceDialogProps) {
  const createMutation = useCreateDataSourceMutation();
  const updateMutation = useUpdateDataSourceMutation();
  const oauthMutation = useStartLongbridgeOAuthMutation();
  const isEditing = source !== null;
  const schema = useMemo(
    () =>
      z
        .object({
          name: z.string().trim().min(1, "请输入数据源名称").max(50, "名称不能超过 50 个字符"),
          provider_type: z.enum(["fuyao", "fuyao_compatible", "longbridge"]),
          auth_type: z.enum(["api_key", "oauth"]),
          base_url: z.url("请输入合法的 HTTP 或 HTTPS 地址"),
          api_key: z.string().max(2048, "API Key 过长").optional(),
          app_key: z.string().max(512, "App Key 过长").optional(),
          app_secret: z.string().max(2048, "App Secret 过长").optional(),
          access_token: z.string().max(4096, "Access Token 过长").optional(),
        })
        .superRefine((value, context) => {
          if (value.provider_type !== "longbridge" && value.auth_type !== "api_key") {
            context.addIssue({ code: "custom", path: ["auth_type"], message: "该数据源仅支持 API Key" });
          }
          if (value.provider_type !== "longbridge" && !isEditing && !value.api_key?.trim()) {
            context.addIssue({ code: "custom", path: ["api_key"], message: "新增时必须填写 API Key" });
          }
          if (value.provider_type === "longbridge" && value.auth_type === "api_key" && !isEditing) {
            for (const [key, label] of [
              ["app_key", "App Key"],
              ["app_secret", "App Secret"],
              ["access_token", "Access Token"],
            ] as const) {
              if (!value[key]?.trim()) {
                context.addIssue({ code: "custom", path: [key], message: `请输入 ${label}` });
              }
            }
          }
          if (!/^https?:\/\//i.test(value.base_url)) {
            context.addIssue({
              code: "custom",
              path: ["base_url"],
              message: "仅支持 HTTP 或 HTTPS 地址",
            });
          }
        }),
    [isEditing],
  );
  const form = useForm<DataSourcePayload>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      provider_type: "fuyao",
      auth_type: "api_key",
      base_url: "https://fuyao.aicubes.cn",
      api_key: "",
      app_key: "",
      app_secret: "",
      access_token: "",
    },
  });

  // Mutation/form object identities can change while a request is pending; reset only when the dialog target changes.
  useEffect(() => {
    if (!open) return;
    form.reset({
      name: source?.name ?? "",
      provider_type: source?.provider_type ?? "fuyao",
      auth_type: source?.auth_type ?? "api_key",
      base_url: source?.base_url ?? (source?.provider_type === "longbridge" ? "https://openapi.longbridge.cn" : "https://fuyao.aicubes.cn"),
      api_key: "",
      app_key: "",
      app_secret: "",
      access_token: "",
    });
    createMutation.reset();
    updateMutation.reset();
    oauthMutation.reset();
  }, [open, source]); // eslint-disable-line react-hooks/exhaustive-deps

  const providerType = form.watch("provider_type");
  const authType = form.watch("auth_type");
  const isLongbridge = providerType === "longbridge";
  const isOAuth = isLongbridge && authType === "oauth";
  const isPending = createMutation.isPending || updateMutation.isPending || oauthMutation.isPending;
  const mutationError = createMutation.error ?? updateMutation.error ?? oauthMutation.error;
  const errorMessage = mutationError instanceof ApiError ? mutationError.message : mutationError ? "保存失败，请稍后重试" : null;

  const startOAuth = async () => {
    const valid = await form.trigger("name");
    if (!valid) return;
    try {
      const result = await oauthMutation.mutateAsync(
        source ? { source_id: source.id } : { name: form.getValues("name"), base_url: form.getValues("base_url") },
      );
      window.location.assign(result.authorization_url);
    } catch {
      // 请求错误保留在弹窗内展示
    }
  };

  const onSubmit = form.handleSubmit(async (values) => {
    if (isOAuth) {
      await startOAuth();
      return;
    }
    try {
      if (source) {
        await updateMutation.mutateAsync({ id: source.id, payload: values });
      } else {
        await createMutation.mutateAsync(values);
      }
      onOpenChange(false);
    } catch {
      // 请求错误保留在弹窗内展示
    }
  });

  const handleProviderChange = (value: string) => {
    const nextProvider = value as DataSourcePayload["provider_type"];
    form.setValue("provider_type", nextProvider, { shouldValidate: true });
    if (nextProvider === "longbridge") {
      form.setValue("auth_type", "api_key", { shouldValidate: true });
      if (form.getValues("base_url") === "https://fuyao.aicubes.cn") {
        form.setValue("base_url", "https://openapi.longbridge.cn");
      }
    } else {
      form.setValue("auth_type", "api_key", { shouldValidate: true });
      if (form.getValues("base_url") === "https://openapi.longbridge.cn") {
        form.setValue("base_url", "https://fuyao.aicubes.cn");
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEditing ? "编辑数据源" : "新增数据源"}</DialogTitle>
          <DialogDescription>
            {isOAuth
              ? "OAuth 会在 Longbridge 官方页面完成授权，Dibobo 只保存加密后的令牌。"
              : isEditing
                ? "留空密钥字段表示保持原值；修改连接信息后需要重新测试。"
                : "凭证只在提交时传输，服务端加密保存，之后不会再返回明文。"}
          </DialogDescription>
        </DialogHeader>

        <form id="data-source-form" onSubmit={onSubmit} noValidate>
          <DialogBody className="space-y-5">
            <div className="grid grid-cols-2 gap-5">
              <FormField label="数据源名称" required error={form.formState.errors.name?.message}>
                <Input placeholder="例如：我的同花顺数据源" {...form.register("name")} />
              </FormField>
              <FormField label="数据源类型" required error={form.formState.errors.provider_type?.message}>
                <Select
                  {...form.register("provider_type", {
                    onChange: (event) => handleProviderChange(event.target.value),
                  })}
                >
                  <option value="fuyao">同花顺</option>
                  <option value="fuyao_compatible">同花顺兼容</option>
                  <option value="longbridge">Longbridge</option>
                </Select>
              </FormField>
            </div>

            <FormField
              label="Base URL"
              required
              error={form.formState.errors.base_url?.message}
              hint={isLongbridge ? "默认中国节点 · .cn" : undefined}
            >
              <Input
                placeholder={isLongbridge ? "https://openapi.longbridge.cn" : "https://fuyao.aicubes.cn"}
                {...form.register("base_url")}
              />
            </FormField>
            {isLongbridge && (
              <p className="-mt-3 text-[0.78rem] leading-5 text-muted-foreground/65">
                默认节点适用于中国大陆接入；如果账户属于 US 数据中心，可改用 Longbridge 官方对应节点。
              </p>
            )}

            {isLongbridge ? (
              <>
                <div>
                  <p className="mb-2 text-[0.8rem] font-semibold tracking-[0.04em] text-muted-foreground">鉴权方式</p>
                  <div
                    className="grid grid-cols-2 gap-2 rounded-xl border border-border bg-secondary/45 p-1"
                    role="group"
                    aria-label="鉴权方式"
                  >
                    <button
                      type="button"
                      aria-pressed={authType === "api_key"}
                      className={`rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
                        authType === "api_key"
                          ? "bg-background text-foreground shadow-subtle"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                      onClick={() => form.setValue("auth_type", "api_key", { shouldValidate: true })}
                    >
                      API 凭证
                    </button>
                    <button
                      type="button"
                      aria-pressed={authType === "oauth"}
                      className={`rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
                        authType === "oauth" ? "bg-background text-foreground shadow-subtle" : "text-muted-foreground hover:text-foreground"
                      }`}
                      onClick={() => form.setValue("auth_type", "oauth", { shouldValidate: true })}
                    >
                      OAuth 2.0
                    </button>
                  </div>
                  {form.formState.errors.auth_type?.message && (
                    <span className="mt-1.5 block text-[0.8rem] text-danger">{form.formState.errors.auth_type.message}</span>
                  )}
                </div>

                {authType === "api_key" ? (
                  <div className="space-y-4 rounded-xl border border-border bg-secondary/20 p-4">
                    <div className="grid grid-cols-2 gap-4">
                      <FormField label="App Key" error={form.formState.errors.app_key?.message}>
                        <Input type="password" autoComplete="off" placeholder="请输入 App Key" {...form.register("app_key")} />
                      </FormField>
                      <FormField label="App Secret" error={form.formState.errors.app_secret?.message}>
                        <Input type="password" autoComplete="off" placeholder="请输入 App Secret" {...form.register("app_secret")} />
                      </FormField>
                    </div>
                    <FormField
                      label={isEditing ? "Access Token（可选）" : "Access Token"}
                      error={form.formState.errors.access_token?.message}
                      hint={isEditing ? `当前 ${source.credential_mask}，留空表示不修改` : undefined}
                    >
                      <div className="relative">
                        <Input
                          type="password"
                          autoComplete="off"
                          placeholder={isEditing ? "留空表示保持原令牌" : "请输入 Access Token"}
                          className="pl-10"
                          {...form.register("access_token")}
                        />
                        <KeyRound className="absolute left-3.5 top-3 text-muted-foreground/60" size={15} />
                      </div>
                    </FormField>
                  </div>
                ) : (
                  <div className="rounded-xl border border-primary/20 bg-primary/[0.06] p-4">
                    <div className="flex items-start gap-3">
                      <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/15 text-primary">
                        <Link2 size={16} />
                      </div>
                      <div>
                        <p className="font-semibold text-foreground">浏览器授权</p>
                        <p className="mt-1 text-[0.82rem] leading-6 text-muted-foreground">
                          将打开 Longbridge
                          官方授权页。授权完成后会自动回到本页，并可在这里测试行情、基本面、市场、市场温度、资讯和财经日历。
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <FormField
                label={isEditing ? "API Key（可选）" : "API Key"}
                error={form.formState.errors.api_key?.message}
                hint={isEditing ? `当前 ${source.api_key_mask}，留空表示不修改` : undefined}
              >
                <div className="relative">
                  <Input
                    type="password"
                    autoComplete="off"
                    placeholder={isEditing ? "留空表示保持原密钥" : "请输入 API Key"}
                    className="pl-10"
                    {...form.register("api_key")}
                  />
                  <KeyRound className="absolute left-3.5 top-3 text-muted-foreground/60" size={15} />
                </div>
              </FormField>
            )}

            <div className="flex gap-3 rounded-lg border border-market-down/15 bg-market-down/5 px-4 py-3 text-[0.85rem] leading-relaxed text-muted-foreground">
              <ShieldCheck className="mt-0.5 shrink-0 text-market-down" size={16} />
              {isLongbridge
                ? "Longbridge 与其他数据源一样，测试通过后可在卡片中启用或停用；完整凭证不会出现在查询响应、页面状态或日志中。"
                : "浏览器刷新或再次编辑时只会看到固定掩码。完整密钥不会出现在查询响应、页面状态或日志中。"}
            </div>

            {errorMessage && <InlineAlert>{errorMessage}</InlineAlert>}
          </DialogBody>
        </form>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            取消
          </Button>
          <LoadingButton
            type={isOAuth ? "button" : "submit"}
            form={isOAuth ? undefined : "data-source-form"}
            onClick={isOAuth ? () => void startOAuth() : undefined}
            loading={isPending}
          >
            {isOAuth ? "开始 OAuth 授权" : isEditing ? "保存修改" : "保存数据源"}
          </LoadingButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
