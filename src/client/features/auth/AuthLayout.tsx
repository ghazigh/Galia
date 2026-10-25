import { APP_NAME } from '@shared/brand';
import type { ReactNode } from 'react';
import { LogoMark } from '../../components/Logo';

export function AuthLayout({ children, wide }: { children: ReactNode; wide?: boolean }) {
  return (
    <div className="flex min-h-dvh flex-col items-center px-5 pt-[max(env(safe-area-inset-top),28px)] pb-10">
      <div className="flex items-center gap-2.5">
        <LogoMark size={34} />
        <span className="font-display text-[17px] font-semibold tracking-tight text-ink">{APP_NAME}</span>
      </div>
      <div className={`mt-8 w-full ${wide ? 'max-w-lg' : 'max-w-sm'} flex-1`}>{children}</div>
    </div>
  );
}
