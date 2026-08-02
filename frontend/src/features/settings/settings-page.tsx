import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { AccountSettings } from "./account-settings";
import { DataSourceSettings } from "./data-source-settings";

export function SettingsPage() {
  return (
    <section className="mx-auto max-w-[1100px] animate-fade-in-up">
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
