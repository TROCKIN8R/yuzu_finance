import { supabase } from './supabase'
import type { DocumentAttachment, DocumentEntityType } from './types'

export const DOCUMENTS_BUCKET = 'documents'
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024
export const ALLOWED_DOCUMENT_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
] as const

const ACCEPT_ATTR = '.pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp'

export { ACCEPT_ATTR as documentAcceptAttribute }

function sanitizeFilename(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? 'document'
  const cleaned = base.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 200)
  return cleaned || 'document'
}

export function buildDocumentPath(
  userId: string,
  entityType: DocumentEntityType,
  entityId: string,
  filename: string
): string {
  return `${userId}/${entityType}/${entityId}/${sanitizeFilename(filename)}`
}

function validateUpload(file: File | Blob, mimeType: string, sizeBytes: number) {
  if (sizeBytes <= 0) throw new Error('Fichier vide.')
  if (sizeBytes > MAX_DOCUMENT_BYTES) throw new Error('Fichier trop volumineux (max 10 Mo).')
  if (!ALLOWED_DOCUMENT_TYPES.includes(mimeType as (typeof ALLOWED_DOCUMENT_TYPES)[number])) {
    throw new Error('Type de fichier non autorisé (PDF, JPEG, PNG, WebP).')
  }
}

export async function fetchAttachments(
  entityType: DocumentEntityType,
  entityId: string
): Promise<DocumentAttachment[]> {
  const { data, error } = await supabase
    .from('document_attachments')
    .select('*')
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)
  return (data as DocumentAttachment[]) ?? []
}

export async function uploadDocument(
  file: File | Blob,
  filename: string,
  mimeType: string,
  entityType: DocumentEntityType,
  entityId: string
): Promise<DocumentAttachment> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Non connecté.')

  const sizeBytes = file instanceof File ? file.size : file.size
  validateUpload(file, mimeType, sizeBytes)

  const path = buildDocumentPath(user.id, entityType, entityId, filename)

  const { error: uploadErr } = await supabase.storage
    .from(DOCUMENTS_BUCKET)
    .upload(path, file, { contentType: mimeType, upsert: true })

  if (uploadErr) throw new Error(uploadErr.message)

  const { data, error } = await supabase
    .from('document_attachments')
    .insert({
      entity_type: entityType,
      entity_id: entityId,
      storage_path: path,
      filename: sanitizeFilename(filename),
      mime_type: mimeType,
      size_bytes: sizeBytes,
    })
    .select()
    .single()

  if (error || !data) throw new Error(error?.message ?? 'Métadonnées non enregistrées.')
  return data as DocumentAttachment
}

export async function getSignedDocumentUrl(storagePath: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from(DOCUMENTS_BUCKET)
    .createSignedUrl(storagePath, 60)

  if (error || !data?.signedUrl) throw new Error(error?.message ?? 'URL indisponible.')
  return data.signedUrl
}

export async function deleteAttachment(attachment: DocumentAttachment): Promise<void> {
  const { error: storageErr } = await supabase.storage
    .from(DOCUMENTS_BUCKET)
    .remove([attachment.storage_path])

  if (storageErr) throw new Error(storageErr.message)

  const { error } = await supabase.from('document_attachments').delete().eq('id', attachment.id)
  if (error) throw new Error(error.message)
}

export async function deleteEntityDocuments(
  entityType: DocumentEntityType,
  entityId: string
): Promise<void> {
  const attachments = await fetchAttachments(entityType, entityId)
  await Promise.all(attachments.map((a) => deleteAttachment(a)))
}

export function formatDocumentSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`
}
