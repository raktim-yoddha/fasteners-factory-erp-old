import { Component, Suspense } from 'react'
import type { ReactNode } from 'react'

type Props = { label: string; children: ReactNode; onReload: () => void }
class WorkspaceErrorBoundary extends Component<Props, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() {
    return this.state.failed ? <section className="record-panel">
      <p role="alert" className="feedback feedback-blocked">Blocked because {this.props.label} could not open. Reload the application to recover. Unsaved form input may be lost.</p>
      <button className="secondary-button" type="button" onClick={this.props.onReload}>Reload application</button>
    </section> : this.props.children
  }
}
/** Isolate deferred workspace loading and failures without removing navigation. */
export function WorkspaceBoundary(props: Props) {
  return <WorkspaceErrorBoundary {...props}>
    <Suspense fallback={<p className="empty-state" role="status">Loading {props.label}…</p>}>{props.children}</Suspense>
  </WorkspaceErrorBoundary>
}
