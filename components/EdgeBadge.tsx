import clsx from 'clsx'

export function EdgeBadge({ label }: { label: 'STRONG' | 'MODERATE' | 'WEAK' }) {
  const colors = {
    STRONG: 'bg-strong text-bg',
    MODERATE: 'bg-yellow text-bg',
    WEAK: 'bg-transparent text-muted border border-muted/40',
  }
  return (
    <span
      className={clsx(
        'inline-block px-2.5 py-1 text-[10px] font-extrabold tracking-wider rounded-full',
        colors[label],
      )}
    >
      {label}
    </span>
  )
}
