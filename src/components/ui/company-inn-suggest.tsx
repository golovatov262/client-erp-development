import { useCallback } from "react";
import DadataSuggest from "@/components/ui/dadata-suggest";
import dadata, { DadataPartySuggestion } from "@/lib/dadata";
import Icon from "@/components/ui/icon";

export interface CompanySelectData {
  inn: string;
  company_name: string;
  director_fio: string;
  director_phone: string;
  ogrn?: string;
  kpp?: string;
  address?: string;
  email?: string;
  director_post?: string;
}

interface CompanyInnSuggestProps {
  value: string;
  onChange: (value: string) => void;
  onCompanySelect?: (data: CompanySelectData) => void;
  placeholder?: string;
  className?: string;
}

const CompanyInnSuggest = ({ value, onChange, onCompanySelect, placeholder = "Введите ИНН или название", className }: CompanyInnSuggestProps) => {
  const handleSelect = useCallback(
    (item: DadataPartySuggestion) => {
      const d = item.data;
      onChange(d?.inn || "");
      onCompanySelect?.({
        inn: d?.inn || "",
        company_name: d?.name?.short_with_opf || d?.name?.full_with_opf || item.value,
        director_fio: d?.management?.name || "",
        director_phone: "",
        ogrn: d?.ogrn || "",
        kpp: d?.kpp || "",
        address: d?.address?.unrestricted_value || d?.address?.value || "",
        email: d?.emails?.[0]?.value || "",
        director_post: d?.management?.post || "",
      });
    },
    [onChange, onCompanySelect]
  );

  return (
    <DadataSuggest<DadataPartySuggestion>
      value={value}
      onChange={onChange}
      onSelect={handleSelect}
      fetchSuggestions={(q) => dadata.suggestParty(q)}
      getSuggestionValue={(item) => item.data?.inn || item.value}
      renderSuggestion={(item) => (
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-2">
            <Icon name="Building2" size={13} className="text-muted-foreground shrink-0" />
            <span className="font-medium text-xs">{item.data?.name?.short_with_opf || item.value}</span>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            {item.data?.inn && <span>ИНН {item.data.inn}</span>}
            {item.data?.management?.name && <span>{item.data.management.name}</span>}
          </div>
          {item.data?.address?.value && (
            <span className="text-xs text-muted-foreground/70 leading-tight truncate">{item.data.address.value}</span>
          )}
        </div>
      )}
      placeholder={placeholder}
      className={className}
      minChars={2}
    />
  );
};

export default CompanyInnSuggest;