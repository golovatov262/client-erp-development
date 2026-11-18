import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import PageHeader from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import AdminNbkiTab from "./admin/AdminNbkiTab";
import AdminOkbTab from "./admin/AdminOkbTab";

type View = "operations" | "history" | "settings";
const sections: { id: View; label: string; description: string }[] = [
  { id: "operations", label: "Текущая работа", description: "Проверьте события, сформируйте пакет и следите за результатом отправки." },
  { id: "history", label: "История и квитанции", description: "Отправленные файлы, ответы бюро и результаты обработки событий." },
  { id: "settings", label: "Настройки", description: "Подключение Windows-компонента, сертификаты и параметры обмена выбранной организации." },
];

export default function Bki() {
  const [params, setParams] = useSearchParams();
  const org = params.get("org") === "3" ? 3 : 2;
  const bureau = org === 2 && params.get("bureau") === "okb" ? "okb" : "nbki";
  const section = sections.find(item => item.id === params.get("section")) ?? sections[0];
  const orgName = org === 3 ? "ФИН ФОРМУЛА" : "ЭКСПЕРТ ФИНАНС";
  const bureauName = bureau === "okb" ? "ОКБ" : "НБКИ";
  // Keep links reproducible, including invalid/unsupported organization-bureau pairs.
  useEffect(() => {
    if (params.get("org") !== String(org) || params.get("bureau") !== bureau || params.get("section") !== section.id) {
      setParams({ org: String(org), bureau, section: section.id }, { replace: true });
    }
  }, [org, bureau, section.id, params, setParams]);
  const navigate = (nextOrg: number, nextBureau: string, nextSection: string) => {
    setParams({ org: String(nextOrg), bureau: nextOrg === 3 ? "nbki" : nextBureau, section: nextSection });
  };
  const setView = (view: string) => navigate(org, bureau, view);

  return <div className="p-4 sm:p-6 space-y-5">
    <PageHeader title="БКИ" />
    <p className="text-sm text-muted-foreground">Обмен кредитной информацией: выберите организацию и бюро.</p>
    <div className="rounded-lg border bg-card p-4 space-y-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:gap-8">
        <fieldset className="space-y-2">
          <legend className="text-xs font-medium text-muted-foreground">Организация</legend>
          <div className="flex flex-wrap gap-2">
            {([{id:2,name:"ЭКСПЕРТ ФИНАНС"},{id:3,name:"ФИН ФОРМУЛА"}]).map(item =>
              <Button key={item.id} variant={org === item.id ? "default" : "outline"} aria-pressed={org === item.id}
                onClick={() => navigate(item.id, bureau, section.id)}>{item.name}</Button>)}
          </div>
        </fieldset>
        <fieldset className="space-y-2">
          <legend className="text-xs font-medium text-muted-foreground">Бюро кредитных историй</legend>
          <div className="flex gap-2">
            <Button variant={bureau === "nbki" ? "default" : "outline"} aria-pressed={bureau === "nbki"} onClick={() => navigate(org, "nbki", section.id)}>НБКИ</Button>
            {org === 2 && <Button variant={bureau === "okb" ? "default" : "outline"} aria-pressed={bureau === "okb"} onClick={() => navigate(org, "okb", section.id)}>ОКБ</Button>}
          </div>
          {org === 3 && <p className="text-xs text-muted-foreground">Для ФИН ФОРМУЛЫ настроен обмен с НБКИ.</p>}
        </fieldset>
      </div>
      <div className="border-t pt-3 text-sm font-medium" role="status">{orgName} → {bureauName}</div>
    </div>
    <nav aria-label="Разделы обмена с БКИ" className="flex flex-wrap gap-2 border-b pb-3">
      {sections.map(item => <Button key={item.id} variant={section.id === item.id ? "default" : "ghost"}
        aria-current={section.id === item.id ? "page" : undefined} onClick={() => setView(item.id)}>{item.label}</Button>)}
    </nav>
    <p className="text-sm text-muted-foreground">{section.description}</p>
    <div key={`${org}-${bureau}`}>
      {bureau === "nbki"
        ? <AdminNbkiTab orgId={org} orgName={orgName} activeView={section.id} onViewChange={setView} hideNavigation />
        : <AdminOkbTab activeView={section.id} onViewChange={setView} hideNavigation />}
    </div>
  </div>;
}
