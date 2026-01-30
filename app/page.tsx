import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import LogoutButton from '@/components/LogoutButton'

export default async function HomePage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        <div className="bg-white shadow rounded-lg p-6">
          <div className="flex justify-between items-start mb-4">
            <h1 className="text-3xl font-bold text-gray-900">
              Benvenuto, {user.email}!
            </h1>
            <LogoutButton />
          </div>
          <p className="text-gray-600 mb-6">
            Hai effettuato l'accesso con successo.
          </p>
          <div className="border-t pt-4">
            <h2 className="text-xl font-semibold text-gray-800 mb-2">
              Informazioni utente
            </h2>
            <div className="space-y-2 text-sm text-gray-600">
              <p>
                <span className="font-medium">Email:</span> {user.email}
              </p>
              <p>
                <span className="font-medium">ID Utente:</span> {user.id}
              </p>
              <p>
                <span className="font-medium">Ultimo accesso:</span>{' '}
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
