'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export type Role = 'viewer' | 'user' | 'manager' | 'admin'

export interface UserProfile {
  id:       string
  authId:   string
  email:    string
  fullName: string
  role:     Role
}

interface UserContextValue {
  user:   UserProfile
  canDo:  (action: string) => boolean
  loaded: boolean
}

const ROLE_ACTIONS: Record<Role, string[]> = {
  admin:   [
    'create', 'edit', 'delete', 'approve', 'invoice',
    'import', 'manage_users', 'manage_rates', 'manage_rules',
    'manage_products', 'see_prices',
  ],
  manager: [
    'create', 'edit', 'delete', 'approve', 'invoice',
    'import', 'manage_rates', 'manage_rules',
    'manage_products', 'see_prices',
  ],
  user:    ['create', 'edit', 'import', 'see_prices'],
  viewer:  ['see_prices'],
}

const defaultUser: UserProfile = {
  id: '', authId: '', email: '', fullName: '', role: 'viewer',
}

const UserContext = createContext<UserContextValue>({
  user:   defaultUser,
  canDo:  () => false,
  loaded: false,
})

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [user,   setUser]   = useState<UserProfile>(defaultUser)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => r.json())
      .then(json => {
        if (json.success) setUser(json.data)
      })
      .finally(() => setLoaded(true))
  }, [])

  function canDo(action: string): boolean {
    return ROLE_ACTIONS[user.role]?.includes(action) ?? false
  }

  return (
    <UserContext.Provider value={{ user, canDo, loaded }}>
      {children}
    </UserContext.Provider>
  )
}

export function useUser(): UserContextValue {
  return useContext(UserContext)
}
