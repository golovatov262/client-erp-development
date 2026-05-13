import React, { useCallback } from "react";
import DadataSuggest, { DadataSuggestProps } from "@/components/ui/dadata-suggest";
import dadata, { DadataFmsUnitSuggestion } from "@/lib/dadata";
import Icon from "@/components/ui/icon";

const DadataFmsSuggest = DadataSuggest as React.FC<DadataSuggestProps<DadataFmsUnitSuggestion>>;

interface PassportCodeInputProps {
  value: string;
  onChange: (value: string) => void;
  onIssuedByChange?: (value: string) => void;
  placeholder?: string;
  className?: string;
}

function formatCode(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 6);
  if (digits.length <= 3) return digits;
  return digits.slice(0, 3) + "-" + digits.slice(3);
}

const PassportCodeInput = ({ value, onChange, onIssuedByChange, placeholder = "000-000", className }: PassportCodeInputProps) => {
  const handleSelect = useCallback(
    (item: DadataFmsUnitSuggestion) => {
      if (item.data?.code) onChange(item.data.code);
      if (item.data?.name && onIssuedByChange) onIssuedByChange(item.data.name);
    },
    [onChange, onIssuedByChange]
  );

  const handleChange = useCallback(
    (val: string) => {
      onChange(formatCode(val));
    },
    [onChange]
  );

  return (
    <DadataFmsSuggest
      value={value}
      onChange={handleChange}
      onSelect={handleSelect}
      fetchSuggestions={(q) => dadata.suggestFmsUnit(q)}
      getSuggestionValue={(item) => item.data?.code || item.value}
      renderSuggestion={(item) => (
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-2">
            <Icon name="FileText" size={12} className="text-muted-foreground shrink-0" />
            <span className="font-medium text-xs">{item.data?.code}</span>
          </div>
          <span className="text-xs text-muted-foreground leading-tight">{item.data?.name || item.value}</span>
        </div>
      )}
      placeholder={placeholder}
      className={className}
      minChars={2}
    />
  );
};

export default PassportCodeInput;
