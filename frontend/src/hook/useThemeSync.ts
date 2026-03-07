// hooks/useThemeSync.ts
import { useEffect } from 'react'
import { useSelector } from 'react-redux'
import type { RootState } from '../Redux/store'

export function useThemeSync() {
    const mode = useSelector((s: RootState) => s.theme.mode) // 单一真相：Redux

    useEffect(() => {
        const dark = mode === 'dark'
        document.documentElement.classList.toggle('dark', dark)
        document.documentElement.style.colorScheme = dark ? 'dark' : 'light'
    }, [mode])

    // 可选：系统主题变化时自动更新 Redux（若你想跟随系统）
    // 这个需要你在 themeSlice 里提供个 setTheme action
    // useEffect(() => {
    //   const mql = window.matchMedia('(prefers-color-scheme: dark)')
    //   const onChange = (e: MediaQueryListEvent) => {
    //     dispatch(setTheme(e.matches ? 'dark' : 'light'))
    //   }
    //   mql.addEventListener('change', onChange)
    //   return () => mql.removeEventListener('change', onChange)
    // }, [dispatch])
}
