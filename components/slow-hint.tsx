"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";

/** Appears only if loading takes longer than a few seconds, so people know it's still working. */
export function SlowHint({ after = 3500 }: { after?: number }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setShow(true), after);
    return () => clearTimeout(timer);
  }, [after]);

  return (
    <AnimatePresence>
      {show ? (
        <motion.p
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          className="flex items-center justify-center gap-2 pt-2 text-[13px] text-muted"
          aria-live="polite"
        >
          <motion.span
            aria-hidden
            className="inline-block size-3.5 rounded-full border-2 border-accent border-r-transparent"
            animate={{ rotate: 360 }}
            transition={{ repeat: Infinity, duration: 0.8, ease: "linear" }}
          />
          Still loading… this is taking a little longer than usual.
        </motion.p>
      ) : null}
    </AnimatePresence>
  );
}
