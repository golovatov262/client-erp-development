import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import Icon from "@/components/ui/icon";
import { useToast } from "@/hooks/use-toast";
import api from "@/lib/api";

type Step = "choose" | "phone" | "sms" | "password_login" | "set_password" | "login_form";

const formatPhone = (value: string): string => {
  const digits = value.replace(/\D/g, "");
  const d = digits.startsWith("8") ? "7" + digits.slice(1) : digits.startsWith("7") ? digits : digits.length > 0 ? "7" + digits : "";
  if (!d) return "";
  if (d.length <= 1) return "+7";
  if (d.length <= 4) return `+7 (${d.slice(1)}`;
  if (d.length <= 7) return `+7 (${d.slice(1, 4)}) ${d.slice(4)}`;
  if (d.length <= 9) return `+7 (${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7)}`;
  return `+7 (${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7, 9)}-${d.slice(9, 11)}`;
};

const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>, setter: (v: string) => void) => {
  const raw = e.target.value;
  if (raw === "" || raw === "+") { setter(""); return; }
  setter(formatPhone(raw));
};

const isPhoneComplete = (value: string) => value.replace(/\D/g, "").length === 11;

const Login = () => {
  const [step, setStep] = useState<Step>("choose");
  const [phone, setPhone] = useState("");
  const [loginField, setLoginField] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [hasPassword, setHasPassword] = useState(false);
  const [setupToken, setSetupToken] = useState("");
  const [debugCode, setDebugCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [orgs, setOrgs] = useState<{ name: string; short_name: string; inn: string }[]>([]);
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => { api.publicOrgs().then(setOrgs).catch(() => {}); }, []);

  const saveAuth = (token: string, user: { name: string; member_id: number }) => {
    localStorage.setItem("cabinet_token", token);
    localStorage.setItem("cabinet_user", JSON.stringify(user));
    navigate("/cabinet");
  };

  const handleSendSms = async () => {
    if (!phone.trim()) return;
    setLoading(true);
    try {
      const res = await api.auth.sendSms(phone);
      if (res.error) {
        toast({ title: res.error, variant: "destructive" });
        return;
      }
      setHasPassword(res.has_password);
      if (res.debug_code) setDebugCode(res.debug_code);
      setStep("sms");
      toast({ title: "SMS-код отправлен" });
    } catch (e) {
      toast({ title: "Ошибка", description: String(e), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleVerifySms = async () => {
    if (!code.trim()) return;
    setLoading(true);
    try {
      const res = await api.auth.verifySms(phone, code);
      if (res.error) {
        toast({ title: res.error, variant: "destructive" });
        return;
      }
      if (res.authenticated && res.token && res.user) {
        saveAuth(res.token, res.user);
      } else if (!res.has_password && res.setup_token) {
        setSetupToken(res.setup_token);
        setStep("set_password");
      }
    } catch (e) {
      toast({ title: "Ошибка", description: String(e), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleSetPassword = async () => {
    if (password.length < 6) {
      toast({ title: "Пароль должен быть не менее 6 символов", variant: "destructive" });
      return;
    }
    if (password !== confirmPassword) {
      toast({ title: "Пароли не совпадают", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const res = await api.auth.setPassword(setupToken, password);
      if (res.error) {
        toast({ title: res.error, variant: "destructive" });
        return;
      }
      if (res.token && res.user) saveAuth(res.token, res.user);
    } catch (e) {
      toast({ title: "Ошибка", description: String(e), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordLogin = async () => {
    if (!password) return;
    setLoading(true);
    try {
      const res = await api.auth.loginPassword(phone, password);
      if (res.error) {
        toast({ title: res.error, variant: "destructive" });
        return;
      }
      if (res.token && res.user) saveAuth(res.token, res.user);
    } catch (e) {
      toast({ title: "Ошибка", description: String(e), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleLoginForm = async () => {
    if (!loginField || !password) return;
    setLoading(true);
    try {
      const res = await api.auth.loginPassword("", password, loginField);
      if (res.error) {
        toast({ title: res.error, variant: "destructive" });
        return;
      }
      if (res.token && res.user) saveAuth(res.token, res.user);
    } catch (e) {
      toast({ title: "Ошибка", description: String(e), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-slate-100 flex items-center justify-center px-3 py-6 sm:p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-6 sm:mb-8">
          <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-primary flex items-center justify-center mx-auto mb-3 sm:mb-4">
            <Icon name="Shield" size={28} className="text-white sm:hidden" />
            <Icon name="Shield" size={32} className="text-white hidden sm:block" />
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">Личный кабинет</h1>
          <p className="text-muted-foreground text-xs sm:text-sm mt-1">Кредитный потребительский кооператив</p>
        </div>

        <Card className="shadow-lg">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg">
              {step === "choose" && "Вход в кабинет"}
              {step === "phone" && "Вход по SMS"}
              {step === "sms" && "Подтверждение"}
              {step === "password_login" && "Введите пароль"}
              {step === "set_password" && "Создайте пароль"}
              {step === "login_form" && "Вход по логину"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {step === "choose" && (
              <div className="space-y-3">
                <Button className="w-full gap-2 h-12 text-sm" variant="outline" onClick={() => setStep("login_form")}>
                  <Icon name="User" size={18} />
                  Войти по логину и паролю
                </Button>
                <Button className="w-full gap-2 h-12 text-sm" variant="outline" onClick={() => setStep("phone")}>
                  <Icon name="Smartphone" size={18} />
                  Войти по номеру телефона
                </Button>
              </div>
            )}

            {step === "login_form" && (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">Логин</Label>
                  <Input value={loginField} onChange={e => setLoginField(e.target.value)} placeholder="Ваш логин" onKeyDown={e => e.key === "Enter" && document.getElementById("lf-pw")?.focus()} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Пароль</Label>
                  <Input id="lf-pw" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Ваш пароль" onKeyDown={e => e.key === "Enter" && handleLoginForm()} />
                </div>
                <Button className="w-full gap-2" onClick={handleLoginForm} disabled={loading || !loginField || !password}>
                  {loading ? <Icon name="Loader2" size={16} className="animate-spin" /> : <Icon name="LogIn" size={16} />}
                  Войти
                </Button>
                <Button variant="ghost" className="w-full text-sm" onClick={() => { setStep("choose"); setPassword(""); setLoginField(""); }}>
                  Назад
                </Button>
              </div>
            )}

            {step === "phone" && (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">Номер телефона</Label>
                  <Input
                    value={phone}
                    onChange={e => handlePhoneChange(e, setPhone)}
                    placeholder="+7 (___) ___-__-__"
                    type="tel"
                    maxLength={18}
                    onKeyDown={e => e.key === "Enter" && handleSendSms()}
                  />
                  <p className="text-xs text-muted-foreground">Укажите номер, который зарегистрирован в кооперативе</p>
                </div>
                <Button className="w-full gap-2" onClick={handleSendSms} disabled={loading || !isPhoneComplete(phone)}>
                  {loading ? <Icon name="Loader2" size={16} className="animate-spin" /> : <Icon name="Send" size={16} />}
                  Получить SMS-код
                </Button>
                <Button variant="ghost" className="w-full text-sm" onClick={() => setStep("choose")}>
                  Назад
                </Button>
              </div>
            )}

            {step === "sms" && (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">SMS-код</Label>
                  <Input
                    value={code}
                    onChange={e => setCode(e.target.value)}
                    placeholder="______"
                    maxLength={6}
                    className="text-center text-xl sm:text-2xl tracking-[0.3em] sm:tracking-[0.5em] font-mono"
                    onKeyDown={e => e.key === "Enter" && handleVerifySms()}
                  />
                  <p className="text-xs text-muted-foreground">Введите код из SMS, отправленного на {phone}</p>
                  {debugCode && (
                    <p className="text-xs text-primary font-medium bg-primary/10 rounded px-2 py-1">
                      Демо-код: {debugCode}
                    </p>
                  )}
                </div>

                {hasPassword && (
                  <button className="text-xs text-primary hover:underline" onClick={() => { setStep("password_login"); setPassword(""); }}>
                    Войти по паролю
                  </button>
                )}

                <Button className="w-full gap-2" onClick={handleVerifySms} disabled={loading || code.length < 6}>
                  {loading ? <Icon name="Loader2" size={16} className="animate-spin" /> : <Icon name="Check" size={16} />}
                  Подтвердить
                </Button>
                <Button variant="ghost" className="w-full text-sm" onClick={() => { setStep("phone"); setCode(""); }}>
                  Изменить номер
                </Button>
              </div>
            )}

            {step === "password_login" && (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">Пароль</Label>
                  <Input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Введите пароль"
                    onKeyDown={e => e.key === "Enter" && handlePasswordLogin()}
                  />
                </div>
                <Button className="w-full gap-2" onClick={handlePasswordLogin} disabled={loading || !password}>
                  {loading ? <Icon name="Loader2" size={16} className="animate-spin" /> : <Icon name="LogIn" size={16} />}
                  Войти
                </Button>
                <Button variant="ghost" className="w-full text-sm" onClick={() => { setStep("sms"); setPassword(""); }}>
                  Войти по SMS-коду
                </Button>
              </div>
            )}

            {step === "set_password" && (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">Это ваш первый вход. Придумайте пароль для быстрого входа в будущем.</p>
                <div className="space-y-1.5">
                  <Label className="text-xs">Пароль</Label>
                  <Input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Минимум 6 символов"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Подтвердите пароль</Label>
                  <Input
                    type="password"
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    placeholder="Повторите пароль"
                    onKeyDown={e => e.key === "Enter" && handleSetPassword()}
                  />
                </div>
                <Button className="w-full gap-2" onClick={handleSetPassword} disabled={loading || password.length < 6}>
                  {loading ? <Icon name="Loader2" size={16} className="animate-spin" /> : <Icon name="Lock" size={16} />}
                  Создать пароль и войти
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="text-center text-xs text-muted-foreground mt-6 space-y-2">
          <p>По техническим вопросам: <a href="tel:88007008909" className="font-medium text-foreground hover:underline">8 800 700-89-09</a> <span className="text-muted-foreground/70">(звонок бесплатный)</span></p>
        </div>

        {orgs.length > 0 && (
          <div className="mt-8 text-center space-y-2">
            {orgs.map((o, i) => (
              <div key={i} className="text-[11px] text-muted-foreground/70 leading-tight">
                <span>{o.short_name || o.name}</span>
                {o.inn && <span className="ml-1.5">ИНН {o.inn}</span>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Login;