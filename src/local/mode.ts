// ADR 0019: switching authority reloads the app and clears all in-memory query state.
export type WorkspaceMode = 'solo' | 'team'
export function workspaceMode(): WorkspaceMode {
  try { return globalThis.localStorage?.getItem('factory-workspace-mode') === 'solo' ? 'solo' : 'team' } catch { return 'team' }
}
export function selectWorkspaceMode(mode: WorkspaceMode) {
  localStorage.setItem('factory-workspace-mode', mode)
  window.location.assign('/')
}
