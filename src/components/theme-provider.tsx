import { createContext, useContext, useEffect } from "react";

type Theme = "dark";

const ThemeContext = createContext<{ theme: Theme; setTheme: (t: Theme) => void; toggle: () => void }>({
  theme: "dark",
  setTheme: () => {},
  toggle: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    root.classList.remove("light");
    root.classList.add("dark");
    root.dataset.theme = "dark";
  }, []);

  return (
    <ThemeContext.Provider value={{ theme: "dark", setTheme: () => {}, toggle: () => {} }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
