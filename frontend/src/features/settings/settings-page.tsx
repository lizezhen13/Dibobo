import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { AccountSettings } from "./account-settings";
import { DataSourceSettings } from "./data-source-settings";

export function SettingsPage() {
  return (
    <section className="mx-auto max-w-[1100px] animate-fade-in-up">
      <div className="mb-8">
        <p className="eyebrow">设置 / SETTINGS</p>
        <h1 className="mt-2 font-display text-4xl tracking-tight text-foreground">
          系统设置
        </h1>
        <p className="mt-2 max-w-2xl text-[0.95rem] leading-relaxed text-muted-foreground">
          管理账号信息、密码以及行情数据源配置。
        </p>
      </div>

      <Tabs defaultValue="account" className="w-full">
        <TabsList className="mb-8">
          <TabsTrigger value="account">账号设置</TabsTrigger>
          <TabsTrigger value="data">数据源</TabsTrigger>
        </TabsList>

        <TabsContent value="account" className="space-y-6">
          <AccountSettings />
        </TabsContent>

        <TabsContent value="data" className="space-y-6">
          <DataSourceSettings />
        </TabsContent>
      </Tabs>
    </section>
  );
}
