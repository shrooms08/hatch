import Header from '@/components/Header';
import { Footer } from '@/components/Footer';
import { cn } from '@/lib/utils';

interface IProps {
  containerClassName?: string;
  pageClassName?: string;
  /** Full-bleed pages (Home hero) manage their own width and padding. */
  bleed?: boolean;
}

const Page: React.FC<React.PropsWithChildren<IProps>> = ({ containerClassName, children, pageClassName, bleed = false }) => {
  return (
    <div className={cn('flex min-h-screen flex-col bg-hatch-bg text-ink', pageClassName)}>
      <a
        href="#main"
        className="sr-only z-[200] rounded-pill bg-yolk px-4 py-2 font-semibold text-ink-on-yolk focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        Skip to content
      </a>
      <Header />
      <main id="main" className={cn('flex w-full flex-1 flex-col', !bleed && 'mx-auto max-w-[1440px] px-4 pb-16 pt-6 md:px-10 lg:px-20', containerClassName)}>
        {children}
      </main>
      <Footer />
    </div>
  );
};

export default Page;
