// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { UpdatePrompt } from '@/pwa/UpdatePrompt'

const state=vi.hoisted(() => ({ refresh: null as (() => void)|null,update: vi.fn(),online: true }))
vi.mock('virtual:pwa-register',() => ({ registerSW: ({ onNeedRefresh }: { onNeedRefresh: () => void }) => { state.refresh=onNeedRefresh;return state.update } }))
vi.mock('@/pwa/useNetworkStatus',() => ({ useNetworkStatus: () => state.online }))
afterEach(() => { cleanup();vi.restoreAllMocks();vi.unstubAllEnvs();state.online=true;state.update.mockReset() })
it('keeps forms open when the operator cancels reload and retries a failed update', async () => {
  vi.stubEnv('PROD',true)
  const confirm=vi.spyOn(window,'confirm').mockReturnValue(false)
  render(<UpdatePrompt />)
  act(() => state.refresh?.())
  await act(async () => fireEvent.click(screen.getByRole('button',{ name: 'Reload now' })))
  expect(state.update).not.toHaveBeenCalled()
  confirm.mockReturnValue(true);state.update.mockRejectedValueOnce(new Error('SAMPLE update failure')).mockResolvedValue(undefined)
  await act(async () => fireEvent.click(screen.getByRole('button',{ name: 'Reload now' })))
  expect(screen.getByRole('alert')).toHaveTextContent('Your current screen is still open')
  await act(async () => fireEvent.click(screen.getByRole('button',{ name: 'Reload now' })))
  expect(state.update).toHaveBeenCalledTimes(2)
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})
it('blocks an offline update without dismissing the update notice', () => {
  vi.stubEnv('PROD',true);state.online=false
  render(<UpdatePrompt />);act(() => state.refresh?.())
  expect(screen.getByRole('button',{ name: 'Reload now' })).toBeDisabled()
  expect(screen.getByRole('alert')).toHaveTextContent('offline')
})
