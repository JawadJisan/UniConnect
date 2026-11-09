import { RotateCwIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { FormAlert } from '@/components/ui/form-alert';
import { cn } from '@/lib/utils';

interface ErrorStateProps {
  title: ReactNode;
  children?: ReactNode;
  /** Shows a Try again button. */
  onRetry?: () => void;
  retrying?: boolean;
  className?: string;
}

/** A data view that failed to load: what went wrong, and a retry when one can help. */
function ErrorState({ title, children, onRetry, retrying, className }: ErrorStateProps) {
  return (
    <FormAlert tone="error" title={title} className={cn('max-w-xl', className)}>
      {children}
      {onRetry ? (
        <Button
          variant="secondary"
          size="sm"
          className="mt-3"
          onClick={onRetry}
          disabled={retrying}
        >
          <RotateCwIcon data-icon="inline-start" className={cn(retrying && 'animate-spin')} />
          {retrying ? 'Trying again…' : 'Try again'}
        </Button>
      ) : null}
    </FormAlert>
  );
}

export { ErrorState };
