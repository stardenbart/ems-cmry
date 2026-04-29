import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          padding: 40, textAlign: 'center', background: '#fff',
          borderRadius: 8, margin: 24, boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
        }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
          <h3 style={{ color: '#c0392b', marginBottom: 8 }}>Halaman ini mengalami error</h3>
          <p style={{ color: '#7f8c8d', marginBottom: 20, fontSize: 13 }}>
            {this.state.error?.message || 'Unknown error'}
          </p>
          <button
            className="btn btn-primary"
            onClick={() => this.setState({ hasError: false, error: null })}
          >
            Coba Lagi
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;