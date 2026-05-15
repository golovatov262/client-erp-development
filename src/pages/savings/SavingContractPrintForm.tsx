import { useState } from "react";
import { SavingDetail, MemberDetail, Organization } from "@/lib/api";
import { numToWords } from "@/lib/num-to-words";
import { Button } from "@/components/ui/button";
import Icon from "@/components/ui/icon";
import api from "@/lib/api";
import { buildHtmlDoc, downloadDocx, openPrintWindow } from "@/lib/doc-utils";

type Props = {
  detail: SavingDetail;
  orgs?: Organization[];
};

const ones = ["", "один", "два", "три", "четыре", "пять", "шесть", "семь", "восемь", "девять",
  "десять", "одиннадцать", "двенадцать", "тринадцать", "четырнадцать", "пятнадцать",
  "шестнадцать", "семнадцать", "восемнадцать", "девятнадцать"];
const tens = ["", "", "двадцать", "тридцать", "сорок", "пятьдесят", "шестьдесят", "семьдесят", "восемьдесят", "девяносто"];
const hundreds = ["", "сто", "двести", "триста", "четыреста", "пятьсот", "шестьсот", "семьсот", "восемьсот", "девятьсот"];

function intToWords(n: number): string {
  if (n === 0) return "ноль";
  const parts: string[] = [];
  const thousands = Math.floor(n / 1000);
  const rest = n % 1000;
  if (thousands) {
    if (thousands === 1) parts.push("одна тысяча");
    else if (thousands >= 2 && thousands <= 4) parts.push(`${ones[thousands]} тысячи`);
    else parts.push(`${chunkW(thousands)} тысяч`);
  }
  if (rest) parts.push(chunkW(rest));
  return parts.join(" ").trim();
}

function chunkW(n: number): string {
  const h = Math.floor(n / 100);
  const r = n % 100;
  const t = r >= 20 ? Math.floor(r / 10) : 0;
  const o = r >= 20 ? r % 10 : r;
  const out: string[] = [];
  if (h) out.push(hundreds[h]);
  if (t) out.push(tens[t]);
  if (o) out.push(ones[o]);
  return out.join(" ");
}

function rateToWords(rate: number): string {
  const intPart = Math.floor(rate);
  const fracPart = Math.round((rate - intPart) * 1000);
  const intWords = intToWords(intPart);
  if (!fracPart) return `${capitalize(intWords)} целых`;
  const fracWords = intToWords(fracPart);
  const fracName = fracPart === 1 ? "тысячная" : (fracPart >= 2 && fracPart <= 4 ? "тысячных" : "тысячных");
  const intName = intPart === 1 ? "целая" : (intPart >= 2 && intPart <= 4 ? "целых" : "целых");
  return `${capitalize(intWords)} ${intName} ${fracWords} ${fracName}`;
}

function termMonthsToWords(m: number): string {
  return `${intToWords(m)} ${pluralizeMonth(m)}`;
}
function pluralizeMonth(n: number) {
  const m10 = n % 10, m100 = n % 100;
  if (m100 >= 11 && m100 <= 19) return "месяцев";
  if (m10 === 1) return "месяц";
  if (m10 >= 2 && m10 <= 4) return "месяца";
  return "месяцев";
}
function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function fmtMoney(n: number | null | undefined) {
  if (n == null) return "___________";
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(n);
}
function fmtDateRu(s: string | null | undefined) {
  if (!s) return "___________";
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  return `${String(d.getDate()).padStart(2, "0")} ${monthName(d.getMonth())} ${d.getFullYear()} г.`;
}
function monthName(m: number) {
  return ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"][m];
}
function val(s: string | null | undefined, fallback = "___________") {
  return s?.trim() || fallback;
}

function payoutLabel(p?: string) {
  if (p === "monthly") return "ежемесячно";
  if (p === "end_of_term") return "в конце срока действия договора";
  return "___________";
}

function buildBody(detail: SavingDetail, member: MemberDetail | null, org: Organization | null): string {
  const contractNo = val(detail.contract_no, "___");
  const startDate = fmtDateRu(detail.start_date);
  const endDate = fmtDateRu(detail.end_date);

  const orgName = val(org?.short_name || org?.name);
  const orgFull = val(org?.name);
  const directorPos = val(org?.director_position, "Председателя правления");
  const directorFio = val(org?.director_fio);
  const directorFioShort = directorFio !== "___________" ? shortFio(directorFio) : "___________";
  const orgInn = val(org?.inn);
  const orgKpp = val(org?.kpp);
  const orgOgrn = val(org?.ogrn);
  const orgLegalAddr = val(org?.legal_address);
  const orgActualAddr = val(org?.actual_address || org?.legal_address);
  const orgPhone = val(org?.phone);
  const orgEmail = val(org?.email);
  const orgBank = val(org?.bank_name);
  const orgRs = val(org?.rs);
  const orgKs = val(org?.ks);
  const orgBik = val(org?.bik);
  const cityFromAddr = extractCity(org?.legal_address || "");

  const memberFio = member
    ? [member.last_name, member.first_name, member.middle_name].filter(Boolean).join(" ") || detail.member_name
    : detail.member_name;
  const memberFioShort = memberFio ? shortFio(memberFio) : "___________";
  const memberInn = val(member?.inn);
  const memberAddr = val(member?.registration_address);
  const memberPhone = val(member?.phone);
  const memberEmail = val(member?.email);
  const passport = member
    ? `Паспорт гражданина РФ, серия ${val(member.passport_series, "____")} ${val(member.passport_number, "______")}, выдан ${fmtPassportDate(member.passport_issue_date)} ${val(member.passport_issued_by)}, код подразделения ${val(member.passport_dept_code)}`
    : "Паспорт гражданина РФ ___________";
  const memberBankBik = val(member?.bank_bik);
  const memberBankAccount = val(member?.bank_account);

  const amount = fmtMoney(detail.amount);
  const amountWords = detail.amount != null ? capitalize(numToWords(Number(detail.amount))) : "___________";
  const term = detail.term_months;
  const termWords = term != null ? termMonthsToWords(term) : "___________";
  const rate = detail.rate;
  const rateStr = rate != null ? String(rate).replace(".", ",") : "___";
  const rateWords = rate != null ? rateToWords(rate) : "___________";
  const payout = payoutLabel(detail.payout_type);
  const minPct = detail.min_balance_pct ?? 0;

  return `
<p class="center bold">Договор сбережений № ${contractNo}</p>
<br/>
<table style="margin-bottom:8pt"><tr>
  <td style="width:50%">г. ${cityFromAddr}</td>
  <td style="text-align:right">${startDate}</td>
</tr></table>

<p class="justify">${orgName}, именуемый в дальнейшем «КПК», в лице ${directorPos} ${directorFio}, действующего на основании Устава, с одной стороны и <b>${memberFio}</b>, именуемый в дальнейшем «Пайщик», а вместе именуемые «Стороны», заключили настоящий договор о нижеследующем:</p>

<p class="bold center">1. Предмет договора</p>
<p class="justify">1.1. В силу настоящего Договора Пайщик передает, а КПК принимает денежные средства (далее – Сбережения) в размере и на условиях, предусмотренных настоящим Договором, и обязуется возвратить сумму переданных сбережений и выплатить проценты в соответствии с условиями настоящего Договора.</p>
<p class="justify">1.2. Размер сбережений ${amount} (${amountWords}).</p>
<p class="justify">1.3. Сбережения предоставляются на пополнение денежных активов ${orgName}.</p>
<p class="justify">1.4. Внесение суммы сбережений производится в полном объеме или частями, наличными в кассу КПК или перечислением денежных средств на расчетный счет КПК. Срок полного или частичного внесения денежных средств по договору передачи личных сбережений, с момента его подписания, не должен превышать 3 рабочих дней.</p>
<p class="justify">1.5. Передача денежных средств подтверждается приходным кассовым ордером либо выпиской с расчетного счета КПК.</p>
<p class="justify">1.6. Настоящий договор считается заключенным с момента поступления денежных средств на счет КПК или с момента внесения денежных средств в кассу КПК.</p>
<p class="justify">1.7. Сбережения принимаются на срок ${term ?? "___"} ${term != null ? pluralizeMonth(term) : "месяцев"} (${termWords}) до ${endDate}.</p>
<p class="justify">1.8. Проценты на сумму сбережений устанавливаются в размере ${rateStr} (${rateWords}) % годовых.</p>
<p class="justify">1.9. Удерживается налог на доходы с физических лиц, исчисленных по правилам, установленным Налоговым Кодексом РФ на дату расчета налога.</p>
<p class="justify">1.10. Периодичность начисления и выплаты процентов — ${payout}.</p>
<p class="justify">1.11. Корректировка процентной ставки</p>
<p class="justify">Стороны согласовывают следующий порядок изменения процентной ставки по настоящему договору:</p>
<p class="justify">1.11.1. КПК вправе инициировать пересмотр размера процентной ставки, если наблюдается существенное изменение следующих факторов:</p>
<p class="justify" style="padding-left:20pt">• снижение ключевой ставки Центрального Банка РФ;<br/>• уменьшение среднерыночных ставок по размещению денежных средств КПК;<br/>• превышение процентных расходов КПК над процентными доходами от размещения привлеченных средств.</p>
<p class="justify">1.11.2. Размер новой процентной ставки определяется на основании экономического анализа финансового состояния КПК и рыночной конъюнктуры, при этом:</p>
<p class="justify" style="padding-left:20pt">• изменение ставки производится пропорционально изменению вышеуказанных факторов;<br/>• минимальный размер ставки устанавливается соглашением сторон с учетом экономической целесообразности.</p>
<p class="justify">1.11.3. О предстоящем изменении процентной ставки КПК обязан уведомить Пайщика в письменной форме не позднее чем за 5 (пять) рабочих дней до предполагаемой даты внесения изменений.</p>
<p class="justify">1.11.4. При несогласии с предложенными изменениями Пайщик вправе расторгнуть договор досрочно на условиях, предусмотренных разделом 3 настоящего договора.</p>

<p class="bold center">2. Права и обязанности сторон</p>
<p class="justify">2.1. КПК обязуется:</p>
<p class="justify">2.1.1. По окончании срока договора выплатить Пайщику сумму Сбережений и начисленных процентов через кассу ${orgName} или перечислить на банковский счет, указанный в письменном заявлении, поданном лично за 30 дней до окончания срока договора. Выплаты по договору производятся на усмотрение КПК, через кассу или перечислением на банковский счет Пайщика, в зависимости от остатка лимита денежных средств на дату выплаты.</p>
<p class="justify">2.1.2. При досрочном расторжении договора по инициативе Пайщика выплатить сумму Сбережений и начисленных процентов через кассу ${orgName} (за минусом неустойки) или перечислить на банковский счет, указанный в письменном заявлении, поданном им лично. Перечисление средств производится в течении 30 дней со дня подачи заявления. При прекращении членства в КПК в случаях, предусмотренных пунктами 1 - 3 части 1 статьи 14 190-ФЗ «О кредитной кооперации», пайщику выплачивается сумма сбережений не позднее чем через три месяца со дня подачи заявления о выходе из кредитного кооператива. В иных случаях прекращения членства в КПК, выплаты производятся согласно требованиям части 4 ст. 14 190-ФЗ «О кредитной кооперации». В случае смерти пайщика, выплаты производятся согласно требованиям части 5 ст. 14, 190-ФЗ «О кредитной кооперации». Выплаты по договору производятся на усмотрение КПК, через кассу или перечислением на банковский счет Пайщика, в зависимости от остатка лимита денежных средств на дату выплаты.</p>
<p class="justify">2.1.3. По требованию Пайщика в двухдневный срок выдать справку о движении средств на его лицевом счете.</p>
<p class="justify">2.2. КПК вправе:</p>
<p class="justify">2.2.1. Продлить договор Сбережений на тот же срок, если по окончании договора он не будет истребован в установленном пунктом 2.1.1 порядке.</p>
<p class="justify">2.2.2. При продлении договора в соответствии с пунктом 2.2.1 применить процентную ставку, действующую в ${orgName} по программе «Динамичный доход % в конце срока» на дату продления договора.</p>
<p class="justify">2.3. Пайщик вправе:</p>
<p class="justify">2.3.1. По запросу получить от КПК сведения о движении средств на лицевом счете Пайщика. Выписка предоставляется в течении трех рабочий дней со дня обращения.</p>
<p class="justify">2.3.2. Единовременно, не чаще одного раза в месяц, изымать до ${minPct} % от суммы сбережений на момент изъятия. Выплата средств в соответствие с настоящим пунктом договора производится из кассы КПК по предварительной заявке Пайщика. Способ возврата средств по договору определяется на усмотрение КПК, через кассу или перечислением на банковский счет Пайщика, в зависимости от остатка лимита денежных средств на дату выплаты.</p>
<p class="justify">2.3.3. Вносить средства на увеличение суммы сбережений при условии, что общая сумма сбережений одного лица не превысит 20 процентов фонда финансовой взаимопомощи ${orgName}.</p>

<p class="bold center">3. Ответственность сторон</p>
<p class="justify">3.1. За неисполнение или ненадлежащее исполнение сторонами условий настоящего договора наступает ответственность в соответствии с законодательством РФ.</p>
<p class="justify">3.2. Ни одна из сторон не несет ответственности перед другой стороной за неисполнение обязательств, обусловленное обстоятельствами, возникшими помимо воли и желания сторон, которые нельзя предвидеть или избежать, включая войну, стихийные бедствия и т.п. (форс-мажор).</p>
<p class="justify">3.3. В случае досрочного расторжения договора КПК производит перерасчет начисленных процентов по ставке 1% годовых, а ранее выплаченные либо причисленные путем капитализации проценты сверх пересчитанных удерживаются из суммы остатка сбережений.</p>
<p class="justify">3.4. В случае несвоевременного возврата сбережений КПК уплачивает неустойку в размере 0,01% за каждый день просрочки сверх срока установленного пунктом 1.7.</p>

<p class="bold center">4. Порядок разрешения споров</p>
<p class="justify">4.1. Разногласия, возникающие в процессе выполнения сторонами условий настоящего договора, рассматриваются в предварительном порядке в целях выработки взаимоприемлемых решений.</p>
<p class="justify">4.2. Все вопросы, вытекающие из настоящего договора или относящиеся к нему, которые Стороны не могут урегулировать путем переговоров, передаются на разрешение в суд по месту нахождения КПК.</p>

<p class="bold center">5. Дополнительные условия</p>
<p class="justify">5.1. Стороны обязаны в письменном виде информировать друг друга в течение 10 рабочих дней об изменении своего местонахождения, юридического адреса, банковских реквизитов, а также обо всех других изменениях, имеющих значение для полного и своевременного исполнения обязательств по настоящему Договору.</p>
<p class="justify">5.2. В случае отсутствия у КПК информации о банковском счете Пайщика и отсутствии указаний последнего о перечислении денежных средств на иной счет, договор считается исполненным (расторгнутым) и начисление процентов прекращается с момента письменного уведомления Пайщика. Положение настоящего пункта договора вступает в силу, если в соответствии с п.2.2.1 Пайщик не воспользуется правом на продление договора.</p>
<p class="justify">5.3. Договор составлен в двух экземплярах, имеющих равную юридическую силу, по одному для каждой из Сторон. В случае утраты одной из Сторон своего экземпляра Договора, эта Сторона может потребовать от другой Стороны подписать его дубликат, либо содействия в нотариальном удостоверении дубликата. Все расходы, связанные с восстановлением утерянного экземпляра, несет Сторона, его утратившая. Стороны также согласны, что договор может быть заключен путем составления электронного документа, передаваемого по каналам связи, позволяющими достоверно установить, что документ исходит от стороны по договору и подписанного сторонами, с применением ЭЦП.</p>
<p class="justify">5.4. Подписывая настоящий договор я, ${memberFio}, в соответствии с Федеральным законом от 27 июля 2006 г. № 152-ФЗ «О персональных данных» даю тем самым свое бессрочное (до даты отзыва его мною путем подачи в ${orgName} соответствующего заявления в произвольной форме) согласие на обработку, использование и передачу моих персональных данных (любой информации, относящейся ко мне, в том числе фамилии, имени, отчества, года, месяца, даты и места рождения, адреса, семейного, социального, имущественного положения, образования, профессии, доходов), содержащихся в настоящем договоре, а также в представленных мною документах.</p>
<p class="justify">Я, ${memberFio}, также согласен(на) с получением и проверкой ${orgName} любых данных обо мне в связи с исполнением настоящего договора.</p>

<p class="bold center" style="margin-top:12pt">Адреса, банковские реквизиты, подписи сторон</p>
<table style="border:1px solid #000">
  <tr>
    <td style="width:50%;border-right:1px solid #000;border-bottom:1px solid #000;vertical-align:top">
      <b>${orgName}</b><br/>
      Адрес местонахождения: ${orgLegalAddr}<br/>
      Фактический адрес: ${orgActualAddr}<br/>
      Тел.: ${orgPhone}<br/>
      E-mail: ${orgEmail}<br/>
      ОГРН: ${orgOgrn}<br/>
      ИНН/КПП: ${orgInn}/${orgKpp}<br/>
      Р/с: ${orgRs} в ${orgBank}<br/>
      К/с: ${orgKs}<br/>
      БИК: ${orgBik}
    </td>
    <td style="width:50%;border-bottom:1px solid #000;vertical-align:top">
      <b>Пайщик: ${memberFio}</b><br/>
      Адрес места регистрации: ${memberAddr}<br/>
      Фактический адрес: ${memberAddr}<br/>
      Тел.: ${memberPhone}<br/>
      E-mail: ${memberEmail}<br/>
      ИНН: ${memberInn}<br/>
      ${passport}<br/>
      Р/с: ${memberBankAccount}<br/>
      БИК: ${memberBankBik}
    </td>
  </tr>
  <tr>
    <td style="padding-top:24pt;vertical-align:bottom">
      ${directorPos}:<br/><br/>
      ____________________ ${directorFioShort}<br/>
      МП
    </td>
    <td style="padding-top:24pt;vertical-align:bottom">
      <br/><br/>
      ____________________ ${memberFioShort}
    </td>
  </tr>
</table>
`;
}

function shortFio(fio: string): string {
  const parts = fio.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return `${parts[1].charAt(0)}. ${parts[0]}`;
  return `${parts[0]} ${parts[1].charAt(0)}.${parts[2].charAt(0)}.`;
}

function fmtPassportDate(s: string | null | undefined): string {
  if (!s) return "___________";
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
}

function extractCity(addr: string): string {
  if (!addr) return "___________";
  const m = addr.match(/г\.?\s*([А-ЯЁ][а-яё-]+)/);
  if (m) return m[1];
  const m2 = addr.match(/г\s+([А-ЯЁ][а-яё-]+)/);
  if (m2) return m2[1];
  return "___________";
}

export function SavingContractDocButtons({ detail, orgs }: Props) {
  const [loading, setLoading] = useState(false);

  const loadData = async (): Promise<{ member: MemberDetail | null; org: Organization | null }> => {
    const [memberRes, orgRes] = await Promise.all([
      detail.member_id ? api.members.get(detail.member_id).catch(() => null) : Promise.resolve(null),
      detail.org_id && orgs ? Promise.resolve(orgs.find(o => o.id === detail.org_id) || null) : Promise.resolve(null),
    ]);
    return { member: memberRes, org: orgRes };
  };

  const handlePrint = async () => {
    setLoading(true);
    try {
      const { member, org } = await loadData();
      const title = `Договор сбережений ${detail.contract_no}`;
      openPrintWindow(title, buildBody(detail, member, org));
    } finally {
      setLoading(false);
    }
  };

  const handleDocx = async () => {
    setLoading(true);
    try {
      const { member, org } = await loadData();
      const title = `Договор сбережений ${detail.contract_no}`;
      const html = buildHtmlDoc(title, buildBody(detail, member, org));
      downloadDocx(`Договор_сбережений_${detail.contract_no || "б-н"}.doc`, html);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex gap-2">
      <Button variant="outline" size="sm" onClick={handlePrint} disabled={loading} title="Открыть для печати">
        <Icon name="Printer" size={15} className="mr-1.5" />
        Печать
      </Button>
      <Button variant="outline" size="sm" onClick={handleDocx} disabled={loading} title="Скачать DOCX">
        <Icon name="FileDown" size={15} className="mr-1.5" />
        Скачать DOCX
      </Button>
    </div>
  );
}

export default SavingContractDocButtons;
