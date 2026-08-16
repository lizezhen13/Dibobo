import type { ErrorInfo, ReactNode } from "react";
import { Component } from "react";

import { Button } from "./ui/button";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Prevents one failed lazy chunk or render path from leaving the whole shell blank.
 * Reloading is intentional: it also refreshes a stale chunk after a deployment.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.error("Dibobo render error", error, errorInfo);
    }
  }

  private handleReload = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <main className="grid min-h-screen place-items-center bg-background px-6 py-12 text-center">
        <section role="alert" className="max-w-md rounded-2xl border border-danger/30 bg-card p-8 shadow-dialog">
          <p className="font-mono text-xs tracking-[0.16em] text-danger">RENDER ERROR</p>
          <h1 className="mt-3 text-2xl font-semibold">页面暂时无法加载</h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            当前视图遇到未预期错误。重新加载页面通常可以恢复，也会同步最新的前端资源。
          </p>
          <Button type="button" className="mt-6" onClick={this.handleReload}>
            重新加载
          </Button>
        </section>
      </main>
    );
  }
}
