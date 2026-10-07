import funcUrls from "../../backend/func2url.json";

const API_URL = new URL(funcUrls.api, window.location.origin).toString();

function getStaffToken(): string {
  return localStorage.getItem("staff_token") || "";
}

async function dadataRequest<T>(action: string, query: string, extra?: Record<string, string>): Promise<T> {
  const hdrs: Record<string, string> = { "Content-Type": "application/json" };
  const token = getStaffToken();
  if (token) hdrs["X-Auth-Token"] = token;

  const res = await fetch(API_URL, {
    method: "POST",
    headers: hdrs,
    body: JSON.stringify({ entity: "dadata", action, query, ...extra }),
  });
  return res.json();
}

export interface DadataAddressSuggestion {
  value: string;
  unrestricted_value: string;
  data: { postal_code?: string; region_with_type?: string; city_with_type?: string; street_with_type?: string; house?: string };
}

export interface DadataFmsUnitSuggestion {
  value: string;
  data: { code?: string; name?: string; type?: string };
}

export interface DadataPartySuggestion {
  value: string;
  data: {
    inn?: string;
    ogrn?: string;
    kpp?: string;
    name?: { full_with_opf?: string; short_with_opf?: string };
    management?: { name?: string; post?: string };
    address?: { unrestricted_value?: string; value?: string };
    phones?: { value?: string }[];
    emails?: { value?: string }[];
  };
}

export const dadata = {
  suggestAddress: (query: string) =>
    dadataRequest<{ suggestions: DadataAddressSuggestion[] }>("address", query),

  suggestFmsUnit: (query: string) =>
    dadataRequest<{ suggestions: DadataFmsUnitSuggestion[] }>("fms_unit", query),

  suggestParty: (query: string) =>
    dadataRequest<{ suggestions: DadataPartySuggestion[] }>("party", query),
};

export default dadata;
