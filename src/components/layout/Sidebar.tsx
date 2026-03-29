import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import Icon from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";

const allMenuItems = [
  { icon: "LayoutDashboard", label: "Дашборд", path: "/office", roles: ["admin", "manager"] },
  { icon: "Users", label: "Пайщики", path: "/office/members", roles: ["admin", "manager"] },
  { icon: "Landmark", label: "Займы", path: "/office/loans", roles: ["admin", "manager"] },
  { icon: "PiggyBank", label: "Сбережения", path: "/office/savings", roles: ["admin", "manager"] },
  { icon: "Wallet", label: "Паевые счета", path: "/office/shares", roles: ["admin", "manager"] },
  { icon: "BarChart3", label: "Отчётность", path: "/office/reports", roles: ["admin", "manager"] },
  { icon: "MessageCircle", label: "Чаты", path: "/office/chats", roles: ["admin", "manager"] },
  { icon: "Building2", label: "Банк", path: "/office/bank", roles: ["admin", "manager"] },
  { icon: "Settings", label: "Администрирование", path: "/office/admin", roles: ["admin"] },
];

const roleLabels: Record<string, string> = { admin: "Администратор", manager: "Менеджер" };

const Sidebar = ({ chatUnread = 0 }: { chatUnread?: number }) => {
  const [collapsed, setCollapsed] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();

  const menuItems = allMenuItems.filter((item) => user && item.roles.includes(user.role));

  const handleLogout = async () => {
    await logout();
    navigate("/office/login");
  };

  return (
    <aside
      className={cn(
        "h-screen sticky top-0 bg-sidebar text-sidebar-foreground flex flex-col transition-all duration-300 border-r border-sidebar-border",
        collapsed ? "w-[72px]" : "w-[260px]"
      )}
    >
      <div className="flex items-center gap-3 px-4 h-16 border-b border-sidebar-border">
        <div className="w-9 h-9 rounded-xl bg-sidebar-primary flex items-center justify-center flex-shrink-0">
          <Icon name="Shield" size={20} className="text-sidebar-primary-foreground" />
        </div>
        {!collapsed && (
          <div className="animate-fade-in">
            <div className="text-sm font-semibold tracking-tight">КПК Система</div>
            <div className="text-[11px] text-sidebar-foreground/50">Управление кооперативом</div>
          </div>
        )}
      </div>

      <nav className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto scrollbar-thin">
        {menuItems.map((item) => {
          const isActive = location.pathname === item.path ||
            (item.path !== "/office" && location.pathname.startsWith(item.path));
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200",
                isActive
                  ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
                  : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent"
              )}
            >
              <div className="relative flex-shrink-0">
                <Icon name={item.icon} size={20} />
                {item.path === "/office/chats" && chatUnread > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center px-1">
                    {chatUnread > 9 ? "9+" : chatUnread}
                  </span>
                )}
              </div>
              {!collapsed && (
                <span className="flex-1 flex items-center justify-between">
                  {item.label}
                  {item.path === "/office/chats" && chatUnread > 0 && (
                    <span className="min-w-[20px] h-5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center px-1.5">
                      {chatUnread > 9 ? "9+" : chatUnread}
                    </span>
                  )}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="p-2 border-t border-sidebar-border space-y-1">
        {user && !collapsed && (
          <div className="px-3 py-2 text-xs">
            <div className="font-medium text-sidebar-foreground/90 truncate">{user.name}</div>
            <div className="text-sidebar-foreground/50">{roleLabels[user.role] || user.role}</div>
          </div>
        )}
        <button
          onClick={() => navigate("/")}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent text-sm transition-all"
        >
          <Icon name="ExternalLink" size={18} className="flex-shrink-0" />
          {!collapsed && <span>Личный кабинет</span>}
        </button>
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sidebar-foreground/50 hover:text-red-400 hover:bg-sidebar-accent text-sm transition-all"
        >
          <Icon name="LogOut" size={18} className="flex-shrink-0" />
          {!collapsed && <span>Выйти</span>}
        </button>
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent text-sm transition-all"
        >
          <Icon name={collapsed ? "ChevronsRight" : "ChevronsLeft"} size={18} />
          {!collapsed && <span>Свернуть</span>}
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;