import { motion } from 'motion/react'

import { HoverLinkAnimation } from '@/components/ui/hover-link-animation'

function Demo() {
  const fadeGroup = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { duration: 0.6, staggerChildren: 0.12 },
    },
  }

  const itemFade = {
    hidden: { opacity: 0, y: 12 },
    show: { opacity: 1, y: 0 },
  }

  const message = 'Welcome to the future of components with 21st Dev -'.split(' ')

  return (
    <div className="flex h-dvh w-dvw items-center justify-center">
      <motion.h2
        className="p-6 font-mono text-2xl font-extrabold tracking-wide text-white md:text-2xl"
        variants={fadeGroup}
        initial="hidden"
        animate="show"
      >
        {message.map((word, idx) => (
          <motion.span key={idx} variants={itemFade} className="mr-2 inline-block">
            {word}
          </motion.span>
        ))}
        <motion.span variants={itemFade} className="inline-block">
          <HoverLinkAnimation highlightColor="#0d0d0d" className="cursor-pointer text-[#00ff88]">
            explore
          </HoverLinkAnimation>
        </motion.span>
      </motion.h2>
    </div>
  )
}

export { Demo }
