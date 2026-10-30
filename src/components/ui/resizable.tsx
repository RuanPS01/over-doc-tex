import { GripVertical } from 'lucide-react';
import type * as React from 'react';
import { Group, Panel, Separator } from 'react-resizable-panels';
import { cn } from '@/lib/utils';

const ResizablePanelGroup = ({ className, ...props }: React.ComponentProps<typeof Group>) => (
  <Group className={cn('flex h-full w-full', className)} {...props} />
);

const ResizablePanel = Panel;

const ResizableHandle = ({
  withHandle,
  className,
  ...props
}: React.ComponentProps<typeof Separator> & { withHandle?: boolean }) => (
  <Separator
    className={cn(
      'relative flex w-px items-center justify-center bg-border transition-colors',
      // Área de toque maior que a linha visível.
      'after:absolute after:inset-y-0 after:left-1/2 after:w-2 after:-translate-x-1/2',
      'hover:bg-primary/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
      className,
    )}
    {...props}
  >
    {withHandle && (
      <div className="z-10 flex h-5 w-3 items-center justify-center rounded-sm border bg-border">
        <GripVertical className="size-2.5" />
      </div>
    )}
  </Separator>
);

export { ResizableHandle, ResizablePanel, ResizablePanelGroup };
