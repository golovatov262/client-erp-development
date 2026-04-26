import { forwardRef, useRef, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type MaskedInputProps = Omit<React.ComponentProps<typeof Input>, "onChange" | "value"> & {
  mask: string;
  value: string;
  onChange: (value: string) => void;
};

function applyMask(raw: string, mask: string): string {
  const digits = raw.replace(/\D/g, "");
  let result = "";
  let di = 0;
  for (let i = 0; i < mask.length && di < digits.length; i++) {
    if (mask[i] === "9") {
      result += digits[di++];
    } else {
      result += mask[i];
      if (mask[i + 1] === "9" && digits[di] === mask[i]) {
        // skip if user typed the literal char
      }
    }
  }
  return result;
}

function stripMask(masked: string): string {
  return masked.replace(/\D/g, "");
}

const MaskedInput = forwardRef<HTMLInputElement, MaskedInputProps>(
  ({ mask, value, onChange, className, ...props }, ref) => {
    const internalRef = useRef<HTMLInputElement>(null);
    const inputRef = (ref as React.RefObject<HTMLInputElement>) || internalRef;

    const displayValue = applyMask(value || "", mask);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = stripMask(e.target.value);
      onChange(raw);
    };

    return (
      <Input
        ref={inputRef}
        value={displayValue}
        onChange={handleChange}
        className={cn(className)}
        {...props}
      />
    );
  }
);

MaskedInput.displayName = "MaskedInput";
export default MaskedInput;
