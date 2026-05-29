// client/src/components/Layout.tsx
//
// Root layout wrapper. Renders nav and the current route via <Outlet />.
// Style this however you want — scaffolding only.

import { Outlet } from 'react-router-dom'

export function Layout() {
  return (
    <div className="min-h-screen">
      <nav>
        {/* Your nav here */}
      </nav>
      <main>
        <Outlet />
      </main>
    </div>
  )
}
