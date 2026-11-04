import { createClient } from 'npm:@supabase/supabase-js@2'
import { handle } from './handler.ts'

Deno.serve((req: Request) => {
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return handle(req, {
    verifyToken: async (jwt) => {
      const { data, error } = await admin.auth.getUser(jwt)
      return error || !data.user ? null : data.user.id
    },
    isActiveAdmin: async (id) => {
      const { data } = await admin.from('profiles').select('is_admin, account_status').eq('id', id).maybeSingle()
      return !!data && data.is_admin === true && data.account_status === 'active'
    },
    createUser: (args) => admin.auth.admin.createUser(args) as never,
    inviteUserByEmail: (email, data) => admin.auth.admin.inviteUserByEmail(email, { data }) as never,
    updateUserById: (id, attrs) => admin.auth.admin.updateUserById(id, attrs) as never,
    generateLink: ({ type, email, data, redirectTo }) =>
      (type === 'invite'
        ? admin.auth.admin.generateLink({ type: 'invite', email, options: { data, redirectTo } })
        : admin.auth.admin.generateLink({ type: 'recovery', email, options: { redirectTo } })) as never,
    emailOf: async (id) => {
      const { data } = await admin.auth.admin.getUserById(id)
      return data?.user?.email ?? null
    },
    updateProfile: async (id, patch) => {
      const { error } = await admin.from('profiles').update(patch).eq('id', id)
      return { error }
    },
  })
})
