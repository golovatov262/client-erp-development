import { SavingApplication, Organization } from "@/lib/api";
import { Button } from "@/components/ui/button";
import Icon from "@/components/ui/icon";
import { buildHtmlDoc, downloadDocx, openPrintWindow } from "@/lib/doc-utils";

type Props = { item: SavingApplication; orgs?: Organization[] };

function fmtDate(s: string | null | undefined) {
  if (!s) return "___________";
  return new Date(s).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
}
function today() {
  return new Date().toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
}
function val(s: string | null | undefined, fallback = "___________") {
  return s?.trim() || fallback;
}

function buildBody(item: SavingApplication, orgs: Organization[] = []): string {
  const currentDate = today();

  const fullName = [item.last_name, item.first_name, item.middle_name].filter(Boolean).join(" ") || "___________";

  const birthDate = fmtDate(item.birth_date);
  const birthPlace = val(item.birth_place);

  const passportSeries = val(item.passport_series, "____");
  const passportNumber = val(item.passport_number, "______");
  const passportIssueDate = fmtDate(item.passport_issue_date);
  const passportIssuedBy = val(item.passport_issued_by);
  const passportDeptCode = val(item.passport_dept_code);

  const address = val(item.registration_address);

  const orgShortNames = orgs
    .map(o => (o.short_name || o.name || "").trim())
    .filter(Boolean);
  const orgsStr = orgShortNames.length > 0
    ? orgShortNames.join(" и ")
    : "___________";

  return `
<p class="center bold">Согласие на обработку персональных данных</p>

<p class="justify">
  Я, <b>${fullName}</b>, дата рождения ${birthDate}, место рождения ${birthPlace},
  паспорт гражданина РФ ${passportSeries} ${passportNumber}, выдан ${passportIssuedBy} ${passportIssueDate},
  код подразделения ${passportDeptCode}, адрес регистрации: ${address},
</p>

<p class="justify">
  настоящим даю своё согласие ${orgsStr}
  на обработку моих персональных данных, включая сбор, систематизацию, накопление, хранение, уточнение
  (обновление, изменение), использование, распространение (в том числе передачу), обезличивание,
  блокирование, уничтожение персональных данных в целях заключения и исполнения договора паевого счета,
  а также в иных целях, не противоречащих законодательству Российской Федерации.
</p>

<p class="justify">
  Настоящее согласие действует с момента его подписания и может быть отозвано путём подачи письменного
  заявления в Организацию. Отзыв согласия не влияет на законность обработки, осуществлённой до его получения.
</p>

<p class="justify">
  Согласие предоставляется в соответствии с Федеральным законом от 27.07.2006 № 152-ФЗ
  «О персональных данных».
</p>

<br/><br/>
<table style="margin-top:24pt">
  <tr>
    <td style="width:40%;padding-top:24pt">
      __________________<br/><span style="font-size:9pt">(подпись)</span>
    </td>
    <td style="padding-top:24pt">
      ____________________________________________________<br/><span style="font-size:9pt">(ФИО Полностью)</span>
    </td>
  </tr>
</table>
<p style="margin-top:12pt">${currentDate}</p>
`;
}

export function SavingApplicationDocButtons({ item, orgs }: Props) {
  const title = `Согласие на обработку ПДн ${item.application_no || ""}`;

  const handlePrint = () => {
    openPrintWindow(title, buildBody(item, orgs));
  };

  const handleDocx = () => {
    const html = buildHtmlDoc(title, buildBody(item, orgs));
    downloadDocx(`Согласие_на_обработку_ПДн_${item.application_no || "б-н"}.doc`, html);
  };

  return (
    <div className="flex gap-2">
      <Button variant="outline" size="sm" onClick={handlePrint} title="Открыть для печати">
        <Icon name="Printer" size={15} className="mr-1.5" />
        Печать
      </Button>
      <Button variant="outline" size="sm" onClick={handleDocx} title="Скачать DOCX">
        <Icon name="FileDown" size={15} className="mr-1.5" />
        Скачать
      </Button>
    </div>
  );
}
