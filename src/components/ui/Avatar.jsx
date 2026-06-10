import { getInitials } from '../../lib/utils'

export default function Avatar({ name, color, size = 'sm', className = '' }) {
  const sizeClasses = {
    xs: 'w-5 h-5 text-[9px]',
    sm: 'w-7 h-7 text-xs',
    md: 'w-8 h-8 text-sm',
    lg: 'w-10 h-10 text-base',
  }

  return (
    <div
      className={`${sizeClasses[size]} rounded-full flex items-center justify-center font-semibold text-white flex-shrink-0 ${className}`}
      style={{ backgroundColor: color || '#0073ea' }}
      title={name}
    >
      {getInitials(name)}
    </div>
  )
}
