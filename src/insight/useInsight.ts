import { useEffect, useMemo, useState } from 'react'
import type { Insight, InsightModel, Mode } from '../engine/types.ts'
import { staticCopyFor } from './staticCopy.ts'

/**
 * Asynchronous copy for the current mode.
 *
 * The static sentence is derived synchronously from (mode, focusTarget), so it
 * is on screen in the same render that applied the new layout. A Claude
 * request follows 350 ms later, fire-and-forget; nothing that renders layout
 * ever awaits it. Any status other than 200, any error, or a reply that lands
 * after the mode moved on, leaves the static copy in place.
 */

const ENDPOINT = '/api/insight'
const DEBOUNCE_MS = 350
const DASHBOARD_CONTEXT =
  'Operations dashboard for a delivery fleet: deliveries per hour chart, 12 pending routes, on-time rate 94%.\n' +
  'Components: chart, kpis, activity feed, fleet panel, primary action (dispatch pending routes).'

/** text null = Claude unavailable or declined for this key; static copy stays. */
interface Settled {
  key: string
  text: string | null
}

declare global {
  interface Window {
    __insight?: Insight
  }
}

function keyOf(mode: Mode, focusTarget: string | null): string {
  return `${mode}|${focusTarget ?? ''}`
}

function extractText(data: unknown): string | null {
  if (typeof data !== 'object' || data === null) return null
  const text = (data as { text?: unknown }).text
  if (typeof text !== 'string') return null
  const trimmed = text.trim()
  return trimmed.length > 0 ? trimmed : null
}

export function useInsight(mode: Mode, focusTarget: string | null): InsightModel {
  const key = keyOf(mode, focusTarget)
  const [settled, setSettled] = useState<Settled | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, focusTarget, context: DASHBOARD_CONTEXT }),
        signal: controller.signal,
      })
        .then(async (res) => (res.status === 200 ? extractText(await res.json()) : null))
        .catch(() => null)
        .then((text) => {
          if (!controller.signal.aborted) setSettled({ key, text })
        })
    }, DEBOUNCE_MS)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [key, mode, focusTarget])

  const fresh = settled !== null && settled.key === key
  const claudeText = fresh ? settled.text : null
  const insight = useMemo<Insight>(
    () => ({
      mode,
      focusTarget,
      text: claudeText ?? staticCopyFor(mode, focusTarget),
      source: claudeText !== null ? 'claude' : 'static',
    }),
    [mode, focusTarget, claudeText],
  )

  useEffect(() => {
    if (import.meta.env.DEV) window.__insight = insight
  }, [insight])

  return { insight, pending: !fresh }
}
