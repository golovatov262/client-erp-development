import { useEffect } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import Sidebar from "./Sidebar";
import Header from "./Header";
import useChatNotifications from "@/hooks/use-chat-notifications";

const AppLayout = () => {
  const { totalUnread, lastEvent, clearEvent } = useChatNotifications();
  const navigate = useNavigate();

  useEffect(() => {
    if (!lastEvent) return;
    toast(`💬 ${lastEvent.memberName}`, {
      description: lastEvent.preview,
      action: {
        label: "Открыть",
        onClick: () => navigate("/office/chats"),
      },
      duration: 8000,
    });
    clearEvent();
  }, [lastEvent, clearEvent, navigate]);

  return (
    <div className="flex min-h-screen">
      <Sidebar chatUnread={totalUnread} />
      <div className="flex-1 flex flex-col min-w-0">
        <Header chatUnread={totalUnread} />
        <main className="flex-1 p-6 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default AppLayout;
