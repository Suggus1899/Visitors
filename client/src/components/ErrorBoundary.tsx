import { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return (
        <div className="min-h-screen bg-[color:var(--bg-0)] flex items-center justify-center p-8">
          <div className="panel-tech rounded-2xl p-8 max-w-md w-full text-center">
            <div className="text-4xl mb-4">⚠️</div>
            <h2 className="text-xl font-display text-[color:var(--text-1)] mb-2">Algo salió mal</h2>
            <p className="text-[color:var(--text-2)] text-sm mb-4">
              Ha ocurrido un error inesperado. Por favor, recarga la página.
            </p>
            <pre className="text-xs text-red-400 bg-[color:var(--surface-2)] p-3 rounded-lg mb-4 overflow-auto max-h-32">
              {this.state.error?.message}
            </pre>
            <button
              onClick={() => window.location.reload()}
              className="btn-tech"
            >
              Recargar página
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
