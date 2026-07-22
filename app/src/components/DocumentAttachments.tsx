import { useEffect, useRef, useState } from 'react'
import type { DocumentAttachment, DocumentEntityType } from '../lib/types'
import {
  deleteAttachment,
  documentAcceptAttribute,
  fetchAttachments,
  formatDocumentSize,
  getSignedDocumentUrl,
  uploadDocument,
} from '../lib/documents'
import { Button } from './Button'

type Props = {
  entityType: DocumentEntityType
  entityId: string | null
  disabled?: boolean
  label?: string
  hint?: string
}

export function DocumentAttachments({
  entityType,
  entityId,
  disabled = false,
  label = 'Documents',
  hint,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [rows, setRows] = useState<DocumentAttachment[]>([])
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!entityId) {
      setRows([])
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchAttachments(entityType, entityId)
      .then((data) => {
        if (!cancelled) setRows(data)
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Erreur de chargement.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [entityType, entityId])

  async function handleUpload(file: File) {
    if (!entityId || disabled) return
    setUploading(true)
    setError(null)
    try {
      const attachment = await uploadDocument(file, file.name, file.type, entityType, entityId)
      setRows((prev) => [attachment, ...prev])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Téléversement échoué.')
    } finally {
      setUploading(false)
    }
  }

  async function handleView(attachment: DocumentAttachment) {
    setError(null)
    try {
      const url = await getSignedDocumentUrl(attachment.storage_path)
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ouverture impossible.')
    }
  }

  async function handleDelete(attachment: DocumentAttachment) {
    if (disabled) return
    if (!confirm(`Supprimer « ${attachment.filename} » ?`)) return
    setError(null)
    try {
      await deleteAttachment(attachment)
      setRows((prev) => prev.filter((r) => r.id !== attachment.id))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Suppression échouée.')
    }
  }

  return (
    <div className="border border-border rounded-lg p-3 space-y-2 bg-stone-50/50">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-sm font-medium">{label}</div>
          {hint && <p className="text-xs text-muted mt-0.5">{hint}</p>}
        </div>
        <div>
          <input
            ref={fileRef}
            type="file"
            accept={documentAcceptAttribute}
            className="hidden"
            disabled={disabled || !entityId || uploading}
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void handleUpload(file)
              e.target.value = ''
            }}
          />
          <Button
            type="button"
            variant="secondary"
            className="!text-xs"
            disabled={disabled || !entityId || uploading}
            onClick={() => fileRef.current?.click()}
          >
            {uploading ? 'Envoi…' : 'Joindre un fichier'}
          </Button>
        </div>
      </div>

      {!entityId && (
        <p className="text-xs text-muted">Enregistrez d&apos;abord l&apos;enregistrement pour joindre un document.</p>
      )}

      {loading && <p className="text-xs text-muted">Chargement…</p>}

      {!loading && entityId && rows.length === 0 && (
        <p className="text-xs text-muted">Aucun document — PDF ou photo de facture/reçu (max 10 Mo).</p>
      )}

      {rows.length > 0 && (
        <ul className="divide-y divide-border rounded border border-border bg-white">
          {rows.map((doc) => (
            <li key={doc.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
              <div className="min-w-0">
                <div className="font-medium truncate">{doc.filename}</div>
                <div className="text-xs text-muted">{formatDocumentSize(Number(doc.size_bytes))}</div>
              </div>
              <div className="flex gap-1 shrink-0">
                <Button type="button" variant="ghost" className="!text-xs" onClick={() => void handleView(doc)}>
                  Voir
                </Button>
                {!disabled && (
                  <Button type="button" variant="danger" className="!text-xs" onClick={() => void handleDelete(doc)}>
                    Suppr.
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {error && <p className="text-xs text-red-700">{error}</p>}
    </div>
  )
}
