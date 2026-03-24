import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import Icon from "@/components/ui/icon";
import { useToast } from "@/hooks/use-toast";
import api, { CabinetOverview, LoanDetail, CabinetSavingDetail, Loan, Saving, PushClientMessage } from "@/lib/api";
import usePush from "@/hooks/use-push";
import CabinetHeader from "./CabinetHeader";
import CabinetDashboard from "./CabinetDashboard";

import LoanDetailView from "./LoanDetailView";
import SavingDetailView from "./SavingDetailView";

const Cabinet = () => {
  const [data, setData] = useState<CabinetOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState("");
  const [loanDetail, setLoanDetail] = useState<LoanDetail | null>(null);
  const [savingDetail, setSavingDetail] = useState<CabinetSavingDetail | null>(null);
  const [showLoan, setShowLoan] = useState(false);
  const [showSaving, setShowSaving] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showMessages, setShowMessages] = useState(false);
  const [messages, setMessages] = useState<PushClientMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [pwForm, setPwForm] = useState({ old: "", new_pw: "", confirm: "" });
  const [savingPw, setSavingPw] = useState(false);
  const [tgLinked, setTgLinked] = useState<boolean | null>(null);
  const [tgUsername, setTgUsername] = useState("");
  const [tgLinking, setTgLinking] = useState(false);
  const [maxLinked, setMaxLinked] = useState<boolean | null>(null);
  const [maxUsername, setMaxUsername] = useState("");
  const [maxLinking, setMaxLinking] = useState(false);

  const { toast } = useToast();
  const navigate = useNavigate();

  const token = localStorage.getItem("cabinet_token") || "";
  const push = usePush(token);

  useEffect(() => {
    if (!token) { navigate("/"); return; }
    const user = localStorage.getItem("cabinet_user");
    if (user) { try { setUserName(JSON.parse(user).name); } catch { /* skip */ } }
    api.cabinet.overview(token).then(setData).catch(() => {
      localStorage.removeItem("cabinet_token");
      localStorage.removeItem("cabinet_user");
      navigate("/");
    }).finally(() => setLoading(false));
  }, [token, navigate]);

  useEffect(() => {
    if (!token) return;
    api.push.myMessages(token).then(msgs => {
      const lastSeen = localStorage.getItem("push_last_seen") || "0";
      const count = msgs.filter(m => m.sent_at && m.sent_at > lastSeen).length;
      setUnreadCount(count);
      setMessages(msgs);
    }).catch(() => {});
    api.cabinet.telegramStatus(token).then(res => {
      setTgLinked(res.linked);
      if (res.username) setTgUsername(res.username);
    }).catch(() => {});
    api.cabinet.maxStatus(token).then(res => {
      setMaxLinked(res.linked);
      if (res.username) setMaxUsername(res.username);
    }).catch(() => setMaxLinked(null));
  }, [token]);

  const handleTelegramLink = async () => {
    setTgLinking(true);
    try {
      const res = await api.cabinet.telegramLink(token);
      window.open(res.link_url, "_blank");
      toast({ title: "Откройте Telegram", description: "Нажмите «Start» в боте для завершения привязки" });
      setTimeout(() => {
        api.cabinet.telegramStatus(token).then(r => {
          setTgLinked(r.linked);
          if (r.username) setTgUsername(r.username);
        }).catch(() => {});
      }, 5000);
    } catch (e) {
      toast({ title: "Ошибка", description: String(e), variant: "destructive" });
    } finally {
      setTgLinking(false);
    }
  };

  const handleTelegramUnlink = async () => {
    try {
      await api.cabinet.telegramUnlink(token);
      setTgLinked(false);
      setTgUsername("");
      toast({ title: "Telegram отвязан" });
    } catch (e) {
      toast({ title: "Ошибка", description: String(e), variant: "destructive" });
    }
  };

  const handleMaxLink = async () => {
    setMaxLinking(true);
    try {
      const res = await api.cabinet.maxLink(token);
      window.open(res.link_url, "_blank");
      toast({ title: "Откройте MAX", description: "Нажмите «Начать» в боте для завершения привязки" });
      setTimeout(() => {
        api.cabinet.maxStatus(token).then(r => {
          setMaxLinked(r.linked);
          if (r.username) setMaxUsername(r.username);
        }).catch(() => {});
      }, 5000);
    } catch (e) {
      toast({ title: "Ошибка", description: String(e), variant: "destructive" });
    } finally {
      setMaxLinking(false);
    }
  };

  const handleMaxUnlink = async () => {
    try {
      await api.cabinet.maxUnlink(token);
      setMaxLinked(false);
      setMaxUsername("");
      toast({ title: "MAX отвязан" });
    } catch (e) {
      toast({ title: "Ошибка", description: String(e), variant: "destructive" });
    }
  };

  const handleLogout = async () => {
    await api.auth.logout(token);
    localStorage.removeItem("cabinet_token");
    localStorage.removeItem("cabinet_user");
    navigate("/");
  };

  const openMessages = async () => {
    setShowMessages(true);
    setMessagesLoading(true);
    try {
      const msgs = await api.push.myMessages(token);
      setMessages(msgs);
      if (msgs.length > 0 && msgs[0].sent_at) {
        localStorage.setItem("push_last_seen", msgs[0].sent_at);
      }
      setUnreadCount(0);
    } catch (e) { void e; }
    setMessagesLoading(false);
  };

  const openLoan = async (loan: Loan) => {
    const d = await api.cabinet.loanDetail(token, loan.id);
    setLoanDetail(d);
    setShowLoan(true);
  };

  const openSaving = async (s: Saving) => {
    const d = await api.cabinet.savingDetail(token, s.id);
    setSavingDetail(d);
    setShowSaving(true);
  };

  const handleChangePassword = async () => {
    if (pwForm.new_pw.length < 6) {
      toast({ title: "Пароль должен быть не менее 6 символов", variant: "destructive" });
      return;
    }
    if (pwForm.new_pw !== pwForm.confirm) {
      toast({ title: "Пароли не совпадают", variant: "destructive" });
      return;
    }
    setSavingPw(true);
    try {
      const res = await api.auth.changePassword(token, pwForm.old, pwForm.new_pw);
      if (res.success) {
        toast({ title: "Пароль изменён" });
        setShowPassword(false);
        setPwForm({ old: "", new_pw: "", confirm: "" });
      }
    } catch (e) {
      toast({ title: "Ошибка", description: String(e), variant: "destructive" });
    } finally {
      setSavingPw(false);
    }
  };

  const handlePushToggle = async () => {
    if (push.subscribed) {
      await push.unsubscribe();
      toast({ title: "Уведомления отключены" });
    } else {
      const ok = await push.subscribe();
      toast({ title: ok ? "Уведомления включены" : "Не удалось подключить", description: ok ? undefined : push.errorHint, variant: ok ? "default" : "destructive" });
    }
  };



  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-slate-100">
      <Icon name="Loader2" size={40} className="animate-spin text-primary" />
    </div>
  );

  if (!data) return null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-slate-100">
      <CabinetHeader
        userName={userName}
        memberNo={data.info.member_no}
        unreadCount={unreadCount}
        onOpenMessages={openMessages}
        onOpenMenu={() => setShowMenu(true)}
        showMenu={showMenu}
        onCloseMenu={setShowMenu}
        push={push}
        onPushToggle={handlePushToggle}
        tgLinked={tgLinked}
        tgUsername={tgUsername}
        tgLinking={tgLinking}
        onTelegramLink={handleTelegramLink}
        onTelegramUnlink={handleTelegramUnlink}
        maxLinked={maxLinked}
        maxUsername={maxUsername}
        maxLinking={maxLinking}
        onMaxLink={handleMaxLink}
        onMaxUnlink={handleMaxUnlink}
        onOpenPassword={() => { setShowMenu(false); setPwForm({ old: "", new_pw: "", confirm: "" }); setShowPassword(true); }}
        onLogout={() => { setShowMenu(false); handleLogout(); }}
        showPassword={showPassword}
        onClosePassword={setShowPassword}
        pwForm={pwForm}
        onPwFormChange={setPwForm}
        savingPw={savingPw}
        onChangePassword={handleChangePassword}
        showMessages={showMessages}
        onCloseMessages={setShowMessages}
        messagesLoading={messagesLoading}
        messages={messages}
      />

      <CabinetDashboard
        data={data}
        userName={userName}
        onOpenLoan={openLoan}
        onOpenSaving={openSaving}
      />

      <Dialog open={showLoan} onOpenChange={setShowLoan}>
        <DialogContent className="max-w-4xl w-[calc(100vw-1rem)] sm:w-auto max-h-[90vh] overflow-y-auto p-4 sm:p-6">
          <DialogHeader><DialogTitle className="text-base sm:text-lg">Договор {loanDetail?.contract_no}</DialogTitle></DialogHeader>
          {loanDetail && <LoanDetailView loan={loanDetail} />}
        </DialogContent>
      </Dialog>

      <Dialog open={showSaving} onOpenChange={setShowSaving}>
        <DialogContent className="max-w-3xl w-[calc(100vw-1rem)] sm:w-auto max-h-[90vh] overflow-y-auto p-4 sm:p-6">
          <DialogHeader><DialogTitle className="text-base sm:text-lg">Договор {savingDetail?.contract_no}</DialogTitle></DialogHeader>
          {savingDetail && <SavingDetailView saving={savingDetail} />}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Cabinet;