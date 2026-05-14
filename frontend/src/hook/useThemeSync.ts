// hooks/useThemeSync.ts
import { useEffect } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import type { RootState } from '../Redux/store'
import { setTheme } from '../Redux/Features/themeSlice'

export function useThemeSync() {
    const mode = useSelector((s: RootState) => s.theme.mode)
    const dispatch = useDispatch()

    useEffect(() => {
        document.documentElement.classList.remove('dark')
        document.documentElement.style.colorScheme = 'light'
        localStorage.setItem('theme', 'light')

        if (mode !== 'light') {
            dispatch(setTheme('light'))
        }
    }, [dispatch, mode])
}
