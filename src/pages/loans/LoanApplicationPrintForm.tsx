import { LoanApplication } from "@/lib/api";
import { numToWords } from "@/lib/num-to-words";
import { Button } from "@/components/ui/button";
import Icon from "@/components/ui/icon";
import { buildHtmlDoc, downloadDocx, openPrintWindow } from "@/lib/doc-utils";

type Props = { item: LoanApplication };

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

function buildBody(item: LoanApplication): string {
  const appNo = val(item.application_no, "___");
  const currentDate = today();
  const fullName = val(item.full_name);
  const amount = item.amount != null ? fmt(item.amount) : "___________";
  const amountWords = item.amount != null ? numToWords(Number(item.amount)) : "___________";
  const termMonths = item.term_months != null ? `${item.term_months}` : "___";
  const collateral = val(item.collateral_types);
  const birthDate = fmtDate(item.birth_date);
  const birthPlace = val(item.birth_place);
  const inn = val(item.inn);
  const digits = (item.passport_series_number || "").replace(/\D/g, "");
  const passportSeries = digits.substring(0, 4);
  const passportNumber = digits.substring(4, 10);
  const passportIssueDate = fmtDate(item.passport_issue_date);
  const passportIssuedBy = val(item.passport_issued_by);
  const passportDeptCode = val(item.passport_division_code);
  const address = val(item.registration_address);
  const phone = val(item.mobile_phone);
  const email = val(item.email);

  const signRow = `
<table style="margin-top:32pt">
  <tr>
    <td style="width:40%;padding-top:24pt">
      __________________<br/><span style="font-size:9pt">(подпись)</span>
    </td>
    <td style="padding-top:24pt">
      ____________________________________________________<br/><span style="font-size:9pt">(ФИО Полностью)</span>
    </td>
  </tr>
</table>
<p style="margin-top:10pt">${currentDate}</p>`;

  /* ── Документ 1: Заявка на займ ── */
  const doc1 = `
<p class="center bold">В КПК «ЭКСПЕРТ ФИНАНС» ИНН 4307012081,<br/>КПК «ФИН ФОРМУЛА» ИНН 3666209530</p>
<p class="center bold">Заявка на потребительский заём № ${appNo}.${currentDate}</p>

<p>Я, <b>${fullName}</b>, прошу рассмотреть возможность получения потребительского займа на следующих условиях:</p>

<table>
  <tr><td colspan="2" class="section-header">Параметры займа</td></tr>
  <tr><td style="width:45%">Сумма займа</td><td>${amount} руб. (${amountWords})</td></tr>
  <tr><td>Срок займа</td><td>${termMonths} мес.</td></tr>
  <tr><td>Обеспечение</td><td>${collateral}</td></tr>
  <tr><td colspan="2" class="section-header" style="padding-top:8pt">Данные заёмщика</td></tr>
  <tr><td>ФИО</td><td>${fullName}</td></tr>
  <tr><td>Дата и место рождения</td><td>${birthDate} ${birthPlace}</td></tr>
  <tr><td>Паспорт гражданина РФ</td><td>${passportSeries} ${passportNumber} ${passportIssuedBy} ${passportIssueDate}</td></tr>
  <tr><td>ИНН</td><td>${inn}</td></tr>
  <tr><td>Адрес</td><td>${address}</td></tr>
  <tr><td>Телефон</td><td>${phone}</td></tr>
  <tr><td>Email</td><td>${email}</td></tr>
</table>

<p class="justify" style="margin-top:12pt">
  Настоящим заявлением подтверждаю, что знакомлен(на) и согласен(на) с положением по предоставлению займов
  в КПК «ЭКСПЕРТ ФИНАНС» ИНН 4307012081, и КПК «ФИН ФОРМУЛА» ИНН 3666209530.
  Согласен(на) с тем, что заявка будет рассматриваться в обеих КПК, кредитором по договору займа может
  выступать одно из КПК, в которые я направляю заявление.
</p>

<p style="margin-top:28pt">___________________________&nbsp;&nbsp;${fullName}</p>
<p>${currentDate}</p>`;

  /* ── Документ 2: Согласие на кредитные отчёты ── */
  const doc2 = `
<p class="center bold page-break">Согласие на получение кредитных отчетов из бюро кредитных историй</p>

<p class="justify">В соответствии с Федеральным законом № 218-ФЗ «О кредитных историях»,</p>

<p class="justify">
  Я, <b>${fullName}</b>&nbsp; Дата рождения и место рождения ${birthDate} ${birthPlace}&nbsp;
  Паспорт гражданина РФ ${passportSeries} ${passportNumber} ${passportIssuedBy} ${passportIssueDate}
</p>

<p class="justify">
  настоящим даю КПК "Эксперт Финанс" ИНН 4307012081, ООО «Эксперт Финанс» ИНН 6155058420,
  КПК «ФИН ФОРМУЛА» ИНН: 3666209530, ООО "РИА" ИНН:6155092615 свое согласие на получение из любого бюро
  кредитных историй информации / кредитных отчетов обо мне. Согласие дается в целях проверки благонадёжности
  для заключения и исполнения договора займа.
</p>

<p class="justify">
  Данное согласие субъекта кредитной истории считается действительным в течение 6 месяцев со дня его оформления.
  В случае, если в течение указанного срока договор займа (кредита) был заключен, указанное согласие субъекта
  кредитной истории сохраняет силу в течение всего срока действия договора займа (кредита).
</p>
${signRow}`;

  /* ── Документ 3: Согласие на обработку персональных данных ── */
  const doc3 = `
<p class="center bold page-break">Согласие на обработку персональных данных</p>

<p class="justify">
  Я, <b>${fullName}</b>, дата рождения ${birthDate}, место рождения ${birthPlace},
  паспорт гражданина РФ ${passportSeries} ${passportNumber}, выдан ${passportIssuedBy} ${passportIssueDate},
  код подразделения ${passportDeptCode}, адрес регистрации: ${address},
</p>

<p class="justify">
  настоящим даю своё согласие КПК «ЭКСПЕРТ ФИНАНС» ИНН 4307012081, ООО «Эксперт Финанс» ИНН 6155058420,
  КПК «ФИН ФОРМУЛА» ИНН: 3666209530, ООО "РИА" ИНН:6155092615
  на обработку моих персональных данных, включая сбор, систематизацию, накопление, хранение, уточнение
  (обновление, изменение), использование, распространение (в том числе передачу), обезличивание,
  блокирование, уничтожение персональных данных в целях заключения и исполнения договора займа,
  а также в иных целях, не противоречащих законодательству Российской Федерации.
</p>

<p class="justify">
  Настоящее согласие действует с момента его подписания и может быть отозвано путём подачи письменного
  заявления. Отзыв согласия не влияет на законность обработки, осуществлённой до его получения.
</p>

<p class="justify">
  Согласие предоставляется в соответствии с Федеральным законом от 27.07.2006 № 152-ФЗ
  «О персональных данных».
</p>
${signRow}`;

  return `${doc1}${doc2}${doc3}`;
}

export function LoanApplicationDocButtons({ item }: Props) {
  const title = `Заявка на займ ${item.application_no || ""}`;

  const handlePrint = () => {
    openPrintWindow(title, buildBody(item));
  };

  const handleDocx = () => {
    const html = buildHtmlDoc(title, buildBody(item));
    downloadDocx(`Заявка_на_займ_${item.application_no || "б-н"}.doc`, html);
  };

  return (
    <div className="flex gap-2">
      <Button variant="outline" size="sm" onClick={handlePrint} title="Открыть для печати">
        <Icon name="Printer" size={15} className="mr-1.5" />
        Печать
      </Button>
      <Button variant="outline" size="sm" onClick={handleDocx} title="Скачать DOC">
        <Icon name="FileDown" size={15} className="mr-1.5" />
        Скачать
      </Button>
    </div>
  );
}