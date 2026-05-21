import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import Icon from "@/components/ui/icon";
import AdminPushMessages from "./AdminPushMessages";
import AdminTelegramTab from "./AdminTelegramTab";
import AdminMaxTab from "./AdminMaxTab";
import AdminSmsTab from "./AdminSmsTab";
import AdminEmailTab from "./AdminEmailTab";

const AdminNotifications = () => {
  const [channel, setChannel] = useState("push");

  return (
    <div className="space-y-4">
      <Tabs value={channel} onValueChange={setChannel}>
        <TabsList>
          <TabsTrigger value="push" className="flex items-center gap-1.5">
            <Icon name="Bell" size={15} />
            Push
          </TabsTrigger>
          <TabsTrigger value="telegram" className="flex items-center gap-1.5">
            <Icon name="Send" size={15} />
            Telegram
          </TabsTrigger>
          <TabsTrigger value="max" className="flex items-center gap-1.5">
            <Icon name="MessageCircle" size={15} />
            MAX
          </TabsTrigger>
          <TabsTrigger value="sms" className="flex items-center gap-1.5">
            <Icon name="MessageSquare" size={15} />
            SMS
          </TabsTrigger>
          <TabsTrigger value="email" className="flex items-center gap-1.5">
            <Icon name="Mail" size={15} />
            Email
          </TabsTrigger>
        </TabsList>

        <TabsContent value="push" className="mt-4">
          <AdminPushMessages />
        </TabsContent>

        <TabsContent value="telegram" className="mt-4">
          <AdminTelegramTab />
        </TabsContent>

        <TabsContent value="max" className="mt-4">
          <AdminMaxTab />
        </TabsContent>

        <TabsContent value="sms" className="mt-4">
          <AdminSmsTab />
        </TabsContent>

        <TabsContent value="email" className="mt-4">
          <AdminEmailTab />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AdminNotifications;