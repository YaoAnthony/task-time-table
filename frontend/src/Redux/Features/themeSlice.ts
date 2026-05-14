// Redux/Features/themeSlice.ts
import { createSlice, PayloadAction } from "@reduxjs/toolkit"

const getInitialTheme = (): "dark" | "light" => {
  localStorage.setItem("theme", "light")
  return "light"
}

interface ThemeState {
  mode: "dark" | "light"
}

const initialState: ThemeState = {
  mode: getInitialTheme(),
}

export const themeSlice = createSlice({
  name: "theme",
  initialState,
  reducers: {
    setTheme: (state, action: PayloadAction<"dark" | "light">) => {
      state.mode = action.payload
      localStorage.setItem("theme", action.payload)
    },
    toggleTheme: (state) => {
      const newMode = state.mode === "dark" ? "light" : "dark"
      state.mode = newMode
      localStorage.setItem("theme", newMode)
    },
  },
})

export const { setTheme, toggleTheme } = themeSlice.actions
export default themeSlice.reducer
