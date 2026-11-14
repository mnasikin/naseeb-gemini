import { useRef, type KeyboardEvent } from 'react';

export const PIN_LENGTH = 6;

export function PinInput({ digits, onChange, disabled }: {
  digits: string[];
  onChange: (digits: string[]) => void;
  disabled: boolean;
}) {
  const inputs = useRef<Array<HTMLInputElement | null>>([]);

  function updateDigit(index: number, value: string) {
    if (!/^[0-9]?$/.test(value)) return;
    const next = [...digits];
    next[index] = value;
    onChange(next);
    if (value) inputs.current[index + 1]?.focus();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>, index: number) {
    if (event.key === 'Backspace' && !digits[index] && index > 0) {
      event.preventDefault();
      updateDigit(index - 1, '');
      inputs.current[index - 1]?.focus();
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      const next = inputs.current[index + (event.key === 'ArrowLeft' ? -1 : 1)];
      if (next) {
        event.preventDefault();
        next.focus();
      }
    }
  }

  return (
    <fieldset disabled={disabled}>
      <legend className="text-sm font-medium">PIN 6 angka</legend>
      <div className="mt-1 grid grid-cols-6 gap-2">
        {digits.map((digit, index) => (
          <input
            key={index}
            ref={(input) => { inputs.current[index] = input; }}
            aria-label={`Digit PIN ${index + 1}`}
            type="password"
            inputMode="numeric"
            autoComplete="off"
            pattern="[0-9]"
            maxLength={1}
            required
            value={digit}
            onFocus={(event) => event.currentTarget.select()}
            onClick={(event) => event.currentTarget.select()}
            onChange={(event) => updateDigit(index, event.target.value)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            onPaste={(event) => {
              event.preventDefault();
              const pasted = event.clipboardData.getData('text').replace(/[^0-9]/g, '').slice(0, PIN_LENGTH);
              if (!pasted) return;
              const start = pasted.length === PIN_LENGTH ? 0 : index;
              const next = [...digits];
              Array.from(pasted.slice(0, PIN_LENGTH - start)).forEach((value, offset) => {
                next[start + offset] = value;
              });
              onChange(next);
              inputs.current[Math.min(start + pasted.length, PIN_LENGTH - 1)]?.focus();
            }}
            className="min-h-11 w-full min-w-0 rounded-lg border border-slate-300 text-center font-mono text-base focus-visible:outline-2 focus-visible:outline-blue-600 disabled:opacity-50"
          />
        ))}
      </div>
    </fieldset>
  );
}
