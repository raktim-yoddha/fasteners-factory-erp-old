import type { ReactNode } from 'react'

/** A labelled, keyboard-accessible command form; persistence stays in feature adapters. */
export function ActionForm({ title, disabled, lockInputs = false, children, onSubmit }: {
  title: string
  disabled: boolean
  lockInputs?: boolean
  children: ReactNode
  onSubmit: (form: HTMLFormElement) => void
}) {
  return (
    <form className="master-form" onSubmit={(event) => {
      event.preventDefault()
      if (!disabled) onSubmit(event.currentTarget)
    }}>
      <fieldset className="grid min-w-0 gap-3" disabled={lockInputs && disabled}>
        <legend className="font-bold">{title}</legend>
        {children}
        <button className="primary-button" type="submit" disabled={disabled}>{title}</button>
      </fieldset>
    </form>
  )
}
