import { cn } from '@/lib/utils';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'default' | 'warning' | 'danger' | 'success' | 'neutral';
  className?: string;
}

const variants = {
  default: 'bg-blue-100 text-blue-800',
  warning: 'bg-amber-100 text-amber-800',
  danger:  'bg-red-100  text-red-800',
  success: 'bg-green-100 text-green-800',
  neutral: 'bg-gray-100  text-gray-700',
};

export function Badge({ children, variant = 'default', className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
        variants[variant],
        className
      )}
    >
      {children}
    </span>
  );
}
