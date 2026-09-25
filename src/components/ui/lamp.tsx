import React from 'react'
import { motion, MotionConfig } from 'framer-motion'
import { cn } from '@/lib/utils'

/**
 * Aceternity-style "lamp" hero light, adapted from the supplied component:
 * - The mask/cover layers read `--lamp-bg` (default slate-950) so the lamp blends into whatever
 *   page it sits on — set it on the container, e.g. `className="[--lamp-bg:#000]"`.
 * - The two light cones use explicit conic-gradients instead of Tailwind's `bg-gradient-conic` +
 *   `--tw-gradient-stops`, which Tailwind v4 doesn't ship.
 * - The original is a full-screen demo (min-h-screen, children pulled up by translate-y-80).
 *   Here the lamp band has a fixed height and the children are pulled up under the light with a
 *   negative margin, so arbitrary-height content (a whole page section) can live below it.
 * - Honors prefers-reduced-motion via MotionConfig.
 */

const ease = 'easeInOut' as const
const reveal = { delay: 0.3, duration: 0.8, ease }

export const LampContainer = ({
  children,
  className,
  color = '#06b6d4',
  glowColor = '#22d3ee',
  lightClassName,
}: {
  children: React.ReactNode
  className?: string
  /** Light cone + halo color (default cyan-500). */
  color?: string
  /** Bright bar + inner glow color (default cyan-400). */
  glowColor?: string
  /** Extra classes on the light band — e.g. `opacity-40 md:opacity-60` to dim the whole lamp. */
  lightClassName?: string
}) => {
  return (
    <MotionConfig reducedMotion="user">
      <div
        className={cn(
          'relative z-0 flex w-full flex-col items-center overflow-hidden bg-[var(--lamp-bg,#020617)]',
          className,
        )}
      >
        <div className={cn('relative isolate z-0 flex h-[24rem] w-full shrink-0 scale-y-125 items-center justify-center', lightClassName)}>
          <motion.div
            initial={{ opacity: 0.5, width: '15rem' }}
            whileInView={{ opacity: 1, width: '30rem' }}
            viewport={{ once: true }}
            transition={reveal}
            style={{ backgroundImage: `conic-gradient(from 70deg at center top, ${color}, transparent, transparent)` }}
            className="absolute inset-auto right-1/2 h-56 w-[30rem] overflow-visible"
          >
            <div className="absolute bottom-0 left-0 z-20 h-40 w-full bg-[var(--lamp-bg,#020617)] [mask-image:linear-gradient(to_top,white,transparent)]" />
            <div className="absolute bottom-0 left-0 z-20 h-full w-40 bg-[var(--lamp-bg,#020617)] [mask-image:linear-gradient(to_right,white,transparent)]" />
          </motion.div>
          <motion.div
            initial={{ opacity: 0.5, width: '15rem' }}
            whileInView={{ opacity: 1, width: '30rem' }}
            viewport={{ once: true }}
            transition={reveal}
            style={{ backgroundImage: `conic-gradient(from 290deg at center top, transparent, transparent, ${color})` }}
            className="absolute inset-auto left-1/2 h-56 w-[30rem]"
          >
            <div className="absolute bottom-0 right-0 z-20 h-full w-40 bg-[var(--lamp-bg,#020617)] [mask-image:linear-gradient(to_left,white,transparent)]" />
            <div className="absolute bottom-0 right-0 z-20 h-40 w-full bg-[var(--lamp-bg,#020617)] [mask-image:linear-gradient(to_top,white,transparent)]" />
          </motion.div>
          <div className="absolute top-1/2 h-48 w-full translate-y-12 scale-x-150 bg-[var(--lamp-bg,#020617)] blur-2xl" />
          <div className="absolute top-1/2 z-50 h-48 w-full bg-transparent opacity-10 backdrop-blur-md" />
          <div
            className="absolute inset-auto z-50 h-36 w-[28rem] max-w-full -translate-y-1/2 rounded-full opacity-50 blur-3xl"
            style={{ background: color }}
          />
          <motion.div
            initial={{ width: '8rem' }}
            whileInView={{ width: '16rem' }}
            viewport={{ once: true }}
            transition={reveal}
            className="absolute inset-auto z-30 h-36 w-64 -translate-y-[6rem] rounded-full blur-2xl"
            style={{ background: glowColor }}
          />
          <motion.div
            initial={{ width: '15rem' }}
            whileInView={{ width: '30rem' }}
            viewport={{ once: true }}
            transition={reveal}
            className="absolute inset-auto z-50 h-0.5 w-[30rem] -translate-y-[7rem]"
            style={{ background: glowColor }}
          />
          <div className="absolute inset-auto z-40 h-44 w-full -translate-y-[12.5rem] bg-[var(--lamp-bg,#020617)]" />
        </div>

        <div className="relative z-50 -mt-[10.5rem] flex w-full flex-col items-center px-5">{children}</div>
      </div>
    </MotionConfig>
  )
}

export function LampDemo() {
  return (
    <LampContainer className="min-h-screen justify-center">
      <motion.h1
        initial={{ opacity: 0.5, y: 100 }}
        whileInView={{ opacity: 1, y: 0 }}
        transition={reveal}
        className="mt-8 bg-gradient-to-br from-slate-300 to-slate-500 bg-clip-text py-4 text-center text-4xl font-medium tracking-tight text-transparent md:text-7xl"
      >
        Build lamps <br /> the right way
      </motion.h1>
    </LampContainer>
  )
}

export default LampContainer
