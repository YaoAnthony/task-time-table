"use client"

import { useEffect } from "react"
import { motion } from "framer-motion"
import { useDispatch, useSelector } from "react-redux"
import { setTheme } from "../Redux/Features/themeSlice"
import { RootState } from "../Redux/store"

export default function MobileFloatThemeButton() {
  const dispatch = useDispatch()
  
  const isDark = useSelector((state: RootState) => state.theme.mode === "dark")

  const setIsDark = (value: boolean) => {
    document.documentElement.classList.toggle("dark", value)
    // 同步 Redux 状态
    dispatch(setTheme(value ? "dark" : "light"))
  }
  // 初始化与 <html class="dark"> 同步
  useEffect(() => {
    const initial = document.documentElement.classList.contains("dark")
    setIsDark(initial)
  }, [])

  const toggleTheme = () => {
    const next = !isDark
    setIsDark(next)
    document.documentElement.classList.toggle("dark", next)
    dispatch(setTheme(next ? "dark" : "light"))
  }

  return (
    <motion.button
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      onClick={toggleTheme}
      // 只在手机端显示：md及以上隐藏
      className="
        md:hidden fixed z-50
        right-[calc(1rem+env(safe-area-inset-right))]
        bottom-[calc(2rem+env(safe-area-inset-bottom))]
        p-3 rounded-full
        bg-white/90 dark:bg-zinc-900/90
        border border-black/5 dark:border-white/10
        shadow-lg backdrop-blur
        text-yellow-500 dark:text-emerald-300
        hover:bg-white dark:hover:bg-zinc-800
        transition-colors
      "
      initial={{ opacity: 0, scale: 0.8, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      whileTap={{ scale: 0.95 }}
    >
      {/* 使用 currentColor，这样图标颜色跟随 text-* 与 dark:text-* */}
      {isDark ? (
        // 月亮
        <motion.svg
          key="moon"
          width="22"
          height="22"
          viewBox="0 0 22 22"
          fill="none"
          initial={{ rotate: -20, opacity: 0 }}
          animate={{ rotate: 0, opacity: 1 }}
          transition={{ type: "spring", stiffness: 300, damping: 20 }}
        >
          <path
            d="M21 12.79A9 9 0 1111.21 3a7 7 0 0010.59 9.79z"
            stroke="currentColor"
            strokeWidth="2"
            fill="none"
          />
        </motion.svg>
      ) : (
        // 太阳
        <motion.svg
          key="sun"
          width="22"
          height="22"
          viewBox="0 0 22 22"
          fill="none"
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 400, damping: 18 }}
        >
          <circle cx="12" cy="12" r="5" stroke="currentColor" strokeWidth="2" fill="none" />
          {Array.from({ length: 8 }).map((_, i) => {
            const angle = (i * 45 * Math.PI) / 180
            const x1 = 12 + Math.cos(angle) * 8
            const y1 = 12 + Math.sin(angle) * 8
            const x2 = 12 + Math.cos(angle) * 10.5
            const y2 = 12 + Math.sin(angle) * 10.5
            return (
              <line
                key={i}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            )
          })}
        </motion.svg>
      )}
    </motion.button>
  )
}
