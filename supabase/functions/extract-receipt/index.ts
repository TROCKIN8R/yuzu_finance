import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

const DOCUMENTS_BUCKET = 'documents'
const ALLOWED_MIMES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
])
const DEFAULT_MODEL = 'gemini-2.5-flash-lite'

const EXTRACTION_PROMPT = `You are extracting structured fields from a Canadian (Québec) supplier invoice or receipt for bookkeeping.

Return ONLY JSON matching the schema. Rules:
- Language on the document may be French or English (TPS/GST, TVQ/QST).
- expense_date: ISO date YYYY-MM-DD when visible; otherwise null.
- vendor: merchant / supplier legal or trade name (not the buyer).
- description: short one-line summary of what was purchased (null if unclear).
- amount: subtotal before tax (HT), CAD dollars as a number.
- gst: TPS / GST amount if shown, else null.
- qst: TVQ / QST amount if shown, else null.
- total: amount including all taxes (TTC) if shown, else null.
- currency: ISO code, usually CAD.
- apply_tax: true if GST/QST/TPS/TVQ lines appear (even if 0); false if clearly tax-exempt or no tax lines; null if unsure.
- confidence: 0 to 1 overall extraction confidence.
- Prefer printed totals over line-item sums when both exist.
- Do not invent amounts. Use null when a field is not visible.`

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
    if (!supabaseUrl || !supabaseAnon) {
      return jsonResponse({ error: 'Configuration Supabase manquante.' }, 500)
    }

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return jsonResponse({ error: 'Non authentifié.' }, 401)
    }

    const supabase = createClient(supabaseUrl, supabaseAnon, {
      global: { headers: { Authorization: authHeader } },
    })

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()
    if (userError || !user) {
      return jsonResponse({ error: 'Session invalide.' }, 401)
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

    const { data: fileBlob, error: downloadError } = await supabase.storage
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

    const model = Deno.env.get('GEMINI_MODEL')?.trim() || DEFAULT_MODEL
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`

    const geminiRes = await fetch(geminiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': geminiKey,
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: EXTRACTION_PROMPT },
              {
                inline_data: {
                  mime_type: mimeType,
                  data: arrayBufferToBase64(bytes),
                },
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: 'application/json',
          responseSchema: {
            type: 'OBJECT',
            properties: {
              vendor: { type: 'STRING', nullable: true },
              expense_date: { type: 'STRING', nullable: true },
              description: { type: 'STRING', nullable: true },
              amount: { type: 'NUMBER', nullable: true },
              gst: { type: 'NUMBER', nullable: true },
              qst: { type: 'NUMBER', nullable: true },
              total: { type: 'NUMBER', nullable: true },
              currency: { type: 'STRING', nullable: true },
              apply_tax: { type: 'BOOLEAN', nullable: true },
              confidence: { type: 'NUMBER', nullable: true },
            },
          },
        },
      }),
    })

    if (!geminiRes.ok) {
      const errText = await geminiRes.text()
      const quota =
        geminiRes.status === 429 ||
        /RESOURCE_EXHAUSTED|quota|rate.?limit/i.test(errText)
      return jsonResponse(
        {
          error: quota
            ? 'Quota Gemini atteint (gratuit). Réessayez plus tard ou saisissez manuellement.'
            : `Erreur Gemini (${geminiRes.status}).`,
          detail: errText.slice(0, 500),
        },
        quota ? 429 : 502
      )
    }

    const geminiJson = await geminiRes.json()
    const text =
      geminiJson?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? '').join('') ??
      ''
    if (!text) {
      const block = geminiJson?.promptFeedback?.blockReason
      return jsonResponse(
        { error: block ? `Document refusé par Gemini (${block}).` : 'Aucune donnée extraite.' },
        422
      )
    }

    const raw = parseGeminiJson(text)
    const result = {
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
    }

    return jsonResponse(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur inattendue.'
    return jsonResponse({ error: message }, 500)
  }
})
