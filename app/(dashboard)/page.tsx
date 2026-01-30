import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function HomePage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  return (
    <div className="py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        <div className="dm-card p-6">
          <h1 className="text-3xl font-bold text-dm-text mb-4">
            Benvenuto, {user.email}!
          </h1>
          <p className="text-dm-text-muted mb-6">
            Hai effettuato l'accesso con successo.
          </p>
          <div className="border-t border-dm-border pt-4">
            <h2 className="text-xl font-semibold text-dm-text mb-2">
              Informazioni utente
            </h2>
            <div className="space-y-2 text-sm text-dm-text-muted">
              <p>
                <span className="font-medium text-dm-text">Email:</span> {user.email}
              </p>
              <p>
                <span className="font-medium text-dm-text">ID Utente:</span> {user.id}
              </p>
              <p>
                <span className="font-medium text-dm-text">Ultimo accesso:</span>{' '}
                {user.last_sign_in_at
                  ? new Date(user.last_sign_in_at).toLocaleString('it-IT')
                  : 'N/A'}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
