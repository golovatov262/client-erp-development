import { SavingApplication } from "@/lib/api";
import { numToWords } from "@/lib/num-to-words";
import { Button } from "@/components/ui/button";
import Icon from "@/components/ui/icon";
import { buildHtmlDoc, downloadDocx, openPrintWindow } from "@/lib/doc-utils";

type Props = { item: SavingApplication };

function fmt(n: number | null | undefined) {
  if (n == null) return "___________";
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(n);
}
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

function buildBody(item: SavingApplication): string {
  const appNo = val(item.application_no, "___");
  const currentDate = today();

  const fullName = [item.last_name, item.first_name, item.middle_name].filter(Boolean).join(" ") || "___________";
  const amount = item.amount != null ? fmt(item.amount) : "___________";
  const amountWords = item.amount != null ? numToWords(Number(item.amount)) : "___________";
  const termMonths = item.term_months != null ? `${item.term_months}` : "___";
  const rate = item.rate != null ? `${item.rate}` : "___";
  const payoutType = item.payout_type === "monthly" ? "ежемесячно" : item.payout_type === "end_of_term" ? "в конце срока" : "___________";

  const birthDate = fmtDate(item.birth_date);
  const birthPlace = val(item.birth_place);
  const inn = val(item.inn);

  const passportSeries = val(item.passport_series, "____");
  const passportNumber = val(item.passport_number, "______");
  const passportIssueDate = fmtDate(item.passport_issue_date);
  const passportIssuedBy = val(item.passport_issued_by);
  const passportDeptCode = val(item.passport_dept_code);

  const address = val(item.registration_address);
  const phone = val(item.phone);
  const email = val(item.email);

  return `
<p class="center bold">В КПК «ЭКСПЕРТ ФИНАНС» ИНН 4307012081,<br/>КПК «ФИН ФОРМУЛА» ИНН 3666209530</p>
<p class="center bold">Заявка на личные сбережения № ${appNo}.${currentDate}</p>

<p>Я, <b>${fullName}</b>, прошу рассмотреть возможность размещения личных сбережений на следующих условиях:</p>

<table>
  <tr><td colspan="2" class="section-header">Параметры вклада</td></tr>
  <tr><td style="width:45%">Сумма вклада</td><td>${amount} руб. (${amountWords})</td></tr>
  <tr><td>Срок</td><td>${termMonths} мес.</td></tr>
  <tr><td>Процентная ставка</td><td>${rate} % годовых</td></tr>
  <tr><td>Выплата процентов</td><td>${payoutType}</td></tr>
  <tr><td colspan="2" class="section-header" style="padding-top:8pt">Данные вкладчика</td></tr>
  <tr><td>ФИО</td><td>${fullName}</td></tr>
  <tr><td>Дата и место рождения</td><td>${birthDate} ${birthPlace}</td></tr>
  <tr><td>Паспорт гражданина РФ</td><td>${passportSeries} ${passportNumber} выдан ${passportIssuedBy} ${passportIssueDate} код подр. ${passportDeptCode}</td></tr>
  <tr><td>ИНН</td><td>${inn}</td></tr>
  <tr><td>Адрес регистрации</td><td>${address}</td></tr>
  <tr><td>Телефон</td><td>${phone}</td></tr>
  <tr><td>Email</td><td>${email}</td></tr>
</table>

<p class="justify" style="margin-top:12pt">
  Настоящим заявлением подтверждаю, что знакомлен(на) и согласен(на) с положением по привлечению личных сбережений
  в КПК «ЭКСПЕРТ ФИНАНС» ИНН 4307012081, и КПК «ФИН ФОРМУЛА» ИНН 3666209530.
  Согласен(на) с тем, что заявка будет рассматриваться в обеих КПК, стороной по договору личных сбережений может
  выступать одно из КПК, в которые я направляю заявление.
</p>

<p style="margin-top:24pt">___________________________&nbsp;&nbsp;${fullName}</p>
<p>${currentDate}</p>

<br/><br/><br/><br/><br/>

<div class="page-break"></div>

<p class="center bold" style="margin-top:0">Согласие на обработку персональных данных</p>

<p class="justify">
  Я, <b>${fullName}</b>, дата рождения ${birthDate}, место рождения ${birthPlace},
  паспорт гражданина РФ ${passportSeries} ${passportNumber}, выдан ${passportIssuedBy} ${passportIssueDate},
  код подразделения ${passportDeptCode}, адрес регистрации: ${address},
</p>

<p class="justify">
  настоящим даю своё согласие КПК «ЭКСПЕРТ ФИНАНС» ИНН 4307012081, КПК «ФИН ФОРМУЛА» ИНН 3666209530
  на обработку моих персональных данных, включая сбор, систематизацию, накопление, хранение, уточнение
  (обновление, изменение), использование, распространение (в том числе передачу), обезличивание,
  блокирование, уничтожение персональных данных в целях заключения и исполнения договора личных сбережений,
  а также в иных целях, не противоречащих законодательству Российской Федерации.
</p>

<p class="justify">
  Настоящее согласие действует с момента его подписания и может быть отозвано путём подачи письменного
  заявления в КПК. Отзыв согласия не влияет на законность обработки, осуществлённой до его получения.
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

export function SavingApplicationDocButtons({ item }: Props) {
  const title = `Заявка на сбережение ${item.application_no || ""}`;

  const handlePrint = () => {
    openPrintWindow(title, buildBody(item));
  };

  const handleDocx = () => {
    const html = buildHtmlDoc(title, buildBody(item));
    downloadDocx(`Заявка_на_сбережение_${item.application_no || "б-н"}.doc`, html);
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
