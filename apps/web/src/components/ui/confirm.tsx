'use client';

import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { Modal } from './modal';
import { Button } from './button';

interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  destructive?: boolean;
}

interface ConfirmContextValue {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

const ConfirmContext = createContext<ConfirmContextValue>({
  confirm: () => Promise.resolve(false),
});

export function useConfirm() {
  return useContext(ConfirmContext);
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{
    options: ConfirmOptions;
    resolve: (value: boolean) => void;
  } | null>(null);

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>(resolve => {
      setState({ options, resolve });
    });
  }, []);

  function handleClose(result: boolean) {
    state?.resolve(result);
    setState(null);
  }

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      <Modal
        open={!!state}
        onClose={() => handleClose(false)}
        title={state?.options.title || ''}
      >
        <p className="text-sm text-muted-foreground mb-6">
          {state?.options.message}
        </p>
        <div className="flex gap-3 justify-end">
          <Button variant="ghost" onClick={() => handleClose(false)}>
            Cancel
          </Button>
          <Button
            variant={state?.options.destructive ? 'destructive' : 'primary'}
            onClick={() => handleClose(true)}
          >
            {state?.options.confirmLabel || 'Confirm'}
          </Button>
        </div>
      </Modal>
    </ConfirmContext.Provider>
  );
}
