import { LoanApplication } from "@/lib/api";
import { numToWords } from "@/lib/num-to-words";
import { Button } from "@/components/ui/button";
import Icon from "@/components/ui/icon";

type Props = {
  item: LoanApplication;
};

function fmt(n: number | null | undefined) {
  if (n == null) return "___________";
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(n);
}

function fmtDate(s: string | null | undefined) {
  if (!s) return "___________";
  const d = new Date(s);
  return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function today() {
  return new Date().toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function val(s: string | null | undefined, fallback = "___________") {
  return s?.trim() || fallback;
}

export function LoanApplicationPrintForm({ item }: Props) {
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

  const passportRaw = item.passport_series_number || "";
  const passportSeries = passportRaw.replace(/\D/g, "").substring(0, 4);
  const passportNumber = passportRaw.replace(/\D/g, "").substring(4, 10);
  const passportIssueDate = fmtDate(item.passport_issue_date);
  const passportIssuedBy = val(item.passport_issued_by);

  const address = val(item.registration_address);
  const phone = val(item.mobile_phone);
  const email = val(item.email);

  return (
    <div
      id="loan-print-content"
      style={{
        fontFamily: "Times New Roman, serif",
        fontSize: "12pt",
        lineHeight: "1.4",
        color: "#000",
        background: "#fff",
        padding: "20mm 20mm 20mm 25mm",
        maxWidth: "210mm",
        margin: "0 auto",
      }}
    >
      <div style={{ textAlign: "center", fontWeight: "bold", marginBottom: "6pt" }}>
        В КПК «ЭКСПЕРТ ФИНАНС» ИНН 4307012081,<br />
        КПК «ФИН ФОРМУЛА» ИНН 3666209530
      </div>

      <div style={{ textAlign: "center", fontWeight: "bold", marginBottom: "12pt" }}>
        Заявка на потребительский заём № {appNo}.{currentDate}
      </div>

      <div style={{ marginBottom: "12pt" }}>
        Я, <b>{fullName}</b>, прошу рассмотреть возможность получения потребительского займа на следующих условиях:
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "12pt" }}>
        <tbody>
          <tr>
            <td colSpan={2} style={{ fontWeight: "bold", padding: "4pt 0", borderBottom: "1px solid #000" }}>
              Параметры займа
            </td>
          </tr>
          <tr>
            <td style={{ padding: "3pt 0", width: "45%" }}>Сумма займа</td>
            <td style={{ padding: "3pt 0" }}>{amount} руб. ({amountWords})</td>
          </tr>
          <tr>
            <td style={{ padding: "3pt 0" }}>Срок займа</td>
            <td style={{ padding: "3pt 0" }}>{termMonths} мес.</td>
          </tr>
          <tr>
            <td style={{ padding: "3pt 0" }}>Обеспечение</td>
            <td style={{ padding: "3pt 0" }}>{collateral}</td>
          </tr>
          <tr>
            <td colSpan={2} style={{ fontWeight: "bold", padding: "8pt 0 4pt", borderBottom: "1px solid #000" }}>
              Данные заёмщика
            </td>
          </tr>
          <tr>
            <td style={{ padding: "3pt 0" }}>ФИО</td>
            <td style={{ padding: "3pt 0" }}>{fullName}</td>
          </tr>
          <tr>
            <td style={{ padding: "3pt 0" }}>Дата и место рождения</td>
            <td style={{ padding: "3pt 0" }}>{birthDate} {birthPlace}</td>
          </tr>
          <tr>
            <td style={{ padding: "3pt 0" }}>Паспорт гражданина РФ</td>
            <td style={{ padding: "3pt 0" }}>
              {passportSeries} {passportNumber} {passportIssuedBy} {passportIssueDate}
            </td>
          </tr>
          <tr>
            <td style={{ padding: "3pt 0" }}>ИНН</td>
            <td style={{ padding: "3pt 0" }}>{inn}</td>
          </tr>
          <tr>
            <td style={{ padding: "3pt 0" }}>Адрес</td>
            <td style={{ padding: "3pt 0" }}>{address}</td>
          </tr>
          <tr>
            <td style={{ padding: "3pt 0" }}>Телефон</td>
            <td style={{ padding: "3pt 0" }}>{phone}</td>
          </tr>
          <tr>
            <td style={{ padding: "3pt 0" }}>Email</td>
            <td style={{ padding: "3pt 0" }}>{email}</td>
          </tr>
        </tbody>
      </table>

      <div style={{ marginBottom: "16pt", textAlign: "justify" }}>
        Настоящим заявлением подтверждаю, что знакомлен(на) и согласен(на) с положением по предоставлению займов
        в КПК «ЭКСПЕРТ ФИНАНС» ИНН 4307012081, и КПК «ФИН ФОРМУЛА» ИНН 3666209530.
        Согласен(на) с тем, что заявка будет рассматриваться в обеих КПК, кредитором по договору займа может
        выступать одно из КПК, в которые я направляю заявление.
      </div>

      <div style={{ marginBottom: "4pt" }}>
        ___________________________&nbsp;&nbsp;{fullName}
      </div>
      <div style={{ marginBottom: "48pt" }}>{currentDate}</div>

      {/* Разрыв страницы */}
      <div style={{ pageBreakAfter: "always", borderTop: "1px dashed #ccc", margin: "24pt 0" }} />

      <div style={{ textAlign: "center", fontWeight: "bold", marginBottom: "8pt" }}>
        Согласие на получение кредитных отчетов из бюро кредитных историй
      </div>

      <div style={{ marginBottom: "12pt", textAlign: "justify" }}>
        В соответствии с Федеральным законом № 218-ФЗ «О кредитных историях»,
      </div>

      <div style={{ marginBottom: "12pt", textAlign: "justify" }}>
        Я, <b>{fullName}</b>&nbsp; Дата рождения и место рождения {birthDate} {birthPlace}&nbsp;
        Паспорт гражданина РФ {passportSeries} {passportNumber} {passportIssuedBy} {passportIssueDate}
      </div>

      <div style={{ marginBottom: "16pt", textAlign: "justify" }}>
        настоящим даю КПК "Эксперт Финанс" ИНН 4307012081, ООО «Эксперт Финанс» ИНН 6155058420,
        КПК «ФИН ФОРМУЛА» ИНН: 3666209530, ООО "РИА" ИНН:6155092615 свое согласие на получение из любого бюро
        кредитных историй информации / кредитных отчетов обо мне. Согласие дается в целях проверки благонадёжности
        для заключения и исполнения договора займа.
      </div>

      <div style={{ marginBottom: "12pt", textAlign: "justify" }}>
        Данное согласие субъекта кредитной истории считается действительным в течение 6 месяцев со дня его оформления.
        В случае, если в течение указанного срока договор займа (кредита) был заключен, указанное согласие субъекта
        кредитной истории сохраняет силу в течение всего срока действия договора займа (кредита).
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "24pt" }}>
        <tbody>
          <tr>
            <td style={{ width: "40%", paddingTop: "24pt" }}>
              __________________
              <div style={{ fontSize: "9pt", marginTop: "2pt" }}>(подпись)</div>
            </td>
            <td style={{ paddingTop: "24pt" }}>
              ____________________________________________________
              <div style={{ fontSize: "9pt", marginTop: "2pt" }}>(ФИО Полностью)</div>
            </td>
          </tr>
        </tbody>
      </table>

      <div style={{ marginTop: "12pt" }}>{currentDate}</div>
    </div>
  );
}

export function LoanApplicationPrintButton({ item }: Props) {
  const handlePrint = () => {
    const content = document.getElementById("loan-print-content");
    if (!content) return;
    const printWindow = window.open("", "_blank", "width=900,height=700");
    if (!printWindow) return;
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Заявка на займ ${item.application_no || ""}</title>
          <style>
            @page { size: A4; margin: 20mm 20mm 20mm 25mm; }
            body { margin: 0; padding: 0; font-family: "Times New Roman", serif; font-size: 12pt; color: #000; }
            table { width: 100%; border-collapse: collapse; }
            @media print { .no-print { display: none; } }
          </style>
        </head>
        <body>${content.innerHTML}</body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => { printWindow.print(); }, 300);
  };

  return (
    <Button variant="outline" size="sm" onClick={handlePrint} title="Печать заявки">
      <Icon name="Printer" size={15} className="mr-1.5" />
      Печать
    </Button>
  );
}
