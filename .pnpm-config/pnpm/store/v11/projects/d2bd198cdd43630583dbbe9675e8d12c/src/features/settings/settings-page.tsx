import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { PageContainer } from "../../components/patterns";
import { AccountSettings } from "./account-settings";
import { DataSourceSettings } from "./data-source-settings";

export function SettingsPage() {
  return (
    <PageContainer size="compact">
      <h1 className="sr-only">系统设置</h1>
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
