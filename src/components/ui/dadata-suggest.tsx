import { useState, useRef, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import Icon from "@/components/ui/icon";

export interface DadataSuggestProps<T> {
  value: string;
  onChange: (value: string) => void;
  onSelect?: (item: T) => void;
  fetchSuggestions: (query: string) => Promise<{ suggestions: T[] }>;
  renderSuggestion: (item: T) => React.ReactNode;
  getSuggestionValue: (item: T) => string;
  placeholder?: string;
  className?: string;
  minChars?: number;
  debounceMs?: number;
}

function DadataSuggest<T>({
  value,
  onChange,
  onSelect,
  fetchSuggestions,
  renderSuggestion,
  getSuggestionValue,
  placeholder,
  className,
  minChars = 2,
  debounceMs = 300,
}: DadataSuggestProps<T>) {
  const [suggestions, setSuggestions] = useState<T[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [focused, setFocused] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  const wrapRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef(false);

  const doFetch = useCallback(
    (q: string) => {
      if (q.length < minChars) {
        setSuggestions([]);
        setOpen(false);
        return;
      }
      setLoading(true);
      fetchSuggestions(q)
        .then((res) => {
          if (res.suggestions) {
            setSuggestions(res.suggestions);
            setOpen(res.suggestions.length > 0);
          }
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    },
    [fetchSuggestions, minChars]
  );

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    selectedRef.current = false;
    onChange(v);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => doFetch(v), debounceMs);
  };

  const handleSelect = (item: T) => {
    selectedRef.current = true;
    const val = getSuggestionValue(item);
    onChange(val);
    onSelect?.(item);
    setOpen(false);
    setSuggestions([]);
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div ref={wrapRef} className="relative">
      <input
        type="text"
        value={value}
        onChange={handleChange}
        onFocus={() => {
          setFocused(true);
          if (suggestions.length > 0 && !selectedRef.current) setOpen(true);
        }}
        onBlur={() => setFocused(false)}
        placeholder={placeholder}
        className={cn(
          "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          loading && "pr-9",
          className
        )}
      />
      {loading && focused && (
        <div className="absolute right-3 top-1/2 -translate-y-1/2">
          <Icon name="Loader2" size={14} className="animate-spin text-muted-foreground" />
        </div>
      )}
      {open && suggestions.length > 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-lg max-h-60 overflow-y-auto">
          {suggestions.map((item, i) => (
            <button
              key={i}
              type="button"
              className="w-full px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground cursor-pointer transition-colors border-b last:border-0"
              onMouseDown={(e) => {
                e.preventDefault();
                handleSelect(item);
              }}
            >
              {renderSuggestion(item)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default DadataSuggest;