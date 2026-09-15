import React, {Component, type ReactNode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App';
import './styles.css';
class ErrorBoundary extends Component<{children: ReactNode}, {error: string | null}> {
  state = {error: null as string | null};
  static getDerivedStateFromError(error: Error) {return {error: error.message};}
  render() {return this.state.error ? <div className="boot-screen"><h1>界面遇到了问题</h1><p role="alert">{this.state.error}</p><button className="button primary" onClick={() => location.reload()}>重新打开工作台</button></div> : this.props.children;}
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><ErrorBoundary><App/></ErrorBoundary></React.StrictMode>);
