import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { PageContainer, PageHeader } from "../../components/patterns";
import { AccountSettings } from "./account-settings";
import { DataSourceSettings } from "./data-source-settings";

export function SettingsPage() {
  return (
    <PageContainer size="compact">
      <PageHeader title="系统设置" density="compact" description="管理账号信息和行情数据源。" />
      <Tabs defaultValue="account" className="w-full">
        <TabsList className="mb-6">
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
    </PageContainer>
  );
}
