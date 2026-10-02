import Link from 'next/link';
import { cn } from '@/lib/utils';
import { buttonVariants } from './ui/button';

type CreatePoolButtonProps = {
  className?: string;
};

export const CreatePoolButton = ({ className }: CreatePoolButtonProps) => {
  return (
    <Link href="/launch" className={cn(buttonVariants({ variant: 'outline' }), className)}>
      <span className="iconify ph--egg-bold h-4 w-4" />
      <span className="hidden sm:inline">Hatch a token</span>
      <span className="sm:hidden">Hatch</span>
    </Link>
  );
};
