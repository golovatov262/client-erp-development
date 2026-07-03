import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import Icon from "@/components/ui/icon";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { humanizeError } from "@/lib/api";

const Login = () => {
  const [loginVal, setLoginVal] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginVal || !password) return;
    setLoading(true);
    try {
      await login(loginVal, password);
      navigate("/office");
    } catch (err) {
      toast({ title: "Ошибка входа", description: humanizeError(err), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200 p-4">
      <Card className="w-full max-w-sm shadow-lg">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto mb-2 w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
            <Icon name="Shield" size={24} className="text-primary" />
          </div>
          <CardTitle className="text-xl">КПК — Вход в систему</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">Панель управления</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Логин</Label>
              <Input
                value={loginVal}
                onChange={(e) => setLoginVal(e.target.value)}
                placeholder="admin"
                autoComplete="username"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label>Пароль</Label>
              <div className="relative">
                <Input
                  type={showPw ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Введите пароль"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowPw(!showPw)}
                  tabIndex={-1}
                >
                  <Icon name={showPw ? "EyeOff" : "Eye"} size={16} />
                </button>
              </div>
            </div>
            <Button type="submit" className="w-full" disabled={loading || !loginVal || !password}>
              {loading ? <Icon name="Loader2" size={16} className="animate-spin mr-2" /> : <Icon name="LogIn" size={16} className="mr-2" />}
              Войти
            </Button>
          </form>
          <div className="mt-4 text-center">
            <a href="/" className="text-xs text-muted-foreground hover:text-primary transition-colors">
              Личный кабинет клиента
            </a>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Login;