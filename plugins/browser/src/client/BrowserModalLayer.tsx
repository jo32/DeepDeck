import { useLayoutEffect, useRef, useState } from 'react'
import type { BrowserClientService } from './browser-api.js'
import css from './browser.module.css'

/** Bridge a semantic modal layer to the native webpage compositor. */
export function BrowserModalLayer({ request, onError }: {
  request: BrowserClientService['request']
  onError: (message: string) => void
}) {
  const signal = useRef<HTMLSpanElement>(null)
  const [image, setImage] = useState<string>()
  const background = useRef<HTMLImageElement>(null)
  useLayoutEffect(() => {
    const element = signal.current
    if (!element) return
    let previous: boolean | undefined
    let revision = 0
    const synchronize = () => {
      const open = element.getBoundingClientRect().width > 0
      if (open === previous) return
      previous = open
      const current = ++revision
      void (async () => {
        const result = await request<{ image?: string; revision?: number }>({ action: 'command', command: { action: 'modal', open } })
        if (current !== revision) return
        if (!open) { setImage(undefined); return }
        if (result.image) {
          // Decode before mounting, then allow React and the compositor to paint
          // the replacement underneath the still-visible native webpage.
          const decoded = new Image()
          decoded.src = result.image
          await decoded.decode()
          if (current !== revision) return
          setImage(result.image)
          await new Promise<void>(resolve => {
            const painted = () => {
              if (current !== revision || background.current?.src === result.image) resolve()
              else requestAnimationFrame(painted)
            }
            requestAnimationFrame(painted)
          })
          await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
        }
        if (current !== revision || result.revision === undefined) return
        await request({ action: 'command', command: { action: 'modal', open: true, ready: result.revision } })
      })().catch(error => {
        if (current === revision) onError(error instanceof Error ? error.message : String(error))
      })
    }
    const observer = new ResizeObserver(synchronize)
    observer.observe(element)
    synchronize()
    return () => {
      revision++
      observer.disconnect()
      void request({ action: 'command', command: { action: 'modal', open: false } }).catch(() => {})
    }
  }, [request, onError])
  return <>
    <span ref={signal} className={css.modalSignal} aria-hidden="true" />
    {image && <img ref={background} className={css.modalBackdrop} src={image} alt="" aria-hidden="true" draggable={false} />}
  </>
}
