import { useEffect, useRef } from 'react'

export interface GamepadActions {
  onLeft?: () => void
  onRight?: () => void
  onUp?: () => void
  onDown?: () => void
  onConfirm?: () => void // A
  onBack?: () => void // B
}

const REPEAT_MS = 180

/**
 * Poll Web Gamepad API tiap frame. Dpad + stick kiri untuk navigasi,
 * tombol 0 (A) = confirm, tombol 1 (B) = back. Ada debounce biar tidak lari.
 */
export function useGamepad(actions: GamepadActions, enabled: boolean) {
  const ref = useRef(actions)
  ref.current = actions

  useEffect(() => {
    if (!enabled) return
    let raf = 0
    const last: Record<string, number> = {}

    const fire = (key: string, fn?: () => void) => {
      const now = performance.now()
      if (fn && now - (last[key] ?? 0) > REPEAT_MS) {
        last[key] = now
        fn()
      }
    }
    const clear = (key: string) => {
      last[key] = 0
    }

    const tick = () => {
      const pads = navigator.getGamepads?.() ?? []
      const gp = Array.from(pads).find((p): p is Gamepad => p != null)
      if (gp) {
        const ax = gp.axes[0] ?? 0
        const ay = gp.axes[1] ?? 0
        const dpad = (i: number) => gp.buttons[i]?.pressed
        const a = ref.current

        if (dpad(14) || ax < -0.55) fire('l', a.onLeft)
        else clear('l')
        if (dpad(15) || ax > 0.55) fire('r', a.onRight)
        else clear('r')
        if (dpad(12) || ay < -0.55) fire('u', a.onUp)
        else clear('u')
        if (dpad(13) || ay > 0.55) fire('d', a.onDown)
        else clear('d')
        if (gp.buttons[0]?.pressed) fire('a', a.onConfirm)
        else clear('a')
        if (gp.buttons[1]?.pressed) fire('b', a.onBack)
        else clear('b')
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [enabled])
}
