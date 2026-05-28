// client/src/pages/NotFoundPage.tsx

import { Link } from 'react-router-dom'

export function NotFoundPage() {
  return (
    <div>
      <p>Page not found.</p>
      <Link to="/">Back to trips</Link>
    </div>
  )
}
