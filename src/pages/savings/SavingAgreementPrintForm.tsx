import { useState } from "react";
import { SavingDetail, MemberDetail, Organization } from "@/lib/api";
import { Button } from "@/components/ui/button";
import Icon from "@/components/ui/icon";
import api from "@/lib/api";
import { buildHtmlDoc, downloadDocx } from "@/lib/doc-utils";

type Props = {
  detail: SavingDetail;
  orgs?: Organization[];
};

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
function fmtDateShort(s: string | null | undefined) {
  if (!s) return "___________";
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
}
function monthName(m: number) {
  return ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"][m];
}
function val(s: string | null | undefined, fallback = "___________") {
  return s?.trim() || fallback;
}

function declinePositionGen(position: string): string {
  if (!position || position === "___________") return position;
  const map: Record<string, string> = {
    "председатель правления": "председателя правления",
    "председатель": "председателя",
    "генеральный директор": "генерального директора",
    "директор": "директора",
    "исполнительный директор": "исполнительного директора",
    "руководитель": "руководителя",
    "президент": "президента",
    "управляющий": "управляющего",
  };
  const lower = position.trim().toLowerCase();
  if (map[lower]) return map[lower];
  return position
    .trim()
    .split(/\s+/)
    .map((w) => {
      const lw = w.toLowerCase();
      if (lw.endsWith("ый") || lw.endsWith("ий")) return w.slice(0, -2) + "ого";
      if (lw.endsWith("ой")) return w.slice(0, -2) + "ого";
      if (lw.endsWith("ь")) return w.slice(0, -1) + "я";
      if (lw.endsWith("тор") || lw.endsWith("ент") || lw.endsWith("дент")) return w + "а";
      if (lw.endsWith("щий")) return w.slice(0, -2) + "его";
      return w;
    })
    .join(" ");
}

function declineFioGen(fio: string): string {
  if (!fio || fio === "___________") return fio;
  return fio.trim().split(/\s+/).map(declineWordGen).join(" ");
}

function declineWordGen(w: string): string {
  if (!w) return w;
  const lw = w.toLowerCase();
  const isFemale = lw.endsWith("а") || lw.endsWith("я") || lw.endsWith("ова") || lw.endsWith("ева") || lw.endsWith("ина");
  if (lw.endsWith("ий")) return w.slice(0, -2) + "ого";
  if (lw.endsWith("ый")) return w.slice(0, -2) + "ого";
  if (lw.endsWith("ой")) return w.slice(0, -2) + "ого";
  if (lw.endsWith("ова") || lw.endsWith("ева") || lw.endsWith("ина")) return w.slice(0, -1) + "ой";
  if (lw.endsWith("ская") || lw.endsWith("цкая")) return w.slice(0, -2) + "ой";
  if (lw.endsWith("ая")) return w.slice(0, -2) + "ой";
  if (lw.endsWith("яя")) return w.slice(0, -2) + "ей";
  if (isFemale && lw.endsWith("а")) return w.slice(0, -1) + "ы";
  if (isFemale && lw.endsWith("я")) return w.slice(0, -1) + "и";
  if (lw.endsWith("ь")) return w.slice(0, -1) + "я";
  if (lw.endsWith("й")) return w.slice(0, -1) + "я";
  if (lw.endsWith("а")) return w.slice(0, -1) + "ы";
  if (lw.endsWith("я")) return w.slice(0, -1) + "и";
  if (/[бвгджзйклмнпрстфхцчшщ]$/i.test(w)) return w + "а";
  return w;
}

function shortFio(fio: string): string {
  const parts = fio.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return `${parts[1].charAt(0)}. ${parts[0]}`;
  return `${parts[0]} ${parts[1].charAt(0)}.${parts[2].charAt(0)}.`;
}

function extractCity(addr: string): string {
  if (!addr) return "___________";
  const m = addr.match(/г\.?\s*([А-ЯЁ][а-яё-]+)/);
  if (m) return m[1];
  const m2 = addr.match(/г\s+([А-ЯЁ][а-яё-]+)/);
  if (m2) return m2[1];
  return "___________";
}

function pluralizeMonth(n: number) {
  const m10 = n % 10, m100 = n % 100;
  if (m100 >= 11 && m100 <= 19) return "месяцев";
  if (m10 === 1) return "месяц";
  if (m10 >= 2 && m10 <= 4) return "месяца";
  return "месяцев";
}

type ChangeInfo = {
  hasRateChange: boolean;
  oldRate: number | null;
  newRate: number | null;
  rateEffectiveDate: string | null;
  hasTermChange: boolean;
  oldTerm: number | null;
  newTerm: number | null;
  termEffectiveDate: string | null;
  newEndDate: string | null;
};

function detectChanges(detail: SavingDetail): ChangeInfo {
  const info: ChangeInfo = {
    hasRateChange: false, oldRate: null, newRate: null, rateEffectiveDate: null,
    hasTermChange: false, oldTerm: null, newTerm: null, termEffectiveDate: null,
    newEndDate: null,
  };
  if (detail.rate_changes && detail.rate_changes.length > 0) {
    const sorted = [...detail.rate_changes].sort(
      (a, b) => new Date(b.effective_date).getTime() - new Date(a.effective_date).getTime()
    );
    const last = sorted[0];
    info.hasRateChange = true;
    info.oldRate = Number(last.old_rate);
    info.newRate = Number(last.new_rate);
    info.rateEffectiveDate = last.effective_date;
  }
  const termTx = (detail.transactions || []).filter(t => t.transaction_type === "term_change");
  if (termTx.length > 0) {
    const sorted = [...termTx].sort(
      (a, b) => new Date(b.transaction_date).getTime() - new Date(a.transaction_date).getTime()
    );
    const last = sorted[0];
    info.hasTermChange = true;
    info.termEffectiveDate = last.transaction_date;
    info.newTerm = detail.term_months;
    info.newEndDate = detail.end_date;
    const m = (last.description || "").match(/(\d+)\s*[→\->]+\s*(\d+)/);
    if (m) {
      info.oldTerm = Number(m[1]);
      info.newTerm = Number(m[2]);
    }
  }
  return info;
}

export function hasContractChanges(detail: SavingDetail): boolean {
  const info = detectChanges(detail);
  return info.hasRateChange || info.hasTermChange;
}

function buildBody(detail: SavingDetail, member: MemberDetail | null, org: Organization | null, changes: ChangeInfo): string {
  const contractNo = val(detail.contract_no, "___");
  const contractStartDate = fmtDateRu(detail.start_date);
  const today = new Date();
  const todayStr = fmtDateRu(today.toISOString().slice(0, 10));

  const orgName = val(org?.short_name || org?.name);
  const directorPos = val(org?.director_position, "Председателя правления");
  const directorFio = val(org?.director_fio);
  const directorFioShort = directorFio !== "___________" ? shortFio(directorFio) : "___________";
  const cityFromAddr = extractCity(org?.legal_address || "");

  const memberFio = member
    ? [member.last_name, member.first_name, member.middle_name].filter(Boolean).join(" ") || detail.member_name
    : detail.member_name;
  const memberFioShort = memberFio ? shortFio(memberFio) : "___________";

  const effectiveDate = changes.rateEffectiveDate || changes.termEffectiveDate || today.toISOString().slice(0, 10);
  const effectiveDateRu = fmtDateRu(effectiveDate);

  const items: string[] = [];
  let n = 1;

  if (changes.hasRateChange) {
    items.push(
      `<p class="justify">${n}. Изложить пункт 1.8 Договора в следующей редакции: «Доход на паевые взносы устанавливается в размере <b>${changes.newRate}% годовых</b> согласно действующих тарифов Организации согласно Приложения № 1 к Положению о порядке формирования и использования имущества потребительского кооператива корпоративного обслуживания «Эксперт Финанс».</p>`
    );
    items.push(
      `<p class="justify">${n + 1}. Изменение процентной ставки вступает в силу с ${fmtDateRu(changes.rateEffectiveDate)}. ` +
      `Ранее действовавшая ставка: ${changes.oldRate}% годовых. Новая ставка: <b>${changes.newRate}% годовых</b>.</p>`
    );
    n += 2;
  }

  if (changes.hasTermChange) {
    const newTerm = changes.newTerm ?? detail.term_months;
    const newEnd = changes.newEndDate || detail.end_date;
    items.push(
      `<p class="justify">${n}. Изложить пункт 1.7 Договора в следующей редакции: «Паевой взнос принимается на срок <b>${newTerm} ${pluralizeMonth(newTerm)}</b> до ${fmtDateRu(newEnd)}».</p>`
    );
    if (changes.oldTerm != null) {
      items.push(
        `<p class="justify">${n + 1}. Срок действия Договора продлевается. Ранее установленный срок: ${changes.oldTerm} ${pluralizeMonth(changes.oldTerm)}. Новый срок: <b>${newTerm} ${pluralizeMonth(newTerm)}</b>. Новая дата окончания договора: <b>${fmtDateRu(newEnd)}</b>.</p>`
      );
      n += 2;
    } else {
      items.push(
        `<p class="justify">${n + 1}. Новая дата окончания договора: <b>${fmtDateRu(newEnd)}</b>.</p>`
      );
      n += 2;
    }
  }

  items.push(
    `<p class="justify">${n}. Остальные условия Договора паевого счета № ${contractNo} от ${contractStartDate}, не затронутые настоящим Дополнительным соглашением, остаются без изменений и обязательны для исполнения Сторонами.</p>`
  );
  items.push(
    `<p class="justify">${n + 1}. Настоящее Дополнительное соглашение вступает в силу с ${effectiveDateRu} и является неотъемлемой частью Договора паевого счета № ${contractNo} от ${contractStartDate}.</p>`
  );
  items.push(
    `<p class="justify">${n + 2}. Настоящее Дополнительное соглашение составлено в двух экземплярах, имеющих равную юридическую силу, по одному для каждой из Сторон.</p>`
  );

  return `
<style>
  @page { size: 210mm 297mm; margin: 15mm 15mm 15mm 20mm; }
  body, p, td, table { font-size: 11pt; line-height: 1.2; }
  p { margin: 3pt 0; }
  .center { text-align: center; }
  .bold { font-weight: bold; }
  .justify { text-align: justify; }
  table { border-collapse: collapse; width: 100%; }
  td { padding: 3pt 4pt; vertical-align: top; }
</style>
<p class="center bold">Дополнительное соглашение</p>
<p class="center bold">к Договору паевого счета № ${contractNo} от ${contractStartDate}</p>
<table style="margin: 8pt 0"><tr>
  <td style="width:50%">г. ${cityFromAddr}</td>
  <td style="text-align:right">${todayStr}</td>
</tr></table>

<p class="justify">${orgName}, именуемый в дальнейшем «Организация», в лице ${declinePositionGen(directorPos)} ${declineFioGen(directorFio)}, действующего на основании Устава, с одной стороны и <b>${memberFio}</b>, именуемый в дальнейшем «Пайщик», а вместе именуемые «Стороны», заключили настоящее Дополнительное соглашение к Договору паевого счета № ${contractNo} от ${contractStartDate} (далее — Договор) о нижеследующем:</p>

${items.join("\n")}

<p class="justify" style="margin-top:10pt">Текущие параметры паевого счета на дату заключения настоящего Дополнительного соглашения:</p>
<table style="border:1px solid #000; margin-top:4pt">
  <tr>
    <td style="border:1px solid #000;width:50%">Сумма паевого взноса:</td>
    <td style="border:1px solid #000">${fmtMoney(detail.amount)} руб.</td>
  </tr>
  <tr>
    <td style="border:1px solid #000">Текущий баланс:</td>
    <td style="border:1px solid #000">${fmtMoney(detail.current_balance)} руб.</td>
  </tr>
  <tr>
    <td style="border:1px solid #000">Дата окончания договора:</td>
    <td style="border:1px solid #000">${fmtDateShort(detail.end_date)}</td>
  </tr>
</table>

<p class="bold center" style="margin-top:14pt">Подписи Сторон</p>
<table style="border:1px solid #000">
  <tr>
    <td style="width:50%;border-right:1px solid #000;vertical-align:bottom;padding-top:24pt">
      <b>Организация:</b><br/>
      ${directorPos}:<br/>
      ____________________ ${directorFioShort}<br/>
      МП
    </td>
    <td style="width:50%;vertical-align:bottom;padding-top:24pt">
      <b>Пайщик:</b><br/>
      <br/>
      ____________________ ${memberFioShort}
    </td>
  </tr>
</table>
`;
}

async function loadAgreementData(detail: SavingDetail, orgs?: Organization[]): Promise<{ member: MemberDetail | null; org: Organization | null }> {
  const [memberRes, orgRes] = await Promise.all([
    detail.member_id ? api.members.get(detail.member_id).catch(() => null) : Promise.resolve(null),
    detail.org_id && orgs ? Promise.resolve(orgs.find(o => o.id === detail.org_id) || null) : Promise.resolve(null),
  ]);
  return { member: memberRes, org: orgRes };
}

export async function downloadAgreementDocx(detail: SavingDetail, orgs?: Organization[]) {
  const changes = detectChanges(detail);
  if (!changes.hasRateChange && !changes.hasTermChange) return;
  const { member, org } = await loadAgreementData(detail, orgs);
  const title = `Доп. соглашение к договору ${detail.contract_no}`;
  const html = buildHtmlDoc(title, buildBody(detail, member, org, changes));
  downloadDocx(`Доп_соглашение_${detail.contract_no || "б-н"}.doc`, html);
}

export function SavingAgreementDocButtons({ detail, orgs }: Props) {
  const [loading, setLoading] = useState(false);

  const changes = detectChanges(detail);
  if (!changes.hasRateChange && !changes.hasTermChange) return null;

  const handleDocx = async () => {
    setLoading(true);
    try {
      await downloadAgreementDocx(detail, orgs);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Button variant="outline" size="sm" onClick={handleDocx} disabled={loading} title="Скачать доп. соглашение DOCX">
        <Icon name="FileDown" size={15} className="mr-1.5" />
        Доп. соглашение DOCX
      </Button>
    </>
  );
}

export default SavingAgreementDocButtons;