import { useState } from 'react'
import { exportFullBackupZip, type BackupProgress } from '../lib/backupExport'
import { AlertBanner } from '../components/AlertBanner'
import { Button } from '../components/Button'
import { PageHeader } from '../components/PageHeader'
import { PageShell } from '../components/PageShell'

export function BackupPage() {
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<BackupProgress | null>(null)
  const [result, setResult] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function runExport() {
    setBusy(true)
    setError(null)
    setResult(null)
    setProgress({ phase: 'Démarrage', current: 0, total: 1 })
    try {
      const out = await exportFullBackupZip(setProgress)
      setResult(
        `Sauvegarde téléchargée : ${out.filename} (${out.tableCount} tables, ${out.documentCount} fichiers joints). Conservez le ZIP hors dépôt public.`
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Export impossible.')
    } finally {
      setBusy(false)
      setProgress(null)
    }
  }

  return (
    <PageShell width="narrow">
      <PageHeader
        title="Sauvegarde"
        subtitle="Exporter toutes les données importantes en ZIP organisé — brouillon local."
      />

      <div className="ui-card p-5 space-y-4">
        <p className="text-sm text-muted">
          Le fichier inclut paramètres, partenaires, projets, temps, factures, banque, paie, taxes,
          échéances, ajustements, clôtures, et les documents joints (PDF/images) lorsque disponibles.
        </p>
        <ul className="text-sm text-muted list-disc pl-5 space-y-1">
          <li>
            <code className="text-xs">settings/</code>, <code className="text-xs">master/</code>,{' '}
            <code className="text-xs">billing/</code>, <code className="text-xs">bank/</code>
          </li>
          <li>
            <code className="text-xs">payroll/</code>, <code className="text-xs">tax/</code>,{' '}
            <code className="text-xs">accounting/</code>, <code className="text-xs">documents/</code>
          </li>
          <li>
            <code className="text-xs">manifest.json</code> — inventaire et horodatage
          </li>
        </ul>

        <Button disabled={busy} onClick={() => void runExport()}>
          {busy ? 'Export en cours…' : 'Télécharger la sauvegarde ZIP'}
        </Button>

        {progress && (
          <p className="text-xs text-muted">
            {progress.phase} ({progress.current}/{progress.total})
          </p>
        )}

        {result && <AlertBanner variant="success">{result}</AlertBanner>}
        {error && <AlertBanner variant="warning">{error}</AlertBanner>}

        <p className="text-xs text-muted border-t border-border pt-3">
          Ne commitez pas ce ZIP. Il peut contenir des données financières et des pièces jointes.
        </p>
      </div>
    </PageShell>
  )
}
