import { useI18n } from '../i18n'

export const ANPC_SAL_URL = 'https://reclamatiisal.anpc.ro/'

/**
 * Official ANPC SAL (Soluționarea Alternativă a Litigiilor) pictogram linking to
 * https://reclamatiisal.anpc.ro/, as required for Romanian commercial websites
 * under ANPC Order no. 449/2022.
 */
export function AnpcSalBadge({ className = '' }: { className?: string }) {
  const { t } = useI18n()
  return (
    <a
      href={ANPC_SAL_URL}
      target="_blank"
      rel="noopener noreferrer nofollow"
      aria-label={t.footer.anpcSalAlt}
      title={t.footer.anpcSalAlt}
      className={`inline-block rounded-[10px] ring-1 ring-line/70 transition-opacity hover:opacity-90 ${className}`}
    >
      <img
        src="/anpc-sal.svg"
        alt={t.footer.anpcSalAlt}
        width={250}
        height={62}
        loading="lazy"
        decoding="async"
        className="block h-auto w-[210px] rounded-[10px] sm:w-[240px]"
      />
    </a>
  )
}
