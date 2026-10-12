// @vitest-environment jsdom
import { lazy } from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { WorkspaceBoundary } from '@/components/WorkspaceBoundary'

afterEach(() => { cleanup(); vi.restoreAllMocks() })
it('shows a named loading state until a deferred workspace is ready', async () => {
  let resolve!: (module: { default: () => React.JSX.Element }) => void
  const Deferred = lazy(() => new Promise<{ default: () => React.JSX.Element }>((ready) => { resolve = ready }))
  render(<WorkspaceBoundary label="SAMPLE workspace" onReload={vi.fn()}><Deferred /></WorkspaceBoundary>)
  expect(screen.getByRole('status')).toHaveTextContent('Loading SAMPLE workspace')
  await act(async () => resolve({ default: () => <p>SAMPLE workspace ready</p> }))
  expect(screen.getByText('SAMPLE workspace ready')).toBeInTheDocument()
})
it('contains a failed workspace and offers explicit reload recovery', () => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
  function Broken(): React.JSX.Element { throw new Error('SAMPLE deferred workspace failure') }
  const onReload = vi.fn()
  render(<WorkspaceBoundary label="SAMPLE workspace" onReload={onReload}><Broken /></WorkspaceBoundary>)
  expect(screen.getByRole('alert')).toHaveTextContent('SAMPLE workspace could not open')
  expect(screen.getByRole('alert')).toHaveTextContent('Unsaved form input may be lost')
  fireEvent.click(screen.getByRole('button', { name: 'Reload application' }))
  expect(onReload).toHaveBeenCalledOnce()
})
