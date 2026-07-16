import { Component, type ErrorInfo, type ReactNode } from 'react';
import { logError } from '../lib/debug';

interface Props {
  children: ReactNode;
}
interface State {
  error: Error | null;
}

/** Catches render-time crashes, logs them to the debug store, and shows a
 *  minimal recover screen instead of a white page. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    logError('react', error.message, `${error.stack ?? ''}\n\nComponent stack:${info.componentStack ?? ''}`);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
          <div className="text-3xl">♟️💥</div>
          <h1 className="text-lg font-semibold text-mist-100">Something broke</h1>
          <p className="max-w-md text-sm text-mist-400">
            The app hit an unexpected error. It's been logged for analysis — open the Debug
            panel (bottom-right) to copy the details.
          </p>
          <pre className="max-w-lg overflow-auto rounded-lg border border-rose/30 bg-rose/5 p-3 text-left text-xs text-rose">
            {this.state.error.message}
          </pre>
          <button
            onClick={() => this.setState({ error: null })}
            className="rounded-lg bg-amber px-4 py-2 text-sm font-semibold text-ink-950"
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
