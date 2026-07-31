import { Database, Shield, UserRound } from "lucide-react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { AccountSettings } from "./account-settings";
import { DataSourceSettings } from "./data-source-settings";

export function SettingsPage() {
  return (
    <div className="mx-auto w-full max-w-[1500px] animate-enter">
      <div className="mb-8">
        <p className="font-mono text-[10px] tracking-[.18em] text-accent-deep">SYSTEM CONTROL / 系统控制</p>
        <h1 className="mt-2 font-display text-[34px] tracking-[-.025em]">系统设置</h1>
        <p className="mt-2.5 text-sm text-ink-muted">管理自己的登录凭证和金融数据连接；所有配置均按用户隔离。</p>
      </div>

      <Tabs defaultValue="account" orientation="vertical" className="grid grid-cols-[220px_minmax(0,1fr)] gap-8">
        <aside>
          <TabsList className="sticky top-[104px] flex-col gap-1 border-l border-line pl-3">
            <TabsTrigger
              value="account"
              className="group flex w-full items-center gap-3 rounded-[3px] px-4 py-3 text-left text-sm text-ink-muted transition hover:bg-paper hover:text-ink data-[state=active]:bg-ink data-[state=active]:text-paper"
            >
              <UserRound size={16} />
              <span className="flex-1">账号设置</span>
              <span className="font-mono text-[9px] opacity-35">01</span>
            </TabsTrigger>
            <TabsTrigger
              value="data-sources"
              className="group flex w-full items-center gap-3 rounded-[3px] px-4 py-3 text-left text-sm text-ink-muted transition hover:bg-paper hover:text-ink data-[state=active]:bg-ink data-[state=active]:text-paper"
            >
              <Database size={16} />
              <span className="flex-1">数据源设置</span>
              <span className="font-mono text-[9px] opacity-35">02</span>
            </TabsTrigger>
          </TabsList>
          <div className="mt-5 flex gap-2.5 pl-4 text-[10px] leading-5 text-ink-faint">
            <Shield className="mt-0.5 shrink-0" size={13} />
            密钥与密码不会以明文返回或记录。
          </div>
        </aside>

        <TabsContent value="account"><AccountSettings /></TabsContent>
        <TabsContent value="data-sources"><DataSourceSettings /></TabsContent>
      </Tabs>
    </div>
  );
}
