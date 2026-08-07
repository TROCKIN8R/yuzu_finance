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
}

export function ReceiptScanField({
  file,
  onFileChange,
  onExtracted,
  applyTax,
  settings,
  label = 'Facture fournisseur (optionnel)',
  hint = 'PDF ou image (max 10 Mo). L’extraction préremplit le formulaire — vérifiez avant d’enregistrer.',
  disabled = false,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [scanning, setScanning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [scanNote, setScanNote] = useState<string | null>(null)

  async function handleScan() {
    if (!file || disabled || scanning) return
    setScanning(true)
    setError(null)
    setScanNote(null)
    try {
      const raw = await extractReceiptFromFile(file)
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

  return (
    <Field label={label}>
      <input
        ref={inputRef}
        type="file"
        accept={documentAcceptAttribute}
        className="hidden"
        disabled={disabled}
        onChange={(e) => {
          onFileChange(e.target.files?.[0] ?? null)
          setError(null)
          setScanNote(null)
          e.target.value = ''
        }}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="secondary"
          className="!text-xs"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
        >
          Choisir un fichier
        </Button>
        {file ? (
          <span className="text-xs truncate max-w-[240px]">{file.name}</span>
        ) : (
          <span className="text-xs text-muted">{hint}</span>
        )}
        {file && (
          <>
            <Button
              type="button"
              variant="secondary"
              className="!text-xs"
              disabled={disabled || scanning}
              onClick={handleScan}
            >
              {scanning ? 'Analyse…' : 'Scanner (Gemini)'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="!text-xs"
              disabled={disabled || scanning}
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
