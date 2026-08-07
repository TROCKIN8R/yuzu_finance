import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

const DOCUMENTS_BUCKET = 'documents'
const ALLOWED_MIMES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
])
/** Alias that tracks Google’s current Flash model — avoids hard-coding 3.x versions. */
const DEFAULT_MODEL = 'gemini-flash-latest'

/** Tried in order when preferred model returns 404 / unavailable. */
const MODEL_FALLBACKS = ['gemini-flash-latest', 'gemini-3.6-flash', 'gemini-3.5-flash'] as const

const EXTRACTION_PROMPT = `You are extracting structured fields from a Canadian (Québec) supplier invoice or receipt for bookkeeping.

Return ONLY a JSON object with these keys (use null when not visible):
- expense_date: ISO date YYYY-MM-DD
- vendor: merchant / supplier name (not the buyer)
- description: short one-line purchase summary
- amount: subtotal before tax (HT) as a number
- gst: TPS / GST amount as a number
- qst: TVQ / QST amount as a number
- total: amount including all taxes (TTC) as a number
- currency: ISO code, usually CAD
- apply_tax: true if GST/QST/TPS/TVQ lines appear; false if no tax; null if unsure
- confidence: 0 to 1

Rules:
- Document may be French or English (TPS/GST, TVQ/QST).
- Prefer printed totals over line-item sums.
- Do not invent amounts.`

type ExtractBody = {
  storagePath?: string
  mimeType?: string
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  const chunk = 0x8000
  let binary = ''
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

function parseGeminiJson(text: string): Record<string, unknown> {
  const trimmed = text.trim()
  try {
    return JSON.parse(trimmed) as Record<string, unknown>
  } catch {
    const start = trimmed.indexOf('{')
    const end = trimmed.lastIndexOf('}')
    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1)) as Record<string, unknown>
    }
    throw new Error('Réponse Gemini non JSON.')
  }
}

function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : Number(String(v).replace(/,/g, '').replace(/\s/g, ''))
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null
}

function strOrNull(v: unknown): string | null {
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  return s ? s : null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  try {
    const geminiKey = Deno.env.get('GEMINI_API_KEY')
    if (!geminiKey) {
      return jsonResponse(
        { error: 'GEMINI_API_KEY non configurée. Définissez le secret Edge Function.' },
        503
      )
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseAnon = Deno.env.get('SUPABASE_ANON_KEY')
    const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!supabaseUrl || !supabaseAnon) {
      return jsonResponse({ error: 'Configuration Supabase manquante.' }, 500)
    }

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return jsonResponse({ error: 'Non authentifié.' }, 401)
    }

    const userClient = createClient(supabaseUrl, supabaseAnon, {
      global: { headers: { Authorization: authHeader } },
    })

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser()
    if (userError || !user) {
      return jsonResponse(
        { error: 'Session invalide.', detail: userError?.message ?? null },
        401
      )
    }

    const body = (await req.json()) as ExtractBody
    const storagePath = body.storagePath?.trim()
    const mimeType = body.mimeType?.trim()

    if (!storagePath || !mimeType) {
      return jsonResponse({ error: 'storagePath et mimeType sont requis.' }, 400)
    }
    if (!ALLOWED_MIMES.has(mimeType)) {
      return jsonResponse({ error: 'Type de fichier non supporté (PDF, JPEG, PNG, WebP).' }, 400)
    }
    if (!storagePath.startsWith(`${user.id}/`)) {
      return jsonResponse({ error: 'Chemin de fichier non autorisé.' }, 403)
    }

    // Prefer service role for Storage download after path ownership check (avoids RLS edge cases).
    const storageClient = serviceRole
      ? createClient(supabaseUrl, serviceRole)
      : userClient

    const { data: fileBlob, error: downloadError } = await storageClient.storage
      .from(DOCUMENTS_BUCKET)
      .download(storagePath)

    if (downloadError || !fileBlob) {
      return jsonResponse(
        { error: downloadError?.message ?? 'Impossible de lire le fichier Storage.' },
        400
      )
    }

    const bytes = await fileBlob.arrayBuffer()
    if (bytes.byteLength === 0) {
      return jsonResponse({ error: 'Fichier vide.' }, 400)
    }
    if (bytes.byteLength > 10 * 1024 * 1024) {
      return jsonResponse({ error: 'Fichier trop volumineux (max 10 Mo).' }, 400)
    }

    const preferred = Deno.env.get('GEMINI_MODEL')?.trim() || DEFAULT_MODEL
    const models = [...new Set([preferred, ...MODEL_FALLBACKS])]

    const base64 = arrayBufferToBase64(bytes)
    const requestBody = {
      contents: [
        {
          role: 'user',
          parts: [
            { text: EXTRACTION_PROMPT },
            {
              inline_data: {
                mime_type: mimeType,
                data: base64,
              },
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.1,
        responseMimeType: 'application/json',
      },
    }

    // Avoid responseSchema — it often 400s on free-tier / lite models. JSON mime + prompt is enough.
    let geminiRes: Response | null = null
    let lastErrText = ''
    let usedModel = preferred

    for (const model of models) {
      usedModel = model
      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`
      const res = await fetch(geminiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': geminiKey,
        },
        body: JSON.stringify(requestBody),
      })

      if (res.ok) {
        geminiRes = res
        break
      }

      lastErrText = await res.text()
      const modelGone =
        res.status === 404 || /no longer available|NOT_FOUND|not found/i.test(lastErrText)
      console.error('Gemini error', model, res.status, lastErrText.slice(0, 400))
      if (!modelGone) {
        const quota =
          res.status === 429 || /RESOURCE_EXHAUSTED|quota|rate.?limit/i.test(lastErrText)
        return jsonResponse(
          {
            error: quota
              ? 'Quota Gemini atteint (gratuit). Réessayez plus tard ou saisissez manuellement.'
              : `Erreur Gemini (${res.status}).`,
            detail: lastErrText.slice(0, 800),
            model,
          },
          quota ? 429 : 502
        )
      }
    }

    if (!geminiRes) {
      return jsonResponse(
        {
          error: 'Aucun modèle Gemini disponible pour cette clé API.',
          detail: lastErrText.slice(0, 800),
          tried: models,
        },
        502
      )
    }

    const geminiJson = await geminiRes.json()
    console.log('extract-receipt model', usedModel)
    const text =
      geminiJson?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? '').join('') ??
      ''
    if (!text) {
      const block = geminiJson?.promptFeedback?.blockReason
      const finish = geminiJson?.candidates?.[0]?.finishReason
      return jsonResponse(
        {
          error: block
            ? `Document refusé par Gemini (${block}).`
            : 'Aucune donnée extraite.',
          detail: finish ? `finishReason=${finish}` : null,
          model: usedModel,
        },
        422
      )
    }

    const raw = parseGeminiJson(text)
    return jsonResponse({
      vendor: strOrNull(raw.vendor),
      expense_date: strOrNull(raw.expense_date),
      description: strOrNull(raw.description),
      amount: numOrNull(raw.amount),
      gst: numOrNull(raw.gst),
      qst: numOrNull(raw.qst),
      total: numOrNull(raw.total),
      currency: strOrNull(raw.currency) ?? 'CAD',
      apply_tax: typeof raw.apply_tax === 'boolean' ? raw.apply_tax : null,
      confidence: numOrNull(raw.confidence),
      model: usedModel,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur inattendue.'
    console.error('extract-receipt', message)
    return jsonResponse({ error: message }, 500)
  }
})
