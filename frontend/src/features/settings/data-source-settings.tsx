import {
  Activity,
  AlertTriangle,
  Check,
  CircleOff,
  DatabaseZap,
  KeyRound,
  LoaderCircle,
  Minus,
  Pencil,
  Plus,
  Power,
  PowerOff,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import { lazy, Suspense, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "../../components/ui/alert-dialog";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { Skeleton } from "../../components/ui/skeleton";
import { ApiError } from "../../lib/api";
import { formatDateTime } from "../../lib/formatters";
import { cn } from "../../lib/utils";
import type { DataSource } from "./types";
import {
  useActivateDataSourceMutation,
  useDataSourcesQuery,
  useDeactivateDataSourceMutation,
  useDeleteDataSourceMutation,
  useTestDataSourceMutation,
} from "./queries";

const DataSourceDialog = lazy(() => import("./data-source-dialog").then(({ DataSourceDialog: Dialog }) => ({ default: Dialog })));

type Notice = { tone: "success" | "error" | "warning"; message: string } | null;

const capabilityLabels: Record<string, string> = {
  instrument_search: "标的检索",
  instrument_list: "标的列表",
  a_share_quote: "A 股行情",
  etf_quote: "ETF 行情",
  index_quote: "指数行情",
  valuation_pb: "PB 估值",
  financial_roe: "ROE 财务指标",
  corporate_action_dividend: "现金分红",
  total_market_cap: "总市值",
  instrument_status: "证券状态",
  quote: "行情接口",
  quote_realtime: "实时行情",
  fundamental: "基本面",
  market: "市场数据",
  content: "资讯内容",
  financial_calendar: "财经日历",
};

export function DataSourceSettings() {
  const query = useDataSourcesQuery();
  const testMutation = useTestDataSourceMutation();
  const activateMutation = useActivateDataSourceMutation();
  const deactivateMutation = useDeactivateDataSourceMutation();
  const deleteMutation = useDeleteDataSourceMutation();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingSource, setEditingSource] = useState<DataSource | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const [notice, setNotice] = useState<Notice>(() => getOAuthNotice(searchParams));

  useEffect(() => {
    const oauthStatus = searchParams.get("oauth");
    if (!oauthStatus) return;
    const cleaned = new URLSearchParams(searchParams);
    cleaned.delete("oauth");
    cleaned.delete("message");
    cleaned.delete("source_id");
    setSearchParams(cleaned, { replace: true });
  }, [searchParams, setSearchParams]);

  const openCreate = () => {
    setEditingSource(null);
    setDialogOpen(true);
  };
  const openEdit = (source: DataSource) => {
    setEditingSource(source);
    setDialogOpen(true);
  };

  const runTest = async (source: DataSource) => {
    setNotice(null);
    try {
      const result = await testMutation.mutateAsync(source.id);
      setNotice({
        tone: result.status === "success" ? "success" : "error",
        message:
          result.status === "success" ? `${source.name} 连接成功，耗时 ${result.latency_ms} ms` : `${source.name}：${result.message}`,
      });
    } catch (error) {
      setNotice({ tone: "error", message: getErrorMessage(error, "连接测试失败") });
    }
  };

  const activate = async (source: DataSource) => {
    setNotice(null);
    try {
      await activateMutation.mutateAsync(source.id);
      setNotice({ tone: "success", message: `${source.name} 已启用，行情页面将切换到该数据源` });
    } catch (error) {
      setNotice({ tone: "error", message: getErrorMessage(error, "启用失败") });
    }
  };

  const deactivate = async (source: DataSource) => {
    setNotice(null);
    try {
      await deactivateMutation.mutateAsync(source.id);
      setNotice({ tone: "success", message: `${source.name} 已停用` });
    } catch (error) {
      setNotice({ tone: "error", message: getErrorMessage(error, "停用失败") });
    }
  };

  const remove = async (source: DataSource) => {
    setNotice(null);
    try {
      await deleteMutation.mutateAsync(source.id);
      setNotice({ tone: "success", message: `${source.name} 已永久删除` });
    } catch (error) {
      setNotice({ tone: "error", message: getErrorMessage(error, "删除失败") });
    }
  };

  return (
    <div className="animate-enter">
      {notice && <NoticeBar notice={notice} onClose={() => setNotice(null)} />}

      {query.isPending ? (
        <div className="space-y-4">
          {Array.from({ length: 2 }).map((_, index) => (
            <Skeleton key={index} className="h-[210px] w-full" />
          ))}
        </div>
      ) : query.isError ? (
        <Card className="grid min-h-[360px] place-items-center text-center">
          <div>
            <AlertTriangle className="mx-auto text-danger" size={26} />
            <p className="mt-5 font-display text-2xl">数据源配置加载失败</p>
            <Button className="mt-5" variant="outline" onClick={() => void query.refetch()}>
              重新加载
            </Button>
          </div>
        </Card>
      ) : query.data.length === 0 ? (
        <Card className="grid min-h-[430px] place-items-center text-center">
          <div className="max-w-md">
            <div className="mx-auto grid size-14 place-items-center rounded-full border border-primary/25 bg-primary/10 text-primary/90">
              <DatabaseZap size={23} />
            </div>
            <h3 className="mt-5 font-display text-2xl">还没有数据源</h3>
            <p className="mt-3 text-[0.95rem] leading-7 text-muted-foreground">
              添加同花顺配置并启用，或接入 Longbridge 作为独立测试源。所有凭证都会在服务端加密保存。
            </p>
            <Button className="mt-7" onClick={openCreate}>
              <Plus size={17} /> 添加第一条配置
            </Button>
          </div>
        </Card>
      ) : (
        <div className="space-y-5">
          {query.data.map((source, index) => (
            <DataSourceCard
              key={source.id}
              source={source}
              ordinal={index + 1}
              testing={testMutation.isPending && testMutation.variables === source.id}
              activating={activateMutation.isPending && activateMutation.variables === source.id}
              deactivating={deactivateMutation.isPending && deactivateMutation.variables === source.id}
              deleting={deleteMutation.isPending && deleteMutation.variables === source.id}
              onTest={() => void runTest(source)}
              onActivate={() => void activate(source)}
              onDeactivate={() => void deactivate(source)}
              onEdit={() => openEdit(source)}
              onDelete={() => void remove(source)}
            />
          ))}
        </div>
      )}

      {!query.isPending && !query.isError && (
        <div className="mt-5">
          <Button onClick={openCreate}>
            <Plus size={17} /> 新增数据源
          </Button>
        </div>
      )}

      <Suspense fallback={null}>
        {dialogOpen && <DataSourceDialog open={dialogOpen} onOpenChange={setDialogOpen} source={editingSource} />}
      </Suspense>
    </div>
  );
}

function DataSourceCard({
  source,
  ordinal,
  testing,
  activating,
  deactivating,
  deleting,
  onTest,
  onActivate,
  onDeactivate,
  onEdit,
  onDelete,
}: {
  source: DataSource;
  ordinal: number;
  testing: boolean;
  activating: boolean;
  deactivating: boolean;
  deleting: boolean;
  onTest: () => void;
  onActivate: () => void;
  onDeactivate: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const capabilities = Object.entries(source.capabilities);
  const isLongbridge = source.provider_type === "longbridge";
  return (
    <Card
      className={cn(
        "relative overflow-hidden",
        source.is_active && "border-market-down/35 shadow-[inset_3px_0_0_0_var(--market-down),0_10px_35px_rgba(0,0,0,.4)]",
      )}
    >
      <div className="absolute right-5 top-1 font-display text-[4.5rem] leading-none text-foreground/[0.025]">
        {String(ordinal).padStart(2, "0")}
      </div>
      <div className="relative grid grid-cols-[1fr_230px]">
        <div className="p-5">
          <div className="flex items-start gap-4">
            <div className="grid size-11 shrink-0 place-items-center rounded-lg border border-border bg-secondary font-mono text-xs font-bold text-primary/90">
              {isLongbridge ? "LB" : "FY"}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2.5">
                <h3 className="font-display text-[1.25rem] text-foreground">{source.name}</h3>
                {source.is_active && (
                  <Badge variant="success">
                    <Activity size={10} className="mr-1" /> 当前启用
                  </Badge>
                )}
                {isLongbridge && <Badge variant="warning">独立测试源</Badge>}
                <Button variant="outline" size="sm" className="ml-auto h-7 gap-1 px-2 text-[0.75rem]" onClick={onTest} disabled={testing}>
                  {testing ? <LoaderCircle className="animate-spin" size={12} /> : <Activity size={12} />}
                  测试连接
                </Button>
              </div>
              <p className="mt-2 truncate font-mono text-[0.7rem] text-muted-foreground/60">{source.base_url}</p>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-[150px_1fr] gap-4 border-t border-border pt-3.5">
            <div>
              <p className="text-[0.65rem] font-medium tracking-[0.1em] text-muted-foreground/60">
                {isLongbridge ? "鉴权方式" : "API KEY"}
              </p>
              <p className="mt-1.5 flex items-center gap-2 font-mono text-[0.8rem] text-muted-foreground">
                <KeyRound size={12} />
                {isLongbridge
                  ? source.auth_type === "oauth"
                    ? source.credential_mask
                    : `API 凭证 · ${source.credential_mask}`
                  : source.api_key_mask}
              </p>
            </div>
            <div>
              <p className="text-[0.65rem] font-medium tracking-[0.1em] text-muted-foreground/60">能力识别</p>
              {capabilities.length ? (
                <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[0.75rem] text-muted-foreground">
                  {capabilities.slice(0, 5).map(([key, state]) => (
                    <span key={key} className="flex items-center gap-1">
                      {state === "supported" ? (
                        <Check className="text-market-down" size={11} />
                      ) : state === "partial" ? (
                        <Minus className="text-warning" size={11} />
                      ) : (
                        <CircleOff className="text-muted-foreground/60" size={11} />
                      )}
                      {capabilityLabels[key] ?? key}
                    </span>
                  ))}
                  {capabilities.length > 5 && <span className="text-muted-foreground/60">+{capabilities.length - 5}</span>}
                </div>
              ) : (
                <p className="mt-1.5 text-[0.8rem] text-muted-foreground/60">测试连接后识别</p>
              )}
            </div>
          </div>
        </div>

        <div className="border-l border-border bg-secondary/45 p-4">
          <TestStatus source={source} />
          <div className="-mt-1 grid grid-cols-2 gap-2.5">
            {isLongbridge ? (
              <div className="col-span-2 rounded-lg border border-warning/20 bg-warning/8 px-3 py-2 text-[0.75rem] leading-5 text-muted-foreground">
                Longbridge 当前只做连通性与能力测试，不会替换当前业务数据源。
              </div>
            ) : (
              <>
                <Button
                  variant={source.is_active ? "ghost" : "outline"}
                  size="sm"
                  onClick={onActivate}
                  disabled={source.is_active || source.last_test_status !== "success" || activating}
                >
                  {activating ? <LoaderCircle className="animate-spin" size={13} /> : <Power size={13} />}
                  {source.is_active ? "已启用" : "启用"}
                </Button>
                <Button variant="outline" size="sm" onClick={onDeactivate} disabled={!source.is_active || deactivating}>
                  {deactivating ? <LoaderCircle className="animate-spin" size={13} /> : <PowerOff size={13} />}
                  停用
                </Button>
              </>
            )}
            <Button variant="ghost" size="sm" onClick={onEdit}>
              <Pencil size={13} /> 编辑
            </Button>
            <DeleteSourceDialog source={source} deleting={deleting} onConfirm={onDelete} />
          </div>
        </div>
      </div>
    </Card>
  );
}

function TestStatus({ source }: { source: DataSource }) {
  if (!source.last_test_status) {
    return (
      <div className="min-h-[72px]">
        <p className="flex items-center gap-2 text-[0.8rem] font-semibold text-muted-foreground">
          <CircleOff size={14} /> 尚未测试
        </p>
        <p className="mt-2 text-[0.75rem] leading-5 text-muted-foreground/60">
          {source.provider_type === "longbridge" ? "授权后可验证地址、鉴权与代表接口。" : "启用前需要验证地址、鉴权与代表接口。"}
        </p>
      </div>
    );
  }
  const success = source.last_test_status === "success";
  return (
    <div className="min-h-[72px]">
      <p className={cn("flex items-center gap-2 text-[0.8rem] font-semibold", success ? "text-market-down" : "text-danger")}>
        {success ? <ShieldCheck size={14} /> : <AlertTriangle size={14} />}
        {success ? "连接成功" : "最近测试失败"}
        {source.last_test_latency_ms !== null && (
          <span className="font-mono font-normal text-muted-foreground/60">{source.last_test_latency_ms} ms</span>
        )}
      </p>
      {!success && source.last_test_message && (
        <p className="mt-2 line-clamp-2 text-[0.75rem] leading-5 text-muted-foreground/60" title={source.last_test_message}>
          {source.last_test_message}
        </p>
      )}
      <p className="mt-2 font-mono text-[0.7rem] text-muted-foreground/60">{formatDateTime(source.last_test_at)}</p>
    </div>
  );
}

function DeleteSourceDialog({ source, deleting, onConfirm }: { source: DataSource; deleting: boolean; onConfirm: () => void }) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="sm" className="text-danger hover:bg-danger/10 hover:text-danger">
          <Trash2 size={13} /> 删除
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>永久删除“{source.name}”？</AlertDialogTitle>
          <AlertDialogDescription>
            该操作不可撤销，将删除这条配置及其加密密钥。
            {source.is_active && " 这是当前启用的数据源，删除后所有外部数据页面会进入未配置状态。"}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>取消</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} disabled={deleting}>
            {deleting && <LoaderCircle className="animate-spin" size={14} />} 确认永久删除
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function NoticeBar({ notice, onClose }: { notice: NonNullable<Notice>; onClose: () => void }) {
  const Icon = notice.tone === "success" ? Check : notice.tone === "warning" ? AlertTriangle : X;
  return (
    <div
      className={cn(
        "mb-5 flex items-center gap-3 rounded-lg border-l-4 px-4 py-3 text-[0.9rem]",
        notice.tone === "success" && "border-market-down bg-market-down/6 text-market-down",
        notice.tone === "warning" && "border-primary bg-primary/10 text-primary/90",
        notice.tone === "error" && "border-market-up bg-market-up/6 text-danger",
      )}
    >
      <Icon size={16} />
      <span className="flex-1">{notice.message}</span>
      <button
        type="button"
        onClick={onClose}
        className="grid size-7 place-items-center rounded-md hover:bg-secondary/60"
        aria-label="关闭提示"
      >
        <X size={13} />
      </button>
    </div>
  );
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback;
}

function getOAuthNotice(searchParams: URLSearchParams): Notice {
  const oauthStatus = searchParams.get("oauth");
  if (oauthStatus === "success") {
    return { tone: "success", message: "Longbridge OAuth 授权成功，请测试连接以识别接口能力" };
  }
  if (oauthStatus === "failed") {
    return { tone: "error", message: searchParams.get("message") ?? "Longbridge OAuth 授权失败，请重试" };
  }
  return null;
}
