
import { animate, motion, useMotionValue } from "motion/react"
import { useEffect } from "react"

import { colors } from "../style";

export default function Typewriter({
    text = "Hello world!",
    delay = 0,
}: {
    text?: string;
    delay?: number;
}) {
    const children = useMotionValue("")

    useEffect(() => {
        const timeout = setTimeout(() => {
          const animation = animate(0, text.length, {
            duration: 1.5,
            ease: "linear",
            onUpdate: (latest) => {
              children.set(text.slice(0, Math.ceil(latest)));
            },
          });
          return () => animation.stop();
        }, delay ); //  delay
    
        return () => clearTimeout(timeout); // 清理 timeout
    }, [text, delay, children]);

    return (
        <h2 className={`relative ${colors.text.primary} text-sm md:text-xl font-mono`}>
            <motion.span>{children}</motion.span>
            <motion.div
                className="absolute right-[-10px] top-0 bottom-0 w-[2px] bg-white-text-primary dark:bg-dark-text-primary"
                animate={{
                opacity: [1, 1, 0, 0],
                transition: {
                    duration: 1,
                    repeat: Infinity,
                    times: [0, 0.5, 0.5, 1],
                },
                }}
            />
        </h2>
    );
}
