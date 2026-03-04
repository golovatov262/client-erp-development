import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import StatCard from "@/components/ui/stat-card";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Icon from "@/components/ui/icon";
import api, { DashboardStats, OverdueLoanItem, ExpiringSavingItem } from "@/lib/api";

const formatMoney = (val: number) => {
  if (val >= 1000000) return (val / 1000000).toFixed(1) + " млн ₽";
  if (val >= 1000) return (val / 1000).toFixed(0) + " тыс. ₽";
  return val.toFixed(0) + " ₽";
};

const formatDate = (d: string) => {
  const parts = d.split("-");
  if (parts.length === 3) return `${parts[2]}.${parts[1]}.${parts[0]}`;
  return d;
};

const Dashboard = () => {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedOrg, setSelectedOrg] = useState<number | undefined>(undefined);
  const navigate = useNavigate();

  const load = useCallback((orgId?: number) => {
    setLoading(true);
    api.dashboard(orgId).then(setStats).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load(selectedOrg);
  }, [selectedOrg, load]);

  const handleOrgChange = (orgId?: number) => {
    setSelectedOrg(orgId);
  };

  if (loading && !stats) {
    return (
      <div className="flex items-center justify-center h-64">
        <Icon name="Loader2" size={32} className="animate-spin text-primary" />
      </div>
    );
  }

  const orgs = stats?.organizations || [];
  const overdueList = stats?.overdue_loan_list || [];
  const expiringList = stats?.expiring_savings || [];
  const expiringTotal = stats?.expiring_savings_total || 0;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Дашборд</h1>
          <p className="text-sm text-muted-foreground mt-1">Обзор деятельности кооператива</p>
        </div>
        {loading && stats && (
          <Icon name="Loader2" size={20} className="animate-spin text-muted-foreground" />
        )}
      </div>

      {orgs.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => handleOrgChange(undefined)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              selectedOrg === undefined
                ? "bg-primary text-primary-foreground shadow-sm"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            Все организации
          </button>
          {orgs.map((org) => (
            <button
              key={org.id}
              onClick={() => handleOrgChange(org.id)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                selectedOrg === org.id
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              {org.short_name || org.name}
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Всего пайщиков"
          value={String(stats?.total_members || 0)}
          icon="Users"
          iconColor="bg-primary/10 text-primary"
        />
        <StatCard
          title="Активные займы"
          value={String(stats?.active_loans || 0)}
          change={formatMoney(stats?.loan_portfolio || 0) + " портфель"}
          changeType="neutral"
          icon="Landmark"
          iconColor="bg-orange-100 text-orange-600"
        />
        <StatCard
          title="Сбережения"
          value={formatMoney(stats?.total_savings || 0)}
          icon="PiggyBank"
          iconColor="bg-emerald-100 text-emerald-600"
        />
        <StatCard
          title="Просрочка"
          value={String(stats?.overdue_loans || 0)}
          change={stats?.overdue_loans ? "Требует внимания" : ""}
          changeType={stats?.overdue_loans ? "negative" : "neutral"}
          icon="AlertTriangle"
          iconColor="bg-red-100 text-red-600"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
              <Icon name="Landmark" size={18} className="text-primary" />
            </div>
            <div className="text-sm font-semibold">Портфель займов</div>
          </div>
          <div className="text-2xl font-bold">{formatMoney(stats?.loan_portfolio || 0)}</div>
          <div className="text-xs text-muted-foreground mt-1">Активные договоры: {stats?.active_loans || 0}</div>
        </Card>
        <Card className="p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-lg bg-emerald-100 flex items-center justify-center">
              <Icon name="PiggyBank" size={18} className="text-emerald-600" />
            </div>
            <div className="text-sm font-semibold">Сбережения</div>
          </div>
          <div className="text-2xl font-bold">{formatMoney(stats?.total_savings || 0)}</div>
          <div className="text-xs text-muted-foreground mt-1">Привлечённые средства</div>
        </Card>
        <Card className="p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-lg bg-violet-100 flex items-center justify-center">
              <Icon name="Wallet" size={18} className="text-violet-600" />
            </div>
            <div className="text-sm font-semibold">Паевой фонд</div>
          </div>
          <div className="text-2xl font-bold">{formatMoney(stats?.total_shares || 0)}</div>
          <div className="text-xs text-muted-foreground mt-1">Общая сумма взносов</div>
        </Card>
      </div>

      {overdueList.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Icon name="AlertTriangle" size={18} className="text-red-600" />
            <h2 className="text-lg font-semibold">Просроченные займы</h2>
            <Badge variant="destructive" className="ml-1">{overdueList.length}</Badge>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {overdueList.map((item: OverdueLoanItem) => (
              <Card
                key={item.loan_id}
                className="p-4 border-red-200 bg-red-50/50 hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => navigate(`/loans?open=${item.loan_id}`)}
              >
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <div className="font-semibold text-sm">{item.member_name}</div>
                    <div className="text-xs text-muted-foreground">Договор {item.contract_no}</div>
                  </div>
                  {item.overdue_days > 0 && (
                    <Badge variant="destructive" className="text-xs">
                      {item.overdue_days} дн.
                    </Badge>
                  )}
                </div>
                <div className="space-y-1.5 mt-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Остаток долга</span>
                    <span className="font-medium">{formatMoney(item.balance)}</span>
                  </div>
                  {item.overdue_amount > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-red-600">Сумма просрочки</span>
                      <span className="font-medium text-red-600">{formatMoney(item.overdue_amount)}</span>
                    </div>
                  )}
                  {item.penalty_total > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-red-600">Пени</span>
                      <span className="font-medium text-red-600">{formatMoney(item.penalty_total)}</span>
                    </div>
                  )}
                  {item.overdue_since && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Просрочка с</span>
                      <span className="text-muted-foreground">{formatDate(item.overdue_since)}</span>
                    </div>
                  )}
                  {item.org_name && !selectedOrg && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Организация</span>
                      <span className="text-muted-foreground">{item.org_name}</span>
                    </div>
                  )}
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {expiringList.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Icon name="Clock" size={18} className="text-amber-600" />
              <h2 className="text-lg font-semibold">Истекающие сбережения (30 дней)</h2>
              <Badge className="ml-1 bg-amber-100 text-amber-700 hover:bg-amber-100">{expiringList.length}</Badge>
            </div>
            <div className="text-sm font-semibold text-amber-700">
              К возврату: {formatMoney(expiringTotal)}
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {expiringList.map((item: ExpiringSavingItem) => {
              const daysLeft = Math.ceil((new Date(item.end_date).getTime() - Date.now()) / 86400000);
              return (
                <Card
                  key={item.saving_id}
                  className="p-4 border-amber-200 bg-amber-50/50 hover:shadow-md transition-shadow cursor-pointer"
                  onClick={() => navigate(`/savings?open=${item.saving_id}`)}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <div className="font-semibold text-sm">{item.member_name}</div>
                      <div className="text-xs text-muted-foreground">Договор {item.contract_no}</div>
                    </div>
                    <Badge className="text-xs bg-amber-100 text-amber-700 hover:bg-amber-100">
                      {daysLeft <= 0 ? "сегодня" : `${daysLeft} дн.`}
                    </Badge>
                  </div>
                  <div className="space-y-1.5 mt-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Тело вклада</span>
                      <span className="font-medium">{formatMoney(item.current_balance)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Начислено %</span>
                      <span className="font-medium">{formatMoney(item.accrued_interest)}</span>
                    </div>
                    {item.paid_interest > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Выплачено %</span>
                        <span className="text-muted-foreground">{formatMoney(item.paid_interest)}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-sm border-t pt-1.5 mt-1.5">
                      <span className="text-amber-700 font-medium">К возврату</span>
                      <span className="font-semibold text-amber-700">{formatMoney(item.refund_amount)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Дата окончания</span>
                      <span className="text-muted-foreground">{formatDate(item.end_date)}</span>
                    </div>
                    {item.org_name && !selectedOrg && (
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Организация</span>
                        <span className="text-muted-foreground">{item.org_name}</span>
                      </div>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;