const ones = ["", "один", "два", "три", "четыре", "пять", "шесть", "семь", "восемь", "девять",
  "десять", "одиннадцать", "двенадцать", "тринадцать", "четырнадцать", "пятнадцать",
  "шестнадцать", "семнадцать", "восемнадцать", "девятнадцать"];
const onesF = ["", "одна", "две", "три", "четыре", "пять", "шесть", "семь", "восемь", "девять",
  "десять", "одиннадцать", "двенадцать", "тринадцать", "четырнадцать", "пятнадцать",
  "шестнадцать", "семнадцать", "восемнадцать", "девятнадцать"];
const tens = ["", "", "двадцать", "тридцать", "сорок", "пятьдесят", "шестьдесят", "семьдесят", "восемьдесят", "девяносто"];
const hundreds = ["", "сто", "двести", "триста", "четыреста", "пятьсот", "шестьсот", "семьсот", "восемьсот", "девятьсот"];

function pluralize(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 19) return many;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}

function chunk(n: number, feminine: boolean): string {
  const h = Math.floor(n / 100);
  const rest = n % 100;
  const t = rest >= 20 ? Math.floor(rest / 10) : 0;
  const o = rest >= 20 ? rest % 10 : rest;
  const parts: string[] = [];
  if (h) parts.push(hundreds[h]);
  if (t) parts.push(tens[t]);
  if (o) parts.push(feminine ? onesF[o] : ones[o]);
  return parts.join(" ");
}

export function numToWords(n: number): string {
  if (n === 0) return "ноль рублей 00 копеек";
  const intPart = Math.floor(n);
  const kopPart = Math.round((n - intPart) * 100);

  const billions = Math.floor(intPart / 1_000_000_000);
  const millions = Math.floor((intPart % 1_000_000_000) / 1_000_000);
  const thousands = Math.floor((intPart % 1_000_000) / 1_000);
  const remainder = intPart % 1_000;

  const parts: string[] = [];

  if (billions) {
    parts.push(chunk(billions, false));
    parts.push(pluralize(billions % 10, "миллиард", "миллиарда", "миллиардов"));
  }
  if (millions) {
    parts.push(chunk(millions, false));
    parts.push(pluralize(millions % 10, "миллион", "миллиона", "миллионов"));
  }
  if (thousands) {
    parts.push(chunk(thousands, true));
    parts.push(pluralize(thousands % 10, "тысяча", "тысячи", "тысяч"));
  }
  if (remainder) {
    parts.push(chunk(remainder, false));
  }

  const rub = pluralize(intPart % 10, "рубль", "рубля", "рублей");
  const mod100 = intPart % 100;
  const rublWord = (mod100 >= 11 && mod100 <= 19) ? "рублей" : rub;

  const kopStr = kopPart.toString().padStart(2, "0");
  const kopWord = pluralize(kopPart % 10, "копейка", "копейки", "копеек");
  const mod100k = kopPart % 100;
  const kopWordFinal = (mod100k >= 11 && mod100k <= 19) ? "копеек" : kopWord;

  return `${parts.join(" ")} ${rublWord} ${kopStr} ${kopWordFinal}`;
}

export default numToWords;
