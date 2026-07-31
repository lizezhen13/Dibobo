import {
  Activity,
  AlertTriangle,
  Check,
  CircleOff,
  DatabaseZap,
  KeyRound,
  LoaderCircle,
  Pencil,
  Plus,
  Power,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import { useState } from "react";

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
import { DataSourceDialog } from "./data-source-dialog";
import {
  useActivateDataSourceMutation,
  useDataSourcesQuery,
  useDeleteDataSourceMutation,
  useTestDataSourceMutation,
} from "./queries";
import type { ConnectionTestResult, DataSource } from "./types";

type Notice = { tone: "success" | "error" | "warning"; message: string } | null;

const providerLabels = {
  fuyao: "扶摇",
  fuyao_compatible: "扶摇兼容",
} as const;

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
};

export function DataSourceSettings() {
  const query = useDataSourcesQuery();
  const testMutation = useTestDataSourceMutation();
  const activateMutation = useActivateDataSourceMutation();
  const deleteMutation = useDeleteDataSourceMutation();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingSource, setEditingSource] = useState<DataSource | null>(null);
  const [notice, setNotice] = useState<Notice>(null);

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
          result.status === "success"
            ? `${source.name} 连接成功，耗时 ${result.latency_ms} ms`
            : `${source.name}：${result.message}`,
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
      <div className="mb-6 flex items-end justify-between gap-8">
        <div>
          <p className="font-mono text-[10px] tracking-[.16em] text-accent-deep">DATA SOURCES / 数据源设置</p>
          <h2 className="mt-2 font-display text-[28px] tracking-[-.02em]">连接你的金融数据</h2>
          <p className="mt-2 text-sm leading-6 text-ink-muted">每个用户可保存多条独立配置，但同一时间只有一条作为行情与雷达数据源。</p>
        </div>
        <Button onClick={openCreate}>
          <Plus size={15} /> 新增数据源
        </Button>
      </div>

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
            <AlertTriangle className="mx-auto text-market-up" size={24} />
            <p className="mt-4 font-display text-xl">数据源配置加载失败</p>
            <Button className="mt-5" variant="outline" onClick={() => void query.refetch()}>
              重新加载
            </Button>
          </div>
        </Card>
      ) : query.data.length === 0 ? (
        <Card className="paper-grid grid min-h-[430px] place-items-center text-center">
          <div className="max-w-md">
            <div className="mx-auto grid size-14 place-items-center rounded-full border border-accent/25 bg-accent/8 text-accent-deep">
              <DatabaseZap size={22} />
            </div>
            <h3 className="mt-5 font-display text-2xl">还没有数据源</h3>
            <p className="mt-3 text-sm leading-7 text-ink-muted">添加扶摇或兼容配置，测试通过并启用后，总览与持仓页面即可请求真实行情。</p>
            <Button className="mt-6" onClick={openCreate}>
              <Plus size={15} /> 添加第一条配置
            </Button>
          </div>
        </Card>
      ) : (
        <div className="space-y-4">
          {query.data.map((source, index) => (
            <DataSourceCard
              key={source.id}
              source={source}
              ordinal={index + 1}
              testing={testMutation.isPending && testMutation.variables === source.id}
              activating={activateMutation.isPending && activateMutation.variables === source.id}
              deleting={deleteMutation.isPending && deleteMutation.variables === source.id}
              onTest={() => void runTest(source)}
              onActivate={() => void activate(source)}
              onEdit={() => openEdit(source)}
              onDelete={() => void remove(source)}
            />
          ))}
        </div>
      )}

      <DataSourceDialog open={dialogOpen} onOpenChange={setDialogOpen} source={editingSource} />
    </div>
  );
}

function DataSourceCard({
  source,
  ordinal,
  testing,
  activating,
  deleting,
  onTest,
  onActivate,
  onEdit,
  onDelete,
}: {
  source: DataSource;
  ordinal: number;
  testing: boolean;
  activating: boolean;
  deleting: boolean;
  onTest: () => void;
  onActivate: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const capabilities = Object.entries(source.capabilities);
  return (
    <Card className={cn("relative overflow-hidden", source.is_active && "border-market-down/35 shadow-[inset_3px_0_0_#16805c,0_10px_35px_rgba(31,43,37,.055)]")}>
      <div className="absolute right-5 top-1 font-display text-[70px] leading-none text-ink/[.025]">{String(ordinal).padStart(2, "0")}</div>
      <div className="relative grid grid-cols-[1fr_250px]">
        <div className="p-6">
          <div className="flex items-start gap-4">
            <div className="grid size-11 shrink-0 place-items-center rounded-[3px] border border-line bg-paper-deep font-mono text-xs font-bold text-accent-deep">FY</div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2.5">
                <h3 className="font-display text-[21px] text-ink">{source.name}</h3>
                {source.is_active && <Badge variant="success"><Activity size={9} /> 当前启用</Badge>}
                <Badge>{providerLabels[source.provider_type]}</Badge>
              </div>
              <p className="mt-2 truncate font-mono text-[11px] text-ink-faint">{source.base_url}</p>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-[180px_1fr] gap-4 border-t border-line pt-4">
            <div>
              <p className="text-[10px] tracking-[.1em] text-ink-faint">API KEY</p>
              <p className="mt-1.5 flex items-center gap-2 font-mono text-xs text-ink-muted"><KeyRound size={12} /> {source.api_key_mask}</p>
            </div>
            <div>
              <p className="text-[10px] tracking-[.1em] text-ink-faint">能力识别</p>
              {capabilities.length ? (
                <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-ink-muted">
                  {capabilities.slice(0, 5).map(([key, state]) => (
                    <span key={key} className="flex items-center gap-1">
                      {state === "supported" ? <Check className="text-market-down" size={11} /> : <CircleOff className="text-ink-faint" size={11} />}
                      {capabilityLabels[key] ?? key}
                    </span>
                  ))}
                  {capabilities.length > 5 && <span className="text-ink-faint">+{capabilities.length - 5}</span>}
                </div>
              ) : (
                <p className="mt-1.5 text-xs text-ink-faint">测试连接后识别</p>
              )}
            </div>
          </div>
        </div>

        <div className="border-l border-line bg-paper-deep/45 p-5">
          <TestStatus source={source} />
          <div className="mt-5 grid grid-cols-2 gap-2">
            <Button variant="outline" size="sm" onClick={onTest} disabled={testing}>
              {testing ? <LoaderCircle className="animate-spin" size={13} /> : <Activity size={13} />} 测试连接
            </Button>
            <Button
              variant={source.is_active ? "ghost" : "outline"}
              size="sm"
              onClick={onActivate}
              disabled={source.is_active || source.last_test_status !== "success" || activating}
            >
              {activating ? <LoaderCircle className="animate-spin" size={13} /> : <Power size={13} />}
              {source.is_active ? "已启用" : "启用"}
            </Button>
            <Button variant="ghost" size="sm" onClick={onEdit}><Pencil size={13} /> 编辑</Button>
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
      <div className="min-h-[66px]">
        <p className="flex items-center gap-2 text-xs font-semibold text-ink-muted"><CircleOff size={13} /> 尚未测试</p>
        <p className="mt-2 text-[11px] leading-5 text-ink-faint">启用前需要验证地址、鉴权与代表接口。</p>
      </div>
    );
  }
  const success = source.last_test_status === "success";
  return (
    <div className="min-h-[66px]">
      <p className={cn("flex items-center gap-2 text-xs font-semibold", success ? "text-market-down" : "text-market-up")}>
        {success ? <ShieldCheck size={13} /> : <AlertTriangle size={13} />}
        {success ? "最近测试成功" : "最近测试失败"}
        {source.last_test_latency_ms !== null && <span className="font-mono font-normal text-ink-faint">{source.last_test_latency_ms} ms</span>}
      </p>
      <p className="mt-2 line-clamp-2 text-[11px] leading-5 text-ink-faint" title={source.last_test_message ?? undefined}>{source.last_test_message}</p>
      <p className="mt-1 font-mono text-[9px] text-ink-faint">{formatDateTime(source.last_test_at)}</p>
    </div>
  );
}

function DeleteSourceDialog({ source, deleting, onConfirm }: { source: DataSource; deleting: boolean; onConfirm: () => void }) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="sm" className="text-market-up hover:bg-market-up/6 hover:text-market-up"><Trash2 size={13} /> 删除</Button>
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
    <div className={cn(
      "mb-5 flex items-center gap-3 border-l-[3px] px-4 py-3 text-sm",
      notice.tone === "success" && "border-market-down bg-market-down/6 text-market-down",
      notice.tone === "warning" && "border-accent bg-accent/7 text-accent-deep",
      notice.tone === "error" && "border-market-up bg-market-up/6 text-market-up",
    )}>
      <Icon size={15} />
      <span className="flex-1">{notice.message}</span>
      <button type="button" onClick={onClose} className="grid size-7 place-items-center rounded hover:bg-ink/5" aria-label="关闭提示"><X size={13} /></button>
    </div>
  );
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback;
}

