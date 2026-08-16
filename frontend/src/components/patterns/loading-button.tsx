import { LoaderCircle } from "lucide-react";

import { Button, type ButtonProps } from "../ui/button";

interface LoadingButtonProps extends ButtonProps {
  loading?: boolean;
}

export function LoadingButton({ loading = false, disabled, children, ...props }: LoadingButtonProps) {
  return (
    <Button disabled={disabled || loading} aria-busy={loading || undefined} {...props}>
      {loading && <LoaderCircle className="animate-spin" size={15} aria-hidden="true" />}
      {children}
    </Button>
  );
}
