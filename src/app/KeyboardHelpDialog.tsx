import { useRef } from 'react'

export function KeyboardHelpDialog() {
  const dialog = useRef<HTMLDialogElement>(null)
  return <>
    <button className="secondary-button" type="button" onClick={() => dialog.current?.showModal()}>Keyboard help</button>
    <dialog className="keyboard-dialog" ref={dialog} aria-labelledby="keyboard-help-title">
      <div className="flex items-start justify-between gap-4"><div><h2 className="text-lg font-bold" id="keyboard-help-title">Keyboard shortcuts</h2><p className="mt-1 text-sm leading-6 text-muted">Shortcuts only navigate or focus. They never submit a factory command.</p></div><button className="secondary-button" type="button" onClick={() => dialog.current?.close()}>Close</button></div>
      <dl className="mt-5 grid gap-3 text-sm"><div><dt className="font-semibold">Ctrl/Cmd + K</dt><dd className="mt-1 text-muted">Focus global search.</dd></div><div><dt className="font-semibold">/</dt><dd className="mt-1 text-muted">Focus global search when you are not typing in a field.</dd></div><div><dt className="font-semibold">Esc</dt><dd className="mt-1 text-muted">Clear the active search.</dd></div><div><dt className="font-semibold">Tab / Shift + Tab</dt><dd className="mt-1 text-muted">Move forward or backward through controls.</dd></div><div><dt className="font-semibold">Enter</dt><dd className="mt-1 text-muted">Open the focused control or submit a validated form.</dd></div></dl>
    </dialog>
  </>
}
