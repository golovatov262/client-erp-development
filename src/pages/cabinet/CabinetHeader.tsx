import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import Icon from "@/components/ui/icon";
import usePush from "@/hooks/use-push";
import { PushClientMessage } from "@/lib/api";

interface CabinetHeaderProps {
  userName: string;
  memberNo: string;
  unreadCount: number;
  onOpenMessages: () => void;
  onOpenMenu: () => void;
  showMenu: boolean;
  onCloseMenu: (open: boolean) => void;
  push: ReturnType<typeof usePush>;
  onPushToggle: () => void;
  tgLinked: boolean | null;
  tgUsername: string;
  tgLinking: boolean;
  onTelegramLink: () => void;
  onTelegramUnlink: () => void;
  onOpenPassword: () => void;
  onLogout: () => void;
  showPassword: boolean;
  onClosePassword: (open: boolean) => void;
  pwForm: { old: string; new_pw: string; confirm: string };
  onPwFormChange: (updater: (p: { old: string; new_pw: string; confirm: string }) => { old: string; new_pw: string; confirm: string }) => void;
  savingPw: boolean;
  onChangePassword: () => void;
  showMessages: boolean;
  onCloseMessages: (open: boolean) => void;
  messagesLoading: boolean;
  messages: PushClientMessage[];
}

const CabinetHeader = ({
  userName,
  memberNo,
  unreadCount,
  onOpenMessages,
  onOpenMenu,
  showMenu,
  onCloseMenu,
  push,
  onPushToggle,
  tgLinked,
  tgUsername,
  tgLinking,
  onTelegramLink,
  onTelegramUnlink,
  onOpenPassword,
  onLogout,
  showPassword,
  onClosePassword,
  pwForm,
  onPwFormChange,
  savingPw,
  onChangePassword,
  showMessages,
  onCloseMessages,
  messagesLoading,
  messages,
}: CabinetHeaderProps) => (
  <>
    <header className="bg-white border-b shadow-sm sticky top-0 z-10">
      <div className="max-w-5xl mx-auto px-3 sm:px-4 py-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center shrink-0">
            <Icon name="Shield" size={20} className="text-white" />
          </div>
          <div className="min-w-0">
            <div className="font-semibold text-sm truncate">{userName}</div>
            <div className="text-xs text-muted-foreground">{memberNo}</div>
          </div>
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          <Button variant="ghost" size="icon" className="h-9 w-9 relative" onClick={onOpenMessages}>
            <Icon name="Bell" size={18} />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center px-1">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </Button>
          <Button variant="ghost" size="icon" className="h-9 w-9" onClick={onOpenMenu}>
            <Icon name="Settings" size={18} />
          </Button>
        </div>
      </div>
    </header>

    <Dialog open={showMessages} onOpenChange={onCloseMessages}>
      <DialogContent className="max-w-md w-[calc(100vw-1rem)] sm:w-auto max-h-[85vh] flex flex-col p-0">
        <DialogHeader className="p-4 pb-2 border-b shrink-0">
          <DialogTitle className="text-base flex items-center gap-2">
            <Icon name="Bell" size={18} />
            Уведомления
          </DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto p-4">
          {messagesLoading ? (
            <div className="flex justify-center py-8"><Icon name="Loader2" size={24} className="animate-spin text-muted-foreground" /></div>
          ) : messages.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">Уведомлений пока нет</div>
          ) : (
            <div className="space-y-3">
              {messages.map((m, i) => {
                const prev = messages[i - 1];
                const curDate = m.sent_at ? m.sent_at.split("T")[0] : "";
                const prevDate = prev?.sent_at ? prev.sent_at.split("T")[0] : "";
                const showDate = curDate !== prevDate;
                const dateLabel = curDate ? new Date(curDate).toLocaleDateString("ru-RU", { day: "numeric", month: "long" }) : "";
                return (
                  <div key={`${m.id}-${i}`}>
                    {showDate && (
                      <div className="flex items-center gap-2 my-3">
                        <div className="flex-1 h-px bg-border" />
                        <span className="text-[11px] text-muted-foreground shrink-0">{dateLabel}</span>
                        <div className="flex-1 h-px bg-border" />
                      </div>
                    )}
                    <div className="bg-primary/5 border border-primary/10 rounded-xl px-3.5 py-2.5 max-w-[90%]">
                      <div className="font-medium text-sm">{m.title}</div>
                      <div className="text-sm text-muted-foreground mt-0.5 whitespace-pre-wrap">{m.body}</div>
                      <div className="text-[10px] text-muted-foreground/60 mt-1.5 text-right">
                        {m.sent_at ? new Date(m.sent_at).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }) : ""}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>

    <Dialog open={showMenu} onOpenChange={onCloseMenu}>
      <DialogContent className="max-w-sm w-[calc(100vw-1rem)] sm:w-auto p-0">
        <DialogHeader className="p-4 pb-0"><DialogTitle className="text-base">Настройки</DialogTitle></DialogHeader>
        <div className="p-2">
          {push.supported && (
            <button className="w-full flex items-center gap-3 px-3 py-3 rounded-lg hover:bg-muted/50 transition-colors text-left" onClick={onPushToggle} disabled={push.loading}>
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${push.subscribed ? "bg-green-50" : "bg-orange-50"}`}>
                <Icon name={push.subscribed ? "Bell" : "BellOff"} size={18} className={push.subscribed ? "text-green-500" : "text-orange-500"} />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-medium">Push-уведомления</div>
                <div className="text-xs text-muted-foreground">{push.subscribed ? "Включены — нажмите, чтобы отключить" : "Отключены — нажмите, чтобы включить"}</div>
              </div>
            </button>
          )}
          {tgLinked !== null && (
            <button className="w-full flex items-center gap-3 px-3 py-3 rounded-lg hover:bg-muted/50 transition-colors text-left" onClick={tgLinked ? onTelegramUnlink : onTelegramLink} disabled={tgLinking}>
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${tgLinked ? "bg-sky-50" : "bg-slate-100"}`}>
                <Icon name="Send" size={18} className={tgLinked ? "text-sky-500" : "text-slate-400"} />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-medium">Telegram</div>
                <div className="text-xs text-muted-foreground">
                  {tgLinking ? "Подождите..." : tgLinked ? `Привязан${tgUsername ? ` (@${tgUsername})` : ""} — нажмите, чтобы отвязать` : "Привязать для получения уведомлений"}
                </div>
              </div>
            </button>
          )}
          <button className="w-full flex items-center gap-3 px-3 py-3 rounded-lg hover:bg-muted/50 transition-colors text-left" onClick={onOpenPassword}>
            <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
              <Icon name="Lock" size={18} className="text-blue-500" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-medium">Сменить пароль</div>
              <div className="text-xs text-muted-foreground">Изменить пароль для входа</div>
            </div>
          </button>
          <button className="w-full flex items-center gap-3 px-3 py-3 rounded-lg hover:bg-muted/50 transition-colors text-left" onClick={onLogout}>
            <div className="w-9 h-9 rounded-lg bg-red-50 flex items-center justify-center shrink-0">
              <Icon name="LogOut" size={18} className="text-red-500" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-medium text-red-600">Выйти</div>
              <div className="text-xs text-muted-foreground">Выход из личного кабинета</div>
            </div>
          </button>
        </div>
      </DialogContent>
    </Dialog>

    <Dialog open={showPassword} onOpenChange={onClosePassword}>
      <DialogContent className="max-w-md w-[calc(100vw-1rem)] sm:w-auto">
        <DialogHeader><DialogTitle>Смена пароля</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Текущий пароль</Label>
            <Input type="password" value={pwForm.old} onChange={e => onPwFormChange(p => ({ ...p, old: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Новый пароль</Label>
            <Input type="password" value={pwForm.new_pw} onChange={e => onPwFormChange(p => ({ ...p, new_pw: e.target.value }))} placeholder="Минимум 6 символов" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Подтвердите новый пароль</Label>
            <Input type="password" value={pwForm.confirm} onChange={e => onPwFormChange(p => ({ ...p, confirm: e.target.value }))} onKeyDown={e => e.key === "Enter" && onChangePassword()} />
          </div>
          <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onClosePassword(false)} className="w-full sm:w-auto">Отмена</Button>
            <Button onClick={onChangePassword} disabled={savingPw || pwForm.new_pw.length < 6} className="gap-2 w-full sm:w-auto">
              {savingPw ? <Icon name="Loader2" size={16} className="animate-spin" /> : <Icon name="Lock" size={16} />}
              Сохранить
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  </>
);

export default CabinetHeader;