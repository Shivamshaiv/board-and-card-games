import { useRef, type Ref } from 'react'
import { X } from 'lucide-react'

/** Touch browsers can consume the first click while a long dialog is coasting.
 * Dismiss on an intentional close-button tap; drags and cancelled touches keep reading. */
export function DialogClose({
  onClose,
  label = 'Close',
  className = 'icon-button',
  buttonRef,
}: {
  onClose: () => void
  label?: string
  className?: string
  buttonRef?: Ref<HTMLButtonElement>
}) {
  const press = useRef<{ x: number; y: number } | null>(null)
  return (
    <button
      ref={buttonRef}
      type="button"
      className={className}
      aria-label={label}
      onClick={onClose}
      onTouchStart={(e) => {
        const t = e.touches[0]
        press.current = e.touches.length === 1 ? { x: t.clientX, y: t.clientY } : null
      }}
      onTouchMove={(e) => {
        const t = e.touches[0],
          p = press.current
        if (!t || !p || Math.hypot(t.clientX - p.x, t.clientY - p.y) > 10) press.current = null
      }}
      onTouchCancel={() => {
        press.current = null
      }}
      onTouchEnd={(e) => {
        const p = press.current,
          t = e.changedTouches[0],
          box = e.currentTarget.getBoundingClientRect()
        press.current = null
        if (
          p &&
          t &&
          Math.hypot(t.clientX - p.x, t.clientY - p.y) <= 10 &&
          t.clientX >= box.left &&
          t.clientX <= box.right &&
          t.clientY >= box.top &&
          t.clientY <= box.bottom
        ) {
          e.preventDefault()
          onClose()
        }
      }}
    >
      <X size={19} aria-hidden="true" />
    </button>
  )
}
