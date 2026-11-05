import * as React from 'react';
import { cn } from '@/lib/utils';

export interface SwitchProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onChange' | 'role'> {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}

/**
 * Interruptor liga e desliga no visual do shadcn/ui, num botão nativo com
 * role="switch" (Espaço e Enter alternam; o leitor de tela anuncia o estado
 * por aria-checked). Sem o pacote do Radix: é só um botão.
 */
const Switch = React.forwardRef<HTMLButtonElement, SwitchProps>(({ checked, onCheckedChange, className, onClick, ...props }, ref) => (
  <button
    ref={ref}
    type="button"
    role="switch"
    aria-checked={checked}
    data-state={checked ? 'checked' : 'unchecked'}
    onClick={(event) => {
      onClick?.(event);
      if (!event.defaultPrevented) onCheckedChange(!checked);
    }}
    className={cn(
      'peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50',
      checked ? 'bg-primary' : 'bg-input',
      className,
    )}
    {...props}
  >
    <span
      aria-hidden
      className={cn(
        'pointer-events-none block size-4 rounded-full bg-background shadow-md ring-0 transition-transform motion-reduce:transition-none',
        checked ? 'translate-x-4' : 'translate-x-0',
      )}
    />
  </button>
));
Switch.displayName = 'Switch';

export { Switch };
