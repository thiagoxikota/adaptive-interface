/// <reference types="node" />
/**
 * Vite dev middleware: POST /api/insight -> one sentence of contextual copy
 * from Claude, requested by the client only AFTER a mode change was applied.
 *
 * Node-only code. It never touches the layout loop: the client debounces,
 * fires and forgets, and keeps its static copy on anything but a 200.
 *
 * Secrets: the API key is resolved once at server start and lives only in the
 * Anthropic client. It is never logged, echoed, returned or written to disk.
 */
import { execSync } from 'node:child_process'
import Anthropic from '@anthropic-ai/sdk'
import type { Plugin } from 'vite'
import { MODES, type Mode } from '../engine/types.ts'

const ROUTE = '/api/insight'
const MODEL = 'claude-opus-5'
const TIMEOUT_MS = 8000
const MAX_TOKENS = 300
const MAX_BODY_BYTES = 16 * 1024
const MAX_WORDS = 28

const SYSTEM_PROMPT = [
  'You write one calm sentence of contextual UI copy for an operations dashboard that just changed into the given mode.',
  'Describe what the layout now shows or lets the user do. Maximum 22 words.',
  'Use plain physical vocabulary. Never mention emotions, feelings, mood, or why the person did what they did.',
  'No exclamation marks. No emoji. No quotes, no preamble, no markdown. Reply with the sentence only.',
  'Latency-sensitive; begin your visible answer immediately.',
].join(' ')

// The product thesis is physical vocabulary. A sentence that drifts into
// internal-state language is dropped and the client keeps the static copy.
const FORBIDDEN =
  /\b(emotion|emotional|feel|feels|feeling|feelings|mood|confus\w*|frustrat\w*|stress\w*|anxi\w*|happy|sad|angry|bored|excited)\b/i

interface InsightRequest {
  mode: Mode
  focusTarget: string | null
  context: string
}

function isMode(value: unknown): value is Mode {
  return typeof value === 'string' && (MODES as readonly string[]).includes(value)
}

function parseRequest(raw: string): InsightRequest | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (typeof parsed !== 'object' || parsed === null) return null
  const body = parsed as Record<string, unknown>
  if (!isMode(body.mode)) return null
  const focusTarget = typeof body.focusTarget === 'string' ? body.focusTarget.slice(0, 64) : null
  const context = typeof body.context === 'string' ? body.context.slice(0, 2000) : ''
  return { mode: body.mode, focusTarget, context }
}

function resolveApiKey(): string | null {
  if (process.env.INSIGHT_DISABLED === '1') return null
  const fromEnv = process.env.ANTHROPIC_API_KEY?.trim()
  if (fromEnv) return fromEnv
  try {
    const fromKeychain = execSync('security find-generic-password -s agentic-os/ANTHROPIC_API_KEY -w', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 5000,
    }).trim()
    return fromKeychain.length > 0 ? fromKeychain : null
  } catch {
    return null
  }
}

function tidy(text: string): string | null {
  const line = text
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^["'“‘]+|["'”’]+$/g, '')
    .trim()
  if (line.length === 0) return null
  if (line.split(' ').length > MAX_WORDS) return null
  if (FORBIDDEN.test(line)) return null
  return line
}

async function generate(client: Anthropic, req: InsightRequest, signal: AbortSignal): Promise<string | null> {
  const user = [
    `Mode: ${req.mode}`,
    `Focused component: ${req.focusTarget ?? 'none'}`,
    `Dashboard context: ${req.context.length > 0 ? req.context : '(none)'}`,
  ].join('\n')

  // Thinking is adaptive by default on this model; effort low keeps it short.
  // fallbacks "default" re-runs a policy decline on Anthropic's recommended
  // substitute server-side (header for the scalar form is -2026-07-01).
  const response = await client.beta.messages.create(
    {
      model: MODEL,
      max_tokens: MAX_TOKENS,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low' },
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: user }],
    },
    { signal },
  )

  if (response.stop_reason === 'refusal') {
    console.warn('[insight] declined by the whole fallback chain; static copy kept')
    return null
  }
  let text = ''
  for (const block of response.content) {
    if (block.type === 'text') text += block.text
  }
  if (response.stop_reason === 'max_tokens') {
    console.warn(`[insight] hit max_tokens=${MAX_TOKENS}; static copy kept`)
    return null
  }
  return tidy(text)
}

function describeError(err: unknown): string {
  if (err instanceof Anthropic.AuthenticationError) return 'authentication error (401): key rejected'
  if (err instanceof Anthropic.RateLimitError) return 'rate limited (429)'
  if (err instanceof Anthropic.APIConnectionTimeoutError) return `timed out after ${TIMEOUT_MS} ms`
  if (err instanceof Anthropic.APIUserAbortError) return 'request aborted by the client'
  if (err instanceof Anthropic.APIError) return `${err.constructor.name} status=${err.status ?? 'n/a'}`
  if (err instanceof Error) return err.name
  return 'unknown error'
}

export function insightServer(): Plugin {
  return {
    name: 'adaptive-interface:insight',
    apply: 'serve',
    configureServer(server) {
      const apiKey = resolveApiKey()
      const client = apiKey ? new Anthropic({ apiKey, timeout: TIMEOUT_MS, maxRetries: 0 }) : null
      server.config.logger.info(
        client
          ? `[insight] Claude copy enabled (${MODEL}, ${TIMEOUT_MS} ms timeout, no retries)`
          : '[insight] no ANTHROPIC_API_KEY in env or Keychain: static copy only',
      )

      server.middlewares.use(ROUTE, (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.setHeader('Allow', 'POST')
          res.end()
          return
        }
        if (client === null) {
          res.statusCode = 204
          res.end()
          return
        }

        let raw = ''
        let done = false
        req.setEncoding('utf8')
        req.on('data', (chunk: string) => {
          if (done) return
          raw += chunk
          if (raw.length > MAX_BODY_BYTES) {
            done = true
            res.statusCode = 413
            res.end()
            req.destroy()
          }
        })
        req.on('error', () => {
          if (done) return
          done = true
          if (!res.destroyed) {
            res.statusCode = 204
            res.end()
          }
        })
        req.on('end', () => {
          if (done) return
          done = true
          const parsed = parseRequest(raw)
          if (parsed === null) {
            res.statusCode = 400
            res.end()
            return
          }

          // The client aborts its previous fetch on every mode change; cancel
          // the matching upstream request instead of paying for a dead answer.
          const controller = new AbortController()
          res.on('close', () => {
            if (!res.writableFinished) controller.abort()
          })

          generate(client, parsed, controller.signal)
            .then((text) => {
              if (res.destroyed) return
              if (text === null) {
                res.statusCode = 204
                res.end()
                return
              }
              res.statusCode = 200
              res.setHeader('Content-Type', 'application/json; charset=utf-8')
              res.setHeader('Cache-Control', 'no-store')
              res.end(JSON.stringify({ text, source: 'claude' }))
            })
            .catch((err: unknown) => {
              if (!controller.signal.aborted) console.warn(`[insight] ${describeError(err)}; static copy kept`)
              if (res.destroyed) return
              res.statusCode = 204
              res.end()
            })
        })
      })
    },
  }
}
