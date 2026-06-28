import { Link } from 'react-router-dom'

export function WorkflowFooter({ children, to, label }: { children?: ReactNode; to: string; label: string }) {
  return (
    <p className="text-sm text-muted mt-6 pt-4 border-t border-border">
      {children}{' '}
      <Link to={to} className="text-yuzu-dark font-medium hover:underline">
        {label} →
      </Link>
    </p>
  )
}
