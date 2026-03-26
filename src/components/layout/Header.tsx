import { useNavigate } from "react-router-dom";
import Icon from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";

const roleLabels: Record<string, string> = { admin: "Администратор", manager: "Менеджер" };

const Header = ({ chatUnread = 0 }: { chatUnread?: number }) => {
  const { user } = useAuth();
  const navigate = useNavigate();

  return (
    <header className="h-16 border-b bg-card flex items-center justify-between px-6 sticky top-0 z-10">
      <div className="flex items-center gap-4 flex-1">
        <div className="relative max-w-md w-full">
          <Icon name="Search" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Поиск пайщиков, договоров..."
            className="pl-9 bg-muted/50 border-0 focus-visible:ring-1"
          />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="relative h-9 w-9"
          onClick={() => navigate("/office/chats")}
          title="Чаты"
        >
          <Icon name="MessageCircle" size={18} />
          {chatUnread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center px-1 animate-pulse">
              {chatUnread > 9 ? "9+" : chatUnread}
            </span>
          )}
        </Button>
        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
          <Icon name="User" size={16} className="text-primary" />
        </div>
        <div className="text-sm">
          <div className="font-medium">{user?.name || "—"}</div>
          <div className="text-xs text-muted-foreground">{roleLabels[user?.role || ""] || user?.role}</div>
        </div>
      </div>
    </header>
  );
};

export default Header;
