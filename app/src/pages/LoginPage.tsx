import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { allowSignup, isSupabaseConfigured, supabase } from '../lib/supabase'
import { Button } from '../components/Button'
import { Field, inputClass } from '../components/Field'

export function LoginPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  if (!isSupabaseConfigured) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-surface">
        <div className="max-w-md text-center text-sm text-muted">
          <p className="font-semibold text-ink mb-2">Configuration manquante</p>
          <p>Supabase n’est pas configuré. En local, créez <code className="text-xs">app/.env.local</code>. En production, utilisez les GitHub Secrets.</p>
        </div>
      </div>
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const fn =
      mode === 'signin'
        ? supabase.auth.signInWithPassword({ email, password })
        : supabase.auth.signUp({ email, password })
    const { error: err } = await fn
    setLoading(false)
    if (err) {
      setError(err.message)
      return
    }
    navigate('/')
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-surface">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex w-12 h-12 rounded-xl bg-yuzu items-center justify-center text-xl font-bold mb-4">
            Y
          </div>
          <h1 className="text-2xl font-semibold">Yuzu Finance</h1>
          <p className="text-muted text-sm mt-1">Connexion sécurisée — vos données restent privées</p>
        </div>
        <form onSubmit={handleSubmit} className="bg-white border border-border rounded-xl p-6 space-y-4 shadow-sm">
          <Field label="Courriel">
            <input
              type="email"
              required
              autoComplete="email"
              className={inputClass}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
          <Field label="Mot de passe">
            <input
              type="password"
              required
              minLength={8}
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              className={inputClass}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          {error && <p className="text-red-600 text-sm">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? '…' : mode === 'signin' ? 'Connexion' : 'Créer un compte'}
          </Button>
          {allowSignup && (
            <button
              type="button"
              className="w-full text-xs text-muted hover:text-ink"
              onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
            >
              {mode === 'signin' ? 'Première visite ? Créer un compte' : 'Déjà un compte ? Connexion'}
            </button>
          )}
        </form>
      </div>
    </div>
  )
}
