'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Flame, Loader2 } from 'lucide-react'

export default function LoginPage() {
  const [email, setEmail]       = useState('')
  const [loading, setLoading]   = useState(false)
  const [sent, setSent]         = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const supabase = createClient()

  const handleLogin = async () => {
    if (!email.trim()) return
    setLoading(true)
    setError(null)

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    })

    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      setSent(true)
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-ink-950 flex items-center justify-center px-4">

      {/* Background grain */}
      <div className="fixed inset-0 bg-grain pointer-events-none opacity-40" />

      {/* Subtle radial glow */}
      <div className="fixed inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse 60% 40% at 50% 0%, rgba(201,168,76,0.06) 0%, transparent 70%)' }}
      />

      <div className="relative w-full max-w-sm space-y-8 animate-in">

        {/* Logo */}
        <div className="text-center space-y-4">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-gold-500/10 border border-gold-500/25 mx-auto">
            <Flame size={22} className="text-gold-500" />
          </div>
          <div>
            <h1 className="font-display text-2xl text-cream font-light">Sharath Content Engine</h1>
            <p className="text-sm text-ink-400 mt-1">Sign in to your content studio</p>
          </div>
        </div>

        {/* Form */}
        <div className="card p-6 space-y-4">
          {!sent ? (
            <>
              <div className="space-y-1.5">
                <label className="text-xs text-ink-400 font-medium uppercase tracking-wider">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleLogin()}
                  placeholder="sharath@coachsharath.com"
                  className="input"
                  autoFocus
                />
              </div>

              {error && (
                <p className="text-sm text-red-400 bg-red-900/20 border border-red-800/30 rounded-lg px-3 py-2">
                  {error}
                </p>
              )}

              <button
                onClick={handleLogin}
                disabled={loading || !email.trim()}
                className="btn-primary w-full justify-center"
              >
                {loading ? <Loader2 size={15} className="animate-spin" /> : null}
                {loading ? 'Sending link...' : 'Send magic link'}
              </button>

              <p className="text-xs text-ink-500 text-center">
                We'll email you a secure sign-in link — no password needed.
              </p>
            </>
          ) : (
            <div className="text-center py-4 space-y-3">
              <div className="w-10 h-10 rounded-full bg-emerald-900/30 border border-emerald-700/30 flex items-center justify-center mx-auto">
                <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-cream font-medium">Check your email</p>
              <p className="text-sm text-ink-400">
                We sent a sign-in link to <span className="text-cream-muted">{email}</span>
              </p>
              <button
                onClick={() => { setSent(false); setEmail('') }}
                className="text-xs text-ink-500 hover:text-cream-muted transition-colors mt-2"
              >
                Use a different email
              </button>
            </div>
          )}
        </div>

        <p className="text-center text-xs text-ink-600">
          Sharath Content Engine · Private access only
        </p>
      </div>
    </div>
  )
}
