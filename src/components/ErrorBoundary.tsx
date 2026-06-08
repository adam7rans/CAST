import React from 'react';

interface Props {
  children: React.ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Catches render-time exceptions so a single faulty component (e.g. a caption
 * frame or the playhead) can't blank the entire app to a black screen. Shows a
 * recoverable message with a reload button instead.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error('App crashed:', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 16,
            padding: 24,
            background: '#111',
            color: '#eee',
            fontFamily: 'system-ui, sans-serif',
            textAlign: 'center',
          }}
        >
          <h2 style={{ margin: 0 }}>Something went wrong</h2>
          <pre
            style={{
              maxWidth: 600,
              maxHeight: 240,
              overflow: 'auto',
              whiteSpace: 'pre-wrap',
              color: '#ff8080',
              fontSize: 13,
            }}
          >
            {this.state.error.message}
          </pre>
          <div style={{ display: 'flex', gap: 12 }}>
            <button
              onClick={() => this.setState({ error: null })}
              style={{ padding: '8px 16px', cursor: 'pointer' }}
            >
              Try again
            </button>
            <button
              onClick={() => window.location.reload()}
              style={{ padding: '8px 16px', cursor: 'pointer' }}
            >
              Reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
