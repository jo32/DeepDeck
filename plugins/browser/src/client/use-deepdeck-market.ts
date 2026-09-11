'use client'
import { useEffect, useState } from 'react'
import { isDesktopParent, MARKET_MESSAGE, marketPackageRef, type MarketPackageRef } from '../market-link.ts'
import { record } from '../webmcp-package.ts'

export function useDeepDeckMarket() {
  const [bridge, setBridge] = useState<{ origin: string; nonce: string }>()
  useEffect(() => {
    if (window.parent === window) return
    const listener = (event: MessageEvent<unknown>) => {
      if (event.source !== window.parent || !isDesktopParent(event.origin) || !record(event.data) || event.data.type !== `${MARKET_MESSAGE}.init` || typeof event.data.nonce !== 'string' || event.data.nonce.length > 100) return
      setBridge({ origin: event.origin, nonce: event.data.nonce })
      window.parent.postMessage({ type: `${MARKET_MESSAGE}.ready`, nonce: event.data.nonce }, event.origin)
    }
    window.addEventListener('message', listener)
    return () => window.removeEventListener('message', listener)
  }, [])
  return { embedded: !!bridge, install: (value: MarketPackageRef) => {
    if (!bridge) return
    window.parent.postMessage({ type: `${MARKET_MESSAGE}.install`, nonce: bridge.nonce, package: marketPackageRef(value) }, bridge.origin)
  } }
}
