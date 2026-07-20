import { useState, useEffect } from 'react';
import { Menu, X, ShieldCheck, Moon, Sun } from 'lucide-react';
import { useTheme } from '../context/useTheme';

const navLinks = [
  { label: 'Features', href: '#features' },
  { label: 'Pricing', href: '#pricing' },
  { label: 'Demo', href: '#demo' },
  { label: 'Testimonials', href: '#testimonials' },
  { label: 'FAQ', href: '#faq' },
  { label: 'Contact', href: '#contact' },
];

function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="p-2 rounded-lg text-text-2 hover:text-accent-0 hover:bg-surface-2 transition"
      aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
    </button>
  );
}

export function Navbar() {
  const [isOpen, setIsOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 16);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleClick = (href: string) => {
    setIsOpen(false);
    const element = document.querySelector(href);
    element?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition duration-300 ${
        scrolled ? 'bg-surface-0/90 backdrop-blur-md border-b border-border-0' : 'bg-transparent'
      }`}
    >
      <div className="section-container">
        <div className="section-inner flex items-center justify-between h-16 lg:h-20">
          <a
            href="#"
            className="flex items-center gap-2 font-display text-xl font-bold tracking-wider text-text-1"
            onClick={(e) => {
              e.preventDefault();
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            aria-label="LogMaster home"
          >
            <ShieldCheck className="w-7 h-7 text-accent-0" />
            LogMaster
          </a>

          <div className="hidden md:flex items-center gap-6">
            {navLinks.map((link) => (
              <button
                key={link.href}
                onClick={() => handleClick(link.href)}
                className="text-sm font-medium text-text-2 hover:text-accent-0 transition"
              >
                {link.label}
              </button>
            ))}
            <ThemeToggle />
            <a
              href="#demo"
              onClick={(e) => {
                e.preventDefault();
                handleClick('#demo');
              }}
              className="btn-primary text-sm px-5 py-2"
            >
              Request Demo
            </a>
          </div>

          <div className="md:hidden flex items-center gap-2">
            <ThemeToggle />
            <button
              className="p-2 text-text-2 hover:text-text-1"
              onClick={() => setIsOpen(!isOpen)}
              aria-label={isOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={isOpen}
            >
              {isOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>
      </div>

      {isOpen && (
        <div className="md:hidden bg-surface-0 border-b border-border-0 animate-fade-in">
          <div className="section-container py-4 flex flex-col gap-3">
            {navLinks.map((link) => (
              <button
                key={link.href}
                onClick={() => handleClick(link.href)}
                className="text-left text-text-2 hover:text-accent-0 font-medium py-2"
              >
                {link.label}
              </button>
            ))}
            <a
              href="#demo"
              onClick={(e) => {
                e.preventDefault();
                handleClick('#demo');
              }}
              className="btn-primary text-sm mt-2"
            >
              Request Demo
            </a>
          </div>
        </div>
      )}
    </nav>
  );
}
