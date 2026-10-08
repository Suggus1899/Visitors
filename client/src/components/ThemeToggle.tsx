import { useTheme } from '../context/ThemeContext';
import Sun from 'lucide-react/dist/esm/icons/sun';
import Moon from 'lucide-react/dist/esm/icons/moon';

export const ThemeToggle = () => {
    const { theme, toggleTheme } = useTheme();

    return (
        <button
            onClick={toggleTheme}
            className="p-2 text-[color:var(--text-3)] hover:text-[color:var(--text-1)] rounded-full hover:bg-[color:var(--surface-2)] transition-colors relative"
            title={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
            aria-label="Toggle theme"
        >
            <div className="relative w-[18px] h-[18px]">
                <Sun 
                    size={18} 
                    className={`absolute inset-0 transition-all duration-300 transform ${
                        theme === 'dark' ? 'rotate-90 opacity-0 scale-75' : 'rotate-0 opacity-100 scale-100'
                    }`} 
                />
                <Moon 
                    size={18} 
                    className={`absolute inset-0 transition-all duration-300 transform ${
                        theme === 'dark' ? 'rotate-0 opacity-100 scale-100' : '-rotate-90 opacity-0 scale-75'
                    }`} 
                />
            </div>
        </button>
    );
};
