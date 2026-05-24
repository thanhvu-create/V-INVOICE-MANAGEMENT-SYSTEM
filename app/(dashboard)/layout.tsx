import { UserProvider } from '@/contexts/UserContext'
import { TopNav } from '@/components/layout/TopNav'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <UserProvider>
      <TopNav />
      <main
        style={{
          maxWidth: '1400px',
          margin:   '0 auto',
          padding:  '2rem',
        }}
      >
        {children}
      </main>
    </UserProvider>
  )
}
