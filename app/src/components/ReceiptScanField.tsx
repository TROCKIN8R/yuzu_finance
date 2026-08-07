import { useRef, useState } from 'react'
import { documentAcceptAttribute } from '../lib/documents'
import {
  extractReceiptFromFile,
  mergeReceiptIntoPurchase,
  type ReceiptExtract,
  type ReceiptPurchaseFields,
} from '../lib/receiptOcr'
import type { TaxSettings } from '../lib/taxes'
import { Button } from './Button'
import { Field } from './Field'

type Props = {
  file: File | null
  onFileChange: (file: File | null) => void
  onExtracted: (fields: ReceiptPurchaseFields, raw: ReceiptExtract) => void
  applyTax: boolean
  settings: TaxSettings | null | undefined
  label?: string
  hint?: string
  disabled?: boolean
  /** When true (default), choosing a file starts Gemini extraction immediately. */
  autoScan?: boolean
}

export function ReceiptScanField({
  file,
  onFileChange,
  onExtracted,
  applyTax,
  settings,
  label = 'Reçu / facture',
  hint = 'PDF ou image (max 10 Mo). Ce fichier sera joint à l’enregistrement.',
  disabled = false,
  autoScan = true,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [scanning, setScanning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [scanNote, setScanNote] = useState<string | null>(null)

  async function runScan(nextFile: File) {
    if (disabled) return
    setScanning(true)
    setError(null)
    setScanNote(null)
    try {
      const raw = await extractReceiptFromFile(nextFile)
      const fields = mergeReceiptIntoPurchase(raw, applyTax, settings)
      onExtracted(fields, raw)
      const conf =
        raw.confidence !== null && raw.confidence !== undefined
          ? ` Confiance ~${Math.round(raw.confidence * 100)} %.`
          : ''
      setScanNote(`Champs préremplis — vérifiez avant d’enregistrer.${conf}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Extraction échouée.')
    } finally {
      setScanning(false)
    }
  }

  async function handleFilePicked(next: File | null) {
    onFileChange(next)
    setError(null)
    setScanNote(null)
    if (next && autoScan) {
      await runScan(next)
    }
  }

  return (
    <Field label={label}>
      <input
        ref={inputRef}
        type="file"
        accept={documentAcceptAttribute}
        className="hidden"
        disabled={disabled || scanning}
        onChange={(e) => {
          const next = e.target.files?.[0] ?? null
          e.target.value = ''
          void handleFilePicked(next)
        }}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="secondary"
          className="!text-xs"
          disabled={disabled || scanning}
          onClick={() => inputRef.current?.click()}
        >
          {scanning ? 'Analyse…' : file ? 'Changer le fichier' : 'Joindre et scanner'}
        </Button>
        {file ? (
          <span className="text-xs truncate max-w-[240px]">{file.name}</span>
        ) : (
          <span className="text-xs text-muted">{hint}</span>
        )}
        {file && !scanning && (
          <>
            <Button
              type="button"
              variant="secondary"
              className="!text-xs"
              disabled={disabled}
              onClick={() => void runScan(file)}
            >
              Rescanner
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="!text-xs"
              disabled={disabled}
              onClick={() => {
                onFileChange(null)
                setError(null)
                setScanNote(null)
              }}
            >
              Retirer
            </Button>
          </>
        )}
      </div>
      {scanNote && <p className="mt-1.5 text-xs text-emerald-800">{scanNote}</p>}
      {error && <p className="mt-1.5 text-xs text-red-700">{error}</p>}
    </Field>
  )
}
