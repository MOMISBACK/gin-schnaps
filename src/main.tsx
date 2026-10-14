import React, { Component, type ErrorInfo, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';
import './workspace.css';
class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(_error: Error, _info: ErrorInfo) { /* No telemetry and no sequence in logs. */ }
  render() { return this.state.failed ? <main className="fatal-error"><h1>Display interrupted</h1><p>The display engine encountered an error. No source file was modified.</p><p>Reload the application, then reopen the local file.</p><button onClick={() => window.location.reload()}>Reload</button></main> : this.props.children; }
}
const root = document.getElementById('root');
if (!root) throw new Error("Missing application root.");
createRoot(root).render(<ErrorBoundary><App/></ErrorBoundary>);
