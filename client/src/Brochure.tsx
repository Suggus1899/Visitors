import { useState, useEffect, useRef } from 'react';

// ─── TYPES ────────────────────────────────────────────────────────────────────
interface SectionProps { id: string; children: React.ReactNode; className?: string; }

// ─── HELPERS ──────────────────────────────────────────────────────────────────
const Section = ({ id, children, className = '' }: SectionProps) => (
  <section id={id} className={`min-h-screen w-full relative ${className}`}>
    {children}
  </section>
);

const ProgressBadge = ({ pct, label }: { pct: number; label: string }) => (
  <div className="flex flex-col items-center gap-1">
    <div className="relative w-14 h-14">
      <svg viewBox="0 0 36 36" className="w-14 h-14 -rotate-90">
        <circle cx="18" cy="18" r="15.9" fill="none" stroke="#e2e8f0" strokeWidth="3" />
        <circle cx="18" cy="18" r="15.9" fill="none" stroke="#e63e2a" strokeWidth="3"
          strokeDasharray={`${pct} ${100 - pct}`} strokeLinecap="round" />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-slate-800">{pct}%</span>
    </div>
    <span className="text-[9px] uppercase tracking-widest text-slate-500 text-center leading-tight max-w-[60px]">{label}</span>
  </div>
);

const Tag = ({ children, color = 'cyan' }: { children: React.ReactNode; color?: string }) => {
  const colors: Record<string, string> = {
    cyan: 'bg-sky-100 text-sky-700 border-sky-300',
    red: 'bg-red-100 text-red-700 border-red-300',
    amber: 'bg-amber-100 text-amber-700 border-amber-300',
    green: 'bg-emerald-100 text-emerald-700 border-emerald-300',
    purple: 'bg-purple-100 text-purple-700 border-purple-300',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded border text-[10px] font-semibold uppercase tracking-widest ${colors[color] || colors.cyan}`}>
      {children}
    </span>
  );
};

const ScreenMock = ({ title, children, accent = '#0ea5e9' }: { title: string; children: React.ReactNode; accent?: string }) => (
  <div className="rounded-xl overflow-hidden border border-slate-200 shadow-lg bg-white" style={{ boxShadow: `0 4px 24px ${accent}18` }}>
    <div className="flex items-center gap-1.5 px-4 py-2.5 bg-white border-b border-slate-200">
      <span className="w-2.5 h-2.5 rounded-full bg-red-400" />
      <span className="w-2.5 h-2.5 rounded-full bg-yellow-400" />
      <span className="w-2.5 h-2.5 rounded-full bg-green-400" />
      <span className="ml-3 text-[10px] uppercase tracking-widest text-slate-400 font-mono">{title}</span>
    </div>
    <div className="p-4">{children}</div>
  </div>
);

const FeatureRow = ({ icon, label, done = true }: { icon: string; label: string; done?: boolean }) => (
  <div className={`flex items-center gap-3 py-2 border-b border-slate-100 ${done ? '' : 'opacity-40'}`}>
    <span className="text-lg w-6 text-center">{icon}</span>
    <span className="text-sm text-slate-600 flex-1">{label}</span>
    {done
      ? <span className="text-[10px] text-emerald-600 font-bold uppercase tracking-wider">✓ Listo</span>
      : <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">⏳ v1.2+</span>
    }
  </div>
);

// ─── MAIN BROCHURE ─────────────────────────────────────────────────────────────
export default function Brochure() {
  const [activeSection, setActiveSection] = useState(0);
  const sectionsRef = useRef<HTMLDivElement>(null);

  const sections = [
    { id: 'portada', label: 'Portada' },
    { id: 'intro', label: 'Quiénes somos' },
    { id: 'cuerpo', label: 'El Sistema' },
    { id: 'cta', label: 'Contacto' },
  ];

  const scrollTo = (id: string) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const idx = sections.findIndex(s => s.id === entry.target.id);
            if (idx !== -1) setActiveSection(idx);
          }
        });
      },
      { threshold: 0.25, rootMargin: '-10% 0px -60% 0px' }
    );
    sections.forEach(s => {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={sectionsRef} className="font-sans bg-slate-50 text-slate-900 overflow-x-hidden">

      {/* ── STICKY NAV ─────────────────────────────────────────────────────── */}
      <nav className="fixed top-6 left-1/2 -translate-x-1/2 z-50 flex gap-1 bg-white/90 backdrop-blur-md border border-slate-200 rounded-full px-3 py-2 shadow-xl">
        {sections.map((s, i) => (
          <button key={s.id}
            onClick={() => scrollTo(s.id)}
            className={`px-3 py-1 rounded-full text-[11px] uppercase tracking-wider font-semibold transition-all cursor-pointer
              ${activeSection === i ? 'bg-[#e63e2a] text-white shadow-lg' : 'text-slate-400 hover:text-slate-800'}`}>
            {s.label}
          </button>
        ))}
      </nav>

      {/* ══════════════════════════════════════════════════════════════════════
          1. PORTADA — EL GANCHO
      ══════════════════════════════════════════════════════════════════════ */}
      <Section id="portada" className="flex items-center justify-center overflow-hidden bg-gradient-to-br from-slate-50 via-white to-red-50">
        {/* Background grid + glow */}
        <div className="absolute inset-0"
          style={{
            backgroundImage: 'linear-gradient(rgba(226,62,42,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(226,62,42,0.06) 1px, transparent 1px)',
            backgroundSize: '40px 40px'
          }} />
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[#e63e2a] rounded-full blur-[140px] opacity-8 pointer-events-none" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-sky-400 rounded-full blur-[140px] opacity-6 pointer-events-none" />

        <div className="relative z-10 flex flex-col items-center text-center px-6 max-w-5xl mx-auto gap-8 pt-24">

          {/* Logo */}
          <div className="p-4 rounded-2xl border border-slate-200 bg-white shadow-xl">
            <img src="/src/logo/trebol_logo.png" alt="Industrias Alimentos El Trébol" className="h-28 w-auto object-contain" />
          </div>

          {/* Headline */}
          <div className="space-y-3">
            <p className="text-[11px] uppercase tracking-[0.4em] text-sky-600 font-semibold">Sistema Seguro de Gestión de Visitantes</p>
            <h1 className="text-4xl md:text-6xl font-black leading-tight tracking-tight">
              <span className="text-slate-900">Sistema Seguro de</span><br />
              <span className="text-sky-600">Gestión de Visitantes</span><br />
              <span className="text-[#e63e2a]">(LogMaster)</span>
            </h1>
            <p className="text-base md:text-lg text-slate-500 max-w-2xl mx-auto leading-relaxed">
              Para <strong className="text-slate-800">Industrias Alimentos El Trébol</strong> —{' '}
              el sistema que transforma la <strong className="text-slate-800">recepción</strong> en una{' '}
              <strong className="text-sky-600">fortaleza digital</strong> inteligente.
            </p>
          </div>

          {/* Progress overview */}
          <div className="flex flex-wrap justify-center gap-6 p-6 rounded-2xl border border-slate-200 bg-white shadow-md">
            <ProgressBadge pct={75} label="Core" />
            <ProgressBadge pct={70} label="UI/UX" />
            <ProgressBadge pct={60} label="Seguridad" />
            <ProgressBadge pct={50} label="Tests" />
            <ProgressBadge pct={80} label="Backend" />
            <ProgressBadge pct={80} label="Registro" />
          </div>

          {/* Version badge */}
          <div className="flex gap-3 flex-wrap justify-center">
            <Tag color="cyan">v1.0.0-rc.2</Tag>
            <Tag color="amber">Electron App</Tag>
            <Tag color="green">React + Node.js</Tag>
            <Tag color="red">SQLite Cifrada</Tag>
          </div>

          <a href="#intro" className="animate-bounce mt-4 text-slate-400 text-sm">↓ Descubrir más</a>
        </div>
      </Section>

      {/* ══════════════════════════════════════════════════════════════════════
          2. INTRODUCCIÓN — QUIÉNES SOMOS
      ══════════════════════════════════════════════════════════════════════ */}
      <Section id="intro" className="flex items-center justify-center bg-white">
        <div className="absolute inset-0"
          style={{
            backgroundImage: 'radial-gradient(ellipse at 20% 50%, rgba(230,62,42,0.05) 0%, transparent 50%), radial-gradient(ellipse at 80% 50%, rgba(14,165,233,0.05) 0%, transparent 50%)'
          }} />

        <div className="relative z-10 max-w-6xl mx-auto px-6 py-20 w-full">
          <div className="grid md:grid-cols-2 gap-16 items-center">

            {/* Left — text */}
            <div className="space-y-8">
              <div>
                <p className="text-[11px] uppercase tracking-[0.4em] text-[#e63e2a] font-semibold mb-3">02 — Quiénes somos</p>
                <h2 className="text-4xl md:text-5xl font-black leading-tight text-slate-900">
                  Industrias de<br />
                  <span className="text-sky-600">Alimentos</span><br />
                  El Trébol
                </h2>
              </div>

              <p className="text-slate-500 leading-relaxed text-base">
                Empresa venezolana del sector alimenticio con más de un siglo de trayectoria. 
                Como parte de nuestra evolución digital pasantias , desarrollamos un <strong className="text-slate-800">sistema propio</strong>{' '}
                de control de acceso para gestionar, registrar y auditar con precisión cada visita a nuestras instalaciones.
              </p>

              {/* Mission / Vision */}
              <div className="grid grid-cols-2 gap-4">
                {[
                  { title: 'Misión', text: 'Garantizar la seguridad y trazabilidad de cada persona que accede a nuestras instalaciones, con tecnología eficiente y confiable.', icon: '🎯' },
                  { title: 'Visión', text: 'Convertirnos en una plataforma SaaS multi-sede con inteligencia analítica para empresas de toda Latinoamérica.', icon: '🌎' },
                ].map(item => (
                  <div key={item.title} className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-2">
                    <span className="text-2xl">{item.icon}</span>
                    <h4 className="font-bold text-slate-800 text-sm">{item.title}</h4>
                    <p className="text-slate-500 text-xs leading-relaxed">{item.text}</p>
                  </div>
                ))}
              </div>

              {/* Values */}
              <div className="space-y-2">
                <p className="text-[11px] uppercase tracking-[0.3em] text-slate-400">Valores</p>
                <div className="flex flex-wrap gap-2">
                  {['🔒 Seguridad', '⚡ Eficiencia', '🔍 Transparencia', '🤝 Confianza'].map(v => (
                    <span key={v} className="px-3 py-1 rounded-full bg-white border border-slate-200 text-xs text-slate-600 shadow-sm">{v}</span>
                  ))}
                </div>
              </div>
            </div>

            {/* Right — Login screen mock */}
            <div className="space-y-4">
              <p className="text-[11px] uppercase tracking-widest text-slate-400 text-center">Vista: Pantalla de Login</p>
              <ScreenMock title="login · sistema control acceso" accent="#0ea5e9">
                <div className="space-y-4">
                  <div className="flex flex-col items-center gap-3 pb-4 border-b border-slate-100">
                    <div className="w-14 h-14 rounded-xl bg-slate-50 border border-slate-200 overflow-hidden flex items-center justify-center">
                      <img src="/src/logo/trebol_logo.png" alt="Industrias Alimentos El Trébol" className="w-full h-full object-contain p-1" />
                    </div>
                    <p className="text-slate-800 font-bold text-base">Bienvenido</p>
                    <p className="text-[10px] uppercase tracking-widest text-slate-400">Sistema de Control de Acceso</p>
                  </div>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-[9px] uppercase tracking-widest text-slate-400 mb-1">Usuario</label>
                      <div className="h-8 rounded-lg bg-slate-50 border border-slate-200 px-3 flex items-center">
                        <span className="text-slate-400 text-xs">recepcion_01</span>
                      </div>
                    </div>
                    <div>
                      <label className="block text-[9px] uppercase tracking-widest text-slate-400 mb-1">Contraseña</label>
                      <div className="h-8 rounded-lg bg-slate-50 border border-slate-200 px-3 flex items-center justify-between">
                        <span className="text-slate-400 text-sm tracking-widest">••••••••</span>
                        <span className="text-slate-400 text-[10px]">👁</span>
                      </div>
                    </div>
                    <div className="h-9 rounded-lg bg-sky-500 flex items-center justify-center">
                      <span className="text-white font-bold text-xs uppercase tracking-widest">INGRESAR</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="h-7 rounded-lg border border-slate-200 bg-slate-50 flex items-center justify-center">
                        <span className="text-[9px] uppercase tracking-widest text-slate-400">Demo</span>
                      </div>
                      <div className="h-7 rounded-lg border border-sky-200 bg-sky-50 flex items-center justify-center">
                        <span className="text-[9px] uppercase tracking-widest text-sky-600">Auditoría</span>
                      </div>
                    </div>
                  </div>
                  <p className="text-center text-[8px] uppercase tracking-widest text-slate-300">Industrias de Alimentos el Trébol © v1.0</p>
                </div>
              </ScreenMock>
              <div className="flex flex-wrap gap-2 justify-center">
                <Tag color="cyan">JWT Auth</Tag>
                <Tag color="green">Roles: Guard / Admin / Audit / SuperAdmin</Tag>
              </div>
            </div>
          </div>
        </div>
      </Section>

      {/* ══════════════════════════════════════════════════════════════════════
          3. CUERPO — LO QUE OFRECES
      ══════════════════════════════════════════════════════════════════════ */}
      <Section id="cuerpo" className="min-h-[auto] bg-slate-50">
        <div className="absolute inset-0"
          style={{
            backgroundImage: 'linear-gradient(rgba(15,23,42,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(15,23,42,0.04) 1px, transparent 1px)',
            backgroundSize: '60px 60px'
          }} />

        <div className="relative z-10 max-w-7xl mx-auto px-6 py-20 space-y-24">

          <div className="text-center space-y-3">
            <p className="text-[11px] uppercase tracking-[0.4em] text-[#e63e2a] font-semibold">03 — El Sistema</p>
            <h2 className="text-4xl md:text-5xl font-black text-slate-900">El flujo completo,<br /><span className="text-sky-600">vista por vista</span></h2>
          </div>

          {/* ── VISTA 1: OPERACIONES (pantalla principal) ── */}
          <div className="grid lg:grid-cols-2 gap-12 items-start">
            <div className="space-y-5">
              <div className="flex items-center gap-3">
                <span className="text-3xl">🖥️</span>
                <div>
                  <Tag color="green">Vista Principal</Tag>
                  <h3 className="text-2xl font-bold mt-1">Panel de Operaciones</h3>
                  <p className="text-[#4a6a82] text-xs uppercase tracking-wider">Guardia / Recepcionista</p>
                </div>
              </div>
              <p className="text-slate-500 leading-relaxed">
                Vista central de la aplicación. El guardia ve en <strong className="text-slate-800">tiempo real</strong> todas las visitas activas
                mientras registra nuevas entradas. Layout de dos columnas: formulario (izquierda) + listado (derecha).
              </p>
              <div className="space-y-1">
                <FeatureRow icon="📋" label="Tabla de visitas activas con búsqueda en tiempo real (Ctrl+K)" />
                <FeatureRow icon="⏳" label="Tab 'En Espera' para visitantes pendientes de admisión" />
                <FeatureRow icon="↔️" label="Tab 'Intermitencia' para visitas con salidas temporales" />
                <FeatureRow icon="🔔" label="Actualizaciones via SSE (Server-Sent Events) o polling" />
                <FeatureRow icon="⌨️" label="Atajos de teclado completos (Ctrl+N, Ctrl+K, Esc)" />
                <FeatureRow icon="🎵" label="Feedback sonoro en check-in y check-out" />
              </div>
              <div className="flex flex-wrap gap-2">
                <Tag color="cyan">SSE Real-Time</Tag>
                <Tag color="amber">Fallback Polling 15s</Tag>
                <Tag color="green">95% Completado</Tag>
              </div>
            </div>

            <ScreenMock title="/ · logmaster · panel de operaciones" accent="#22c55e">
              <div style={{background:'#f0f4f8', borderRadius:8, overflow:'hidden'}}>

                {/* ── HEADER ── */}
                <div className="flex items-center justify-between px-3 py-2" style={{background:'#ffffff', borderBottom:'1px solid #e2e8f0'}}>
                  <div className="flex items-center gap-2">
                    <img src="/src/logo/trebol_logo.png" className="h-6 w-6 object-contain rounded p-0.5" style={{background:'#f1f5f9',border:'1px solid #e2e8f0'}} />
                    <span className="text-[9px] font-bold uppercase tracking-[0.15em]" style={{color:'#1e293b'}}>Control de Acceso</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[7px]" style={{color:'#64748b'}}>Hola, <span style={{color:'#1e293b',fontWeight:600}}>admin</span></span>
                    <span className="text-[7px] px-1.5 py-0.5 rounded font-bold" style={{background:'#16a34a',color:'#ffffff'}}>Admin</span>
                    <span className="text-[7px] px-1.5 py-0.5 rounded font-bold" style={{background:'transparent',border:'1px solid #16a34a',color:'#16a34a'}}>Auditoría</span>
                    <span className="text-[8px]" style={{color:'#94a3b8'}}>⏻</span>
                  </div>
                </div>

                {/* ── MAIN CONTENT ── */}
                <div className="flex gap-2 p-2">

                  {/* Left: VisitForm 1/3 */}
                  <div className="w-[38%] space-y-1.5 p-2 rounded-lg" style={{background:'#ffffff',border:'1px solid #e2e8f0'}}>
                    <p className="text-[7px] uppercase tracking-widest font-bold mb-1" style={{color:'#16a34a'}}>Registrar Entrada</p>
                    <div className="flex gap-0.5 mb-2">
                      {[0,1,2,3].map(i => (
                        <div key={i} className="h-0.5 flex-1 rounded-full" style={{background: i===0 ? '#22c55e' : '#e2e8f0'}} />
                      ))}
                    </div>
                    <div className="space-y-1">
                      <div className="text-[6px] uppercase tracking-widest" style={{color:'#94a3b8'}}>Cédula de Identidad *</div>
                      <div className="h-5 rounded px-2 flex items-center justify-between" style={{background:'#f8fafc',border:'1px solid rgba(34,197,94,0.5)'}}>
                        <span className="text-[7px] font-mono" style={{color:'#1e293b'}}>12.345.678</span>
                        <span className="text-[6px]" style={{color:'#22c55e'}}>✓</span>
                      </div>
                      <div className="grid grid-cols-2 gap-1">
                        {['Nombre','Apellido'].map(f => (
                          <div key={f} className="h-5 rounded px-2 flex items-center" style={{background:'#f8fafc',border:'1px solid #e2e8f0'}}>
                            <span className="text-[6px]" style={{color:'#1e293b'}}>{f === 'Nombre' ? 'Carlos' : 'Pérez'}</span>
                          </div>
                        ))}
                      </div>
                      <div className="h-5 rounded px-2 flex items-center" style={{background:'#f8fafc',border:'1px solid #e2e8f0'}}>
                        <span className="text-[6px]" style={{color:'#94a3b8'}}>Empresa / Organización</span>
                      </div>
                    </div>
                    <div className="h-5 rounded flex items-center justify-center mt-1" style={{background:'#22c55e'}}>
                      <span className="text-[6px] font-bold uppercase" style={{color:'#ffffff'}}>Siguiente →</span>
                    </div>
                  </div>

                  {/* Right: Visits panel 2/3 */}
                  <div className="flex-1 space-y-1.5">
                    <div className="flex gap-0 pb-1" style={{borderBottom:'1px solid #e2e8f0'}}>
                      {[
                        {label:'Activas', active:true, count:3, color:'#22c55e'},
                        {label:'En Espera', active:false, count:0, color:'#f59e0b'},
                        {label:'Intermitencia', active:false, count:1, color:'#f59e0b'},
                        {label:'Admin Visit.', active:false, count:null, color:'#22c55e'},
                      ].map(tab => (
                        <div key={tab.label} className="flex items-center gap-1 px-2 py-1 relative">
                          <span className="text-[7px] uppercase font-bold tracking-wider" style={{color: tab.active ? tab.color : '#94a3b8'}}>{tab.label}</span>
                          {tab.count !== null && tab.count > 0 && (
                            <span className="text-[6px] font-bold px-1 rounded-full" style={{background: tab.active ? 'rgba(34,197,94,0.15)' : 'rgba(245,158,11,0.15)', color: tab.active ? '#16a34a' : '#d97706'}}>{tab.count}</span>
                          )}
                          {tab.active && <div className="absolute bottom-0 left-0 right-0 h-px" style={{background:tab.color}} />}
                        </div>
                      ))}
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1">
                        <span className="text-[8px] font-bold uppercase tracking-widest border-l-2 pl-1.5" style={{color:'#1e293b', borderColor:'#22c55e'}}>Visitas Activas</span>
                        <span className="text-[7px]" style={{color:'#94a3b8'}}>(3)</span>
                      </div>
                      <div className="h-5 rounded px-2 flex items-center gap-1" style={{background:'#f8fafc',border:'1px solid #e2e8f0',width:80}}>
                        <span className="text-[6px]" style={{color:'#94a3b8'}}>🔍 Buscar… Ctrl+K</span>
                      </div>
                    </div>

                    {[
                      { name: 'Carlos Pérez', co: 'Distribuidora XYZ', cedula:'12.345.678', time: '08:32', dept: 'Planta 1', host:'J. García' },
                      { name: 'María López',  co: 'Logística Total',   cedula:'9.876.543',  time: '09:15', dept: 'RRHH',    host:'A. Rodríguez' },
                      { name: 'Juan Rodríguez',co:'Proveedor S.A.',    cedula:'15.001.223', time: '10:01', dept: 'Gerencia', host:'C. Martínez' },
                    ].map(v => (
                      <div key={v.name} className="p-2 rounded-lg flex items-center justify-between" style={{background:'#ffffff',border:'1px solid #e2e8f0'}}>
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full flex items-center justify-center text-[8px] font-bold" style={{background:'rgba(34,197,94,0.15)',color:'#16a34a'}}>
                            {v.name.charAt(0)}
                          </div>
                          <div>
                            <p className="text-[8px] font-bold" style={{color:'#1e293b'}}>{v.name}</p>
                            <p className="text-[6px]" style={{color:'#64748b'}}>{v.co} · {v.dept} · Anfitrión: {v.host}</p>
                            <p className="text-[6px] font-mono" style={{color:'#94a3b8'}}>{v.cedula}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <div className="text-right mr-1">
                            <p className="text-[7px] font-bold" style={{color:'#16a34a'}}>{v.time}</p>
                            <span className="text-[5px] px-1 rounded uppercase" style={{background:'rgba(34,197,94,0.1)',color:'#16a34a'}}>● Activa</span>
                          </div>
                          <div className="h-5 px-1.5 rounded flex items-center" style={{background:'rgba(245,158,11,0.08)',border:'1px solid rgba(245,158,11,0.35)'}}>
                            <span className="text-[6px] font-bold uppercase" style={{color:'#d97706'}}>Sal. Temp.</span>
                          </div>
                          <div className="h-5 px-1.5 rounded flex items-center" style={{background:'rgba(239,68,68,0.1)',border:'1px solid rgba(239,68,68,0.25)'}}>
                            <span className="text-[6px] font-bold uppercase" style={{color:'#dc2626'}}>Salida</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </ScreenMock>
          </div>

          {/* ── INTERMITENCIA ── */}
          <div className="grid lg:grid-cols-2 gap-12 items-start">
            <div className="space-y-5">
              <div className="flex items-center gap-3">
                <span className="text-3xl">🔄</span>
                <div>
                  <Tag color="amber">Salidas Temporales</Tag>
                  <h3 className="text-2xl font-bold mt-1">Intermitencia de Visitas</h3>
                  <p className="text-[#4a6a82] text-xs uppercase tracking-wider">IntermittentVisits · Pestaña Activa</p>
                </div>
              </div>
              <p className="text-slate-600 leading-relaxed">
                Cuando un visitante activo necesita <strong className="text-slate-900">salir temporalmente</strong> — a buscar algo al carro, atender una llamada afuera — el guardia registra una <span className="text-amber-600 font-semibold">salida temporal</span> con un click. La visita no se cierra: pasa a estado <strong className="text-slate-900">Intermitente</strong>.
              </p>
              <p className="text-slate-600 leading-relaxed">
                Al regresar, el guardia presiona <strong className="text-slate-900">REGRESÓ</strong> y la visita vuelve a Activa. Todo el historial de salidas y reingresos queda <span className="text-emerald-600 font-semibold">auditado con timestamps</span> exactos.
              </p>
              <div className="space-y-1">
                <FeatureRow icon="🔄" label="Salida temporal sin cerrar la visita" />
                <FeatureRow icon="⏱️" label="Contador de minutos fuera en tiempo real" />
                <FeatureRow icon="✅" label="Reactivación con un solo click (REGRESÓ)" />
                <FeatureRow icon="📊" label="Historial de intervalos expandible por visita" />
                <FeatureRow icon="📄" label="Todos los intervalos quedan en audit log" />
              </div>
              <div className="flex flex-wrap gap-2">
                <Tag color="amber">Estado: Intermitente</Tag>
                <Tag color="green">100% Completado</Tag>
              </div>
            </div>

            <ScreenMock title="intermitencia · pestaña activa" accent="#f59e0b">
              <div className="space-y-2" style={{background:'#f0f4f8',borderRadius:8,padding:8}}>

                {/* Tab bar showing Intermitencia active */}
                <div className="flex gap-0 pb-1 mb-1" style={{borderBottom:'1px solid #e2e8f0'}}>
                  {[
                    {label:'Activas', count:3, active:false, c:'#22c55e'},
                    {label:'En Espera', count:0, active:false, c:'#94a3b8'},
                    {label:'Intermitencia', count:2, active:true, c:'#d97706'},
                    {label:'Admin Visit.', count:null, active:false, c:'#94a3b8'},
                  ].map(tab => (
                    <div key={tab.label} className="flex items-center gap-1 px-2 py-1 relative">
                      <span className="text-[7px] uppercase font-bold" style={{color: tab.active ? tab.c : '#94a3b8'}}>{tab.label}</span>
                      {tab.count !== null && tab.count > 0 && (
                        <span className="text-[6px] font-bold px-1 rounded-full" style={{background: tab.active ? 'rgba(245,158,11,0.15)':'rgba(34,197,94,0.1)', color: tab.active ? '#d97706':'#16a34a'}}>{tab.count}</span>
                      )}
                      {tab.active && <div className="absolute bottom-0 left-0 right-0 h-px" style={{background:tab.c}} />}
                    </div>
                  ))}
                </div>

                {/* Intermittent cards */}
                {[
                  { name:'Carlos Pérez', co:'Distribuidora XYZ', cedula:'12.345.678', out:'09:47', mins:23, intervals:1 },
                  { name:'María López', co:'Logística Total', cedula:'9.876.543', out:'10:05', mins:8, intervals:2 },
                ].map(v => (
                  <div key={v.name} className="rounded-lg overflow-hidden" style={{border:'1px solid rgba(245,158,11,0.35)',background:'rgba(245,158,11,0.04)'}}>
                    <div className="p-2 flex items-start gap-2">
                      {/* Avatar + pulse */}
                      <div className="relative flex-shrink-0">
                        <div className="w-8 h-8 rounded-xl flex items-center justify-center text-[9px] font-bold" style={{background:'rgba(245,158,11,0.15)',color:'#d97706',border:'1px solid rgba(245,158,11,0.3)'}}>
                          {v.name.charAt(0)}
                        </div>
                        <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full" style={{background:'#f59e0b',border:'2px solid #f0f4f8',animation:'pulse 2s infinite'}} />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-start justify-between">
                          <p className="text-[8px] font-bold" style={{color:'#1e293b'}}>{v.name}</p>
                          <span className="text-[7px] px-1.5 py-0.5 rounded-full" style={{background:'rgba(245,158,11,0.1)',border:'1px solid rgba(245,158,11,0.4)',color:'#d97706'}}>⏱ {v.mins}m fuera</span>
                        </div>
                        <p className="text-[6px]" style={{color:'#64748b'}}>{v.co}</p>
                        <div className="flex gap-2 mt-0.5">
                          <p className="text-[6px] font-mono" style={{color:'#94a3b8'}}>Salió: {v.out}</p>
                        </div>
                      </div>
                    </div>
                    {/* Footer */}
                    <div className="px-2 py-1.5 flex items-center justify-between" style={{borderTop:'1px solid rgba(245,158,11,0.2)',background:'rgba(245,158,11,0.03)'}}>
                      <span className="text-[6px]" style={{color:'#94a3b8'}}>▾ {v.intervals} intervalo{v.intervals>1?'s':''}</span>
                      <div className="h-5 px-2 rounded flex items-center" style={{background:'rgba(34,197,94,0.1)',border:'1px solid rgba(34,197,94,0.3)'}}>
                        <span className="text-[6px] font-bold uppercase" style={{color:'#16a34a'}}>✓ Regresó</span>
                      </div>
                    </div>
                  </div>
                ))}

              </div>
            </ScreenMock>
          </div>

          {/* ── EN ESPERA ── */}
          <div className="grid lg:grid-cols-2 gap-12 items-start">
            <ScreenMock title="en espera · visitantes aguardando" accent="#f59e0b">
              <div className="space-y-2" style={{background:'#f0f4f8',borderRadius:8,padding:8}}>

                {/* Tab bar showing En Espera active */}
                <div className="flex gap-0 pb-1 mb-1" style={{borderBottom:'1px solid #e2e8f0'}}>
                  {[
                    {label:'Activas', count:3, active:false, c:'#22c55e'},
                    {label:'En Espera', count:2, active:true, c:'#d97706'},
                    {label:'Intermitencia', count:1, active:false, c:'#d97706'},
                    {label:'Admin Visit.', count:null, active:false, c:'#94a3b8'},
                  ].map(tab => (
                    <div key={tab.label} className="flex items-center gap-1 px-2 py-1 relative">
                      <span className="text-[7px] uppercase font-bold" style={{color: tab.active ? tab.c : '#94a3b8'}}>{tab.label}</span>
                      {tab.count !== null && tab.count > 0 && (
                        <span className="text-[6px] font-bold px-1 rounded-full" style={{background: tab.active ? 'rgba(245,158,11,0.15)':'rgba(34,197,94,0.08)', color: tab.active ? '#d97706':'#94a3b8'}}>{tab.count}</span>
                      )}
                      {tab.active && <div className="absolute bottom-0 left-0 right-0 h-px" style={{background:tab.c}} />}
                    </div>
                  ))}
                </div>

                {/* Section header */}
                <div className="flex items-center gap-1 mb-1">
                  <span className="text-[8px]">⏰</span>
                  <span className="text-[8px] font-bold uppercase tracking-widest" style={{color:'#1e293b'}}>Visitas en Espera</span>
                </div>

                {/* Waiting cards grid */}
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { name:'Pedro Sánchez', co:'Constructora ABC', cedula:'8.234.567', reason:'Reunión con Ing. Torres' },
                    { name:'Ana Martínez', co:'Proveedor Nacional', cedula:'11.456.789', reason:'Entrega de materiales' },
                  ].map(v => (
                    <div key={v.name} className="rounded-lg flex flex-col overflow-hidden relative" style={{background:'#ffffff',border:'1px solid #e2e8f0'}}>
                      {/* amber corner gradient */}
                      <div className="absolute top-0 right-0 w-8 h-8 rounded-bl-lg" style={{background:'linear-gradient(to bottom-left, rgba(245,158,11,0.15), transparent)'}} />
                      <div className="p-2 flex gap-2">
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{background:'#f8fafc',border:'1px solid #e2e8f0'}}>
                          <span className="text-[8px]">⏰</span>
                        </div>
                        <div className="min-w-0">
                          <p className="text-[7px] font-bold truncate" style={{color:'#1e293b'}}>{v.name}</p>
                          <p className="text-[6px] font-mono" style={{color:'#94a3b8'}}>{v.cedula}</p>
                          <p className="text-[6px] flex items-center gap-0.5" style={{color:'#64748b'}}>
                            <span>🏢</span>{v.co}
                          </p>
                        </div>
                      </div>
                      <div className="px-2 pb-1 space-y-1">
                        <div className="rounded px-1.5 py-1" style={{background:'#f8fafc',border:'1px solid #e2e8f0'}}>
                          <p className="text-[5px] uppercase tracking-wider" style={{color:'#94a3b8'}}>Motivo / Visita a:</p>
                          <p className="text-[6px] font-medium truncate" style={{color:'#1e293b'}}>{v.reason}</p>
                        </div>
                        <div className="h-5 rounded flex items-center justify-center gap-1" style={{background:'rgba(34,197,94,0.08)',border:'1px solid rgba(34,197,94,0.3)'}}>
                          <span className="text-[6px]">✓</span>
                          <span className="text-[6px] font-bold uppercase" style={{color:'#16a34a'}}>Admitir Entrada</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

              </div>
            </ScreenMock>

            <div className="space-y-5">
              <div className="flex items-center gap-3">
                <span className="text-3xl">⏰</span>
                <div>
                  <Tag color="amber">Pre-registro</Tag>
                  <h3 className="text-2xl font-bold mt-1">Visitas en Espera</h3>
                  <p className="text-[#4a6a82] text-xs uppercase tracking-wider">WaitingVisits · Pestaña En Espera</p>
                </div>
              </div>
              <p className="text-slate-600 leading-relaxed">
                Un visitante puede ser registrado con anticipación y quedar en estado <span className="text-amber-600 font-semibold">En Espera</span> hasta que el guardia confirme su ingreso físico. Ideal para visitas programadas, proveedores con cita o cuando la persona que va a ser visitada aún no ha dado autorización.
              </p>
              <p className="text-slate-600 leading-relaxed">
                Al llegar, el guardia presiona <strong className="text-slate-900">ADMITIR ENTRADA</strong> y la visita pasa inmediatamente a <span className="text-emerald-600 font-semibold">Activa</span>, con su hora de check-in registrada en ese instante.
              </p>
              <div className="space-y-1">
                <FeatureRow icon="📋" label="Pre-registro de visitas programadas" />
                <FeatureRow icon="✅" label="Admisión con un click → pasa a Activa" />
                <FeatureRow icon="⏱️" label="Check-in se registra en el momento de admisión" />
                <FeatureRow icon="🔔" label="Conteo de visitantes en espera en la pestaña" />
                <FeatureRow icon="👁️" label="Click en tarjeta abre modal con detalles completos" />
              </div>
              <div className="flex flex-wrap gap-2">
                <Tag color="amber">Estado: En Espera</Tag>
                <Tag color="green">100% Completado</Tag>
              </div>
            </div>
          </div>

          {/* ── VISTAS DE REGISTRO: WIZARD ── */}
          <div className="space-y-8">
            <div className="text-center space-y-2">
              <h3 className="text-2xl font-bold text-slate-900">Flujo de Registro — <span className="text-emerald-600">Wizard de 4 Pasos</span></h3>
              <p className="text-slate-500 text-sm">Cada entrada sigue un proceso guiado, validado y auditado paso a paso.</p>
            </div>

            <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-6">

              {/* Paso 1 */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="w-7 h-7 rounded-full bg-emerald-500 text-white text-xs font-black flex items-center justify-center">1</span>
                  <div>
                    <p className="font-bold text-sm text-slate-800">Identificación</p>
                    <p className="text-[10px] text-slate-400">VisitorLookupStep</p>
                  </div>
                </div>
                <ScreenMock title="paso 1 — identificación" accent="#22c55e">
                  <div className="space-y-2" style={{background:'#f0f4f8',borderRadius:6,padding:8}}>
                    <p className="text-[8px] uppercase tracking-widest" style={{color:'#16a34a'}}>Cédula de Identidad</p>
                    <div className="h-7 rounded px-2 flex items-center justify-between" style={{background:'#ffffff',border:'1px solid rgba(34,197,94,0.5)'}}>
                      <span className="text-[8px] font-mono" style={{color:'#1e293b'}}>12345678</span>
                      <span className="text-[7px]" style={{color:'#22c55e'}}>✓ válida</span>
                    </div>
                    <div className="grid grid-cols-2 gap-1">
                      <div className="h-6 rounded px-2 flex items-center" style={{background:'#ffffff',border:'1px solid #e2e8f0'}}>
                        <span className="text-[7px]" style={{color:'#1e293b'}}>Carlos</span>
                      </div>
                      <div className="h-6 rounded px-2 flex items-center" style={{background:'#ffffff',border:'1px solid rgba(34,197,94,0.4)'}}>
                        <span className="text-[7px]" style={{color:'#1e293b'}}>Pérez</span>
                      </div>
                    </div>
                    <div className="h-6 rounded flex items-center justify-center" style={{background:'#22c55e'}}>
                      <span className="text-[7px] font-bold uppercase" style={{color:'#ffffff'}}>Siguiente →</span>
                    </div>
                    <p className="text-[7px] text-center" style={{color:'#64748b'}}>Autocompletado si visitante existe en BD</p>
                  </div>
                </ScreenMock>
                <div className="space-y-1">
                  <FeatureRow icon="🔍" label="Lookup automático en base de datos" />
                  <FeatureRow icon="✅" label="Validación 7-8 dígitos en tiempo real" />
                  <FeatureRow icon="📜" label="Ver historial del visitante" />
                </div>
                <Tag color="green">100% Completado</Tag>
              </div>

              {/* Paso 2 */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="w-7 h-7 rounded-full bg-[#e63e2a] text-white text-xs font-black flex items-center justify-center">2</span>
                  <div>
                    <p className="font-bold text-sm">Datos del Visitante</p>
                    <p className="text-[10px] text-[#4a6a82]">VisitorInfoStep</p>
                  </div>
                </div>
                <ScreenMock title="paso 2 — datos" accent="#22c55e">
                  <div className="space-y-2" style={{background:'#f0f4f8',borderRadius:6,padding:8}}>
                    <p className="text-[8px] uppercase tracking-widest" style={{color:'#16a34a'}}>Información Empresa</p>
                    <div className="h-6 rounded px-2 flex items-center" style={{background:'#ffffff',border:'1px solid #e2e8f0'}}>
                      <span className="text-[7px]" style={{color:'#94a3b8'}}>Empresa / Organización</span>
                    </div>
                    <div className="h-6 rounded px-2 flex items-center" style={{background:'#ffffff',border:'1px solid #e2e8f0'}}>
                      <span className="text-[7px]" style={{color:'#94a3b8'}}>Cargo / Título</span>
                    </div>
                    <div className="flex gap-1">
                      <div className="h-6 w-10 rounded flex items-center justify-center" style={{background:'#ffffff',border:'1px solid #e2e8f0'}}>
                        <span className="text-[6px]" style={{color:'#16a34a'}}>+58</span>
                      </div>
                      <div className="h-6 flex-1 rounded px-1 flex items-center" style={{background:'#ffffff',border:'1px solid #e2e8f0'}}>
                        <span className="text-[7px]" style={{color:'#94a3b8'}}>Teléfono</span>
                      </div>
                    </div>
                    <div className="p-1 rounded space-y-0.5" style={{background:'#f8fafc',border:'1px solid #e2e8f0'}}>
                      {['Distribuidora XYZ', 'Logística Total'].map(c => (
                        <div key={c} className="px-2 py-0.5 rounded" style={{background:'#ffffff'}}>
                          <span className="text-[7px]" style={{color:'#475569'}}>{c}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </ScreenMock>
                <div className="space-y-1">
                  <FeatureRow icon="🏢" label="Autocompletado de empresas registradas" />
                  <FeatureRow icon="📞" label="Selector de código de país (+58, etc.)" />
                  <FeatureRow icon="✏️" label="Cargo / puesto de trabajo" />
                </div>
                <Tag color="green">100% Completado</Tag>
              </div>

              {/* Paso 3 */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="w-7 h-7 rounded-full bg-amber-400 text-[#081116] text-xs font-black flex items-center justify-center">3</span>
                  <div>
                    <p className="font-bold text-sm">Vehículo & Acompañantes</p>
                    <p className="text-[10px] text-[#4a6a82]">VehicleInfoStep</p>
                  </div>
                </div>
                <ScreenMock title="paso 3 — vehículo" accent="#f59e0b">
                  <div className="space-y-2" style={{background:'#f0f4f8',borderRadius:6,padding:8}}>
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 rounded flex items-center justify-center" style={{border:'1px solid rgba(245,158,11,0.6)',background:'rgba(245,158,11,0.12)'}}>
                        <span className="text-[6px]" style={{color:'#d97706'}}>✓</span>
                      </div>
                      <span className="text-[8px]" style={{color:'#d97706'}}>¿Trae vehículo?</span>
                    </div>
                    <div className="grid grid-cols-2 gap-1">
                      {['Marca', 'Modelo', 'Placa'].map(f => (
                        <div key={f} className="h-5 rounded px-1 flex items-center" style={{background:'#ffffff',border:'1px solid #e2e8f0'}}>
                          <span className="text-[6px]" style={{color:'#94a3b8'}}>{f}</span>
                        </div>
                      ))}
                    </div>
                    <div className="pt-2" style={{borderTop:'1px solid #e2e8f0'}}>
                      <div className="flex items-center gap-2 mb-1">
                        <div className="w-4 h-4 rounded" style={{border:'1px solid #cbd5e1',background:'#ffffff'}} />
                        <span className="text-[8px]" style={{color:'#475569'}}>¿Tiene acompañante?</span>
                      </div>
                    </div>
                  </div>
                </ScreenMock>
                <div className="space-y-1">
                  <FeatureRow icon="🚗" label="Registro marca / modelo / placa" />
                  <FeatureRow icon="👥" label="Múltiples acompañantes con cédula" />
                  <FeatureRow icon="🔘" label="Campos opcionales con toggle" />
                </div>
                <Tag color="green">100% Completado</Tag>
              </div>

              {/* Paso 4 */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="w-7 h-7 rounded-full bg-purple-400 text-white text-xs font-black flex items-center justify-center">4</span>
                  <div>
                    <p className="font-bold text-sm">Fotos & Detalles</p>
                    <p className="text-[10px] text-[#4a6a82]">VisitDetailsStep</p>
                  </div>
                </div>
                <ScreenMock title="paso 4 — fotos & acceso" accent="#a855f7">
                  <div className="space-y-2" style={{background:'#f0f4f8',borderRadius:6,padding:8}}>
                    <div className="grid grid-cols-2 gap-1">
                      <div className="h-14 rounded flex flex-col items-center justify-center gap-1" style={{background:'#ffffff',border:'1px solid rgba(168,85,247,0.3)'}}>
                        <span className="text-base">📷</span>
                        <span className="text-[6px]" style={{color:'#94a3b8'}}>Foto Visitante</span>
                      </div>
                      <div className="h-14 rounded flex flex-col items-center justify-center gap-1" style={{background:'#ffffff',border:'1px solid rgba(168,85,247,0.3)'}}>
                        <span className="text-base">🪪</span>
                        <span className="text-[6px]" style={{color:'#94a3b8'}}>Foto Cédula</span>
                      </div>
                    </div>
                    {['Área de destino', 'Departamento', 'Persona a visitar', 'Motivo'].map(f => (
                      <div key={f} className="h-5 rounded px-1 flex items-center" style={{background:'#ffffff',border:'1px solid #e2e8f0'}}>
                        <span className="text-[6px]" style={{color:'#94a3b8'}}>{f}</span>
                      </div>
                    ))}
                    <div className="flex items-center gap-1">
                      <div className="w-3 h-3 rounded" style={{background:'rgba(168,85,247,0.15)',border:'1px solid rgba(168,85,247,0.4)'}} />
                      <span className="text-[6px]" style={{color:'#475569'}}>Acepto política de datos</span>
                    </div>
                    <div className="grid grid-cols-2 gap-1">
                      <div className="h-6 rounded flex items-center justify-center" style={{background:'#22c55e'}}>
                        <span className="text-[6px] font-bold" style={{color:'#ffffff'}}>ACTIVO</span>
                      </div>
                      <div className="h-6 rounded flex items-center justify-center" style={{background:'rgba(245,158,11,0.12)',border:'1px solid rgba(245,158,11,0.4)'}}>
                        <span className="text-[6px] font-bold" style={{color:'#d97706'}}>EN ESPERA</span>
                      </div>
                    </div>
                  </div>
                </ScreenMock>
                <div className="space-y-1">
                  <FeatureRow icon="📸" label="Captura foto visitante con webcam" />
                  <FeatureRow icon="🪪" label="Foto de cédula de identidad" />
                  <FeatureRow icon="📍" label="Área, departamento y anfitrión" />
                  <FeatureRow icon="✍️" label="Consentimiento GDPR / datos personales" />
                </div>
                <Tag color="green">100% Completado</Tag>
              </div>

            </div>
          </div>

          {/* ── VISTA ADMIN DASHBOARD ── */}
          <div className="grid lg:grid-cols-2 gap-12 items-start">
            <div className="order-2 lg:order-1">
              <ScreenMock title="/admin · dashboard administrador" accent="#22c55e">
                <div className="space-y-2" style={{background:'#f0f4f8',borderRadius:8,padding:8}}>
                  <div className="grid grid-cols-3 gap-2">
                    {[{ v:'1,247', l:'Total Visitas', c:'#16a34a' }, { v:'8', l:'Activas', c:'#16a34a' }, { v:'24', l:'Este Mes', c:'#d97706' }].map(s => (
                      <div key={s.l} className="p-2 rounded text-center" style={{background:'#ffffff',border:'1px solid #e2e8f0'}}>
                        <p className="font-bold text-sm" style={{color:s.c}}>{s.v}</p>
                        <p className="text-[6px] uppercase tracking-wider" style={{color:'#94a3b8'}}>{s.l}</p>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-1 pb-1" style={{borderBottom:'1px solid #e2e8f0'}}>
                    {['Reportes','Calendario','Respaldos','Log Activity'].map((t,i) => (
                      <span key={t} className="text-[7px] uppercase px-2 py-0.5 rounded" style={{color: i===0 ? '#16a34a' : '#94a3b8', background: i===0 ? 'rgba(34,197,94,0.1)' : 'transparent'}}>{t}</span>
                    ))}
                  </div>
                  <div className="h-14 rounded flex items-end justify-around px-2 pb-1 gap-0.5" style={{background:'#ffffff',border:'1px solid #e2e8f0'}}>
                    {[4,7,5,9,6,8,11,6,4,7,10,8].map((h,i) => (
                      <div key={i} className="flex-1 rounded-t" style={{height:`${h*4}px`,background:'#22c55e',opacity:0.75}} />
                    ))}
                  </div>
                  <div className="rounded overflow-hidden" style={{background:'#ffffff',border:'1px solid #e2e8f0'}}>
                    <div className="grid grid-cols-4 px-2 py-1" style={{background:'#f8fafc',borderBottom:'1px solid #e2e8f0'}}>
                      {['Visitante','Empresa','Entrada','Estado'].map(h => (
                        <span key={h} className="text-[6px] uppercase" style={{color:'#94a3b8'}}>{h}</span>
                      ))}
                    </div>
                    {[
                      { n:'C. Pérez', e:'Dist. XYZ', t:'08:32', s:'activo' },
                      { n:'M. López', e:'Logística', t:'09:15', s:'activo' },
                      { n:'R. Torres', e:'Proveedor', t:'07:50', s:'salida' },
                    ].map(r => (
                      <div key={r.n} className="grid grid-cols-4 px-2 py-1" style={{borderBottom:'1px solid #f1f5f9'}}>
                        <span className="text-[7px]" style={{color:'#1e293b'}}>{r.n}</span>
                        <span className="text-[7px]" style={{color:'#64748b'}}>{r.e}</span>
                        <span className="text-[7px]" style={{color:'#16a34a'}}>{r.t}</span>
                        <span className="text-[6px] font-bold uppercase" style={{color: r.s==='activo' ? '#16a34a' : '#94a3b8'}}>{r.s}</span>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-1">
                    <div className="h-5 px-2 rounded flex items-center" style={{background:'rgba(34,197,94,0.1)',border:'1px solid rgba(34,197,94,0.3)'}}>
                      <span className="text-[7px] uppercase" style={{color:'#16a34a'}}>📥 Excel</span>
                    </div>
                    <div className="h-5 px-2 rounded flex items-center" style={{background:'rgba(239,68,68,0.1)',border:'1px solid rgba(239,68,68,0.25)'}}>
                      <span className="text-[7px] uppercase" style={{color:'#dc2626'}}>📄 PDF</span>
                    </div>
                  </div>
                </div>
              </ScreenMock>
            </div>

            <div className="order-1 lg:order-2 space-y-5">
              <div className="flex items-center gap-3">
                <span className="text-3xl">📊</span>
                <div>
                  <Tag color="red">Vista Admin</Tag>
                  <h3 className="text-2xl font-bold mt-1">Dashboard Administrador</h3>
                  <p className="text-[#4a6a82] text-xs uppercase tracking-wider">AdminDashboard · Rol: admin</p>
                </div>
              </div>
              <p className="text-[#8ca0b3] leading-relaxed">
                Panel completo con <strong className="text-white">4 pestañas</strong> especializadas. El administrador tiene visión total de la operación:
                estadísticas, registros históricos, respaldos y logs de sistema.
              </p>

              <div className="grid grid-cols-2 gap-3">
                {[
                  { icon: '📈', title: 'Reportes', desc: 'Tabla paginada + gráficos Chart.js. Exporta a Excel y PDF con fotos.', pct: 90 },
                  { icon: '📅', title: 'Calendario', desc: 'Vista mensual/semanal/diaria de visitas con React Big Calendar.', pct: 85 },
                  { icon: '💾', title: 'Respaldos', desc: 'Backups cifrados (.sqlite.enc). Restauración con un click.', pct: 95 },
                  { icon: '🗂️', title: 'Log de Actividades', desc: 'Registro de todas las acciones del sistema con timestamps.', pct: 88 },
                ].map(t => (
                  <div key={t.title} className="p-3 rounded-xl bg-white/5 border border-white/10 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-lg">{t.icon}</span>
                      <span className="text-[9px] text-[#4dd7ff] font-bold">{t.pct}%</span>
                    </div>
                    <p className="font-bold text-sm">{t.title}</p>
                    <p className="text-[#8ca0b3] text-[10px] leading-relaxed">{t.desc}</p>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                <Tag color="cyan">Chart.js</Tag>
                <Tag color="green">XLSX + jsPDF</Tag>
                <Tag color="amber">React Big Calendar</Tag>
              </div>
            </div>
          </div>

          {/* ── VISTA AUDITORIA ── */}
          <div className="grid lg:grid-cols-2 gap-12 items-start">
            <div className="space-y-5">
              <div className="flex items-center gap-3">
                <span className="text-3xl">🛡️</span>
                <div>
                  <Tag color="amber">Vista Auditoría</Tag>
                  <h3 className="text-2xl font-bold mt-1">Dashboard de Auditoría</h3>
                  <p className="text-[#4a6a82] text-xs uppercase tracking-wider">AuditDashboard · Rol: admin / auditor</p>
                </div>
              </div>
              <p className="text-[#8ca0b3] leading-relaxed">
                Vista dedicada para auditores internos o administradores. Provee <strong className="text-white">trazabilidad completa</strong> de cada 
                acción realizada en el sistema, con filtros avanzados y exportación CSV.
              </p>
              <div className="space-y-1">
                <FeatureRow icon="📊" label="Estadísticas de auditoría en tiempo real" />
                <FeatureRow icon="🔎" label="Filtros por acción, usuario, fecha e IP" />
                <FeatureRow icon="📄" label="Exportación a CSV (audit_logs_YYYY-MM-DD)" />
                <FeatureRow icon="🔄" label="Auto-refresh cada 30 segundos" />
                <FeatureRow icon="📑" label="Paginación de logs (20 por página)" />
              </div>
              <div className="flex flex-wrap gap-2">
                <Tag color="amber">ISO 27001 Ready</Tag>
                <Tag color="cyan">CSV Export</Tag>
                <Tag color="green">88% Completado</Tag>
              </div>
            </div>

            <ScreenMock title="/audit · auditoría del sistema" accent="#f59e0b">
              <div className="space-y-2" style={{background:'#f0f4f8',borderRadius:8,padding:8}}>
                <div className="grid grid-cols-3 gap-1">
                  {[{ v:'3,891', l:'Eventos', c:'#d97706' }, { v:'12', l:'Usuarios', c:'#16a34a' }, { v:'0', l:'Alertas', c:'#16a34a' }].map(s => (
                    <div key={s.l} className="p-2 rounded text-center" style={{background:'#ffffff',border:'1px solid #e2e8f0'}}>
                      <p className="font-bold text-sm" style={{color:s.c}}>{s.v}</p>
                      <p className="text-[6px] uppercase" style={{color:'#94a3b8'}}>{s.l}</p>
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-1">
                  {['Acción...','Usuario...','Desde','Hasta'].map(f => (
                    <div key={f} className="h-5 rounded px-1 flex items-center" style={{background:'#ffffff',border:'1px solid #e2e8f0'}}>
                      <span className="text-[6px]" style={{color:'#94a3b8'}}>{f}</span>
                    </div>
                  ))}
                </div>
                <div className="rounded overflow-hidden" style={{background:'#ffffff',border:'1px solid #e2e8f0'}}>
                  {[
                    { user:'admin', action:'LOGIN', time:'10:32', ip:'192.168.1.1' },
                    { user:'guardia_01', action:'CHECK_IN', time:'10:35', ip:'192.168.1.5' },
                    { user:'guardia_01', action:'CHECK_OUT', time:'12:15', ip:'192.168.1.5' },
                    { user:'admin', action:'BACKUP', time:'13:00', ip:'192.168.1.1' },
                  ].map((l,i) => (
                    <div key={i} className="grid grid-cols-4 px-2 py-1" style={{borderBottom:'1px solid #f1f5f9'}}>
                      <span className="text-[6px]" style={{color:'#16a34a'}}>{l.user}</span>
                      <span className="text-[6px] font-mono" style={{color:'#d97706'}}>{l.action}</span>
                      <span className="text-[6px]" style={{color:'#64748b'}}>{l.time}</span>
                      <span className="text-[6px]" style={{color:'#94a3b8'}}>{l.ip}</span>
                    </div>
                  ))}
                </div>
                <div className="h-5 rounded flex items-center justify-center" style={{background:'rgba(245,158,11,0.1)',border:'1px solid rgba(245,158,11,0.35)'}}>
                  <span className="text-[7px] uppercase" style={{color:'#d97706'}}>📤 Exportar CSV</span>
                </div>
              </div>
            </ScreenMock>
          </div>

          {/* ── VISTA SUPERADMIN ── */}
          <div className="grid lg:grid-cols-2 gap-12 items-start">
            <div className="order-2 lg:order-1">
              <ScreenMock title="/superadmin · gestión de usuarios" accent="#a855f7">
                <div className="space-y-2" style={{background:'#f0f4f8',borderRadius:8,padding:8}}>
                  <div className="flex items-center justify-between pb-2" style={{borderBottom:'1px solid #e2e8f0'}}>
                    <span className="text-[9px] font-bold uppercase tracking-widest" style={{color:'#7c3aed'}}>⚙️ SuperAdmin Panel</span>
                    <span className="text-[7px] px-2 py-0.5 rounded" style={{background:'rgba(168,85,247,0.1)',color:'#7c3aed',border:'1px solid rgba(168,85,247,0.3)'}}>superadmin</span>
                  </div>
                  <div className="flex gap-1">
                    <span className="text-[7px] uppercase px-2 py-0.5 rounded" style={{background:'rgba(168,85,247,0.1)',color:'#7c3aed'}}>Usuarios</span>
                    <span className="text-[7px] uppercase px-2 py-0.5 rounded" style={{color:'#94a3b8'}}>Audit Logs</span>
                  </div>
                  <div className="rounded overflow-hidden" style={{background:'#ffffff',border:'1px solid #e2e8f0'}}>
                    <div className="grid grid-cols-4 px-2 py-1" style={{background:'#f8fafc',borderBottom:'1px solid #e2e8f0'}}>
                      {['Usuario','Rol','Estado','Acciones'].map(h => (
                        <span key={h} className="text-[6px] uppercase" style={{color:'#94a3b8'}}>{h}</span>
                      ))}
                    </div>
                    {[
                      { u:'admin', r:'admin', s:'activo' },
                      { u:'guardia_01', r:'guard', s:'activo' },
                      { u:'auditor', r:'auditor', s:'activo' },
                    ].map(u => (
                      <div key={u.u} className="grid grid-cols-4 px-2 py-1 items-center" style={{borderBottom:'1px solid #f1f5f9'}}>
                        <span className="text-[7px]" style={{color:'#1e293b'}}>{u.u}</span>
                        <span className="text-[6px]" style={{color:'#7c3aed'}}>{u.r}</span>
                        <span className="text-[6px]" style={{color:'#16a34a'}}>{u.s}</span>
                        <div className="flex gap-0.5">
                          <span className="text-[6px]" style={{color:'#d97706'}}>✏️</span>
                          <span className="text-[6px]" style={{color:'#dc2626'}}>🗑</span>
                          <span className="text-[6px]" style={{color:'#16a34a'}}>🔑</span>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="h-6 rounded flex items-center justify-center" style={{background:'rgba(168,85,247,0.08)',border:'1px solid rgba(168,85,247,0.3)'}}>
                    <span className="text-[7px] font-bold uppercase" style={{color:'#7c3aed'}}>+ Crear Nuevo Usuario</span>
                  </div>
                </div>
              </ScreenMock>
            </div>

            <div className="order-1 lg:order-2 space-y-5">
              <div className="flex items-center gap-3">
                <span className="text-3xl">⚙️</span>
                <div>
                  <Tag color="purple">Vista SuperAdmin</Tag>
                  <h3 className="text-2xl font-bold mt-1">Panel SuperAdministrador</h3>
                  <p className="text-[#4a6a82] text-xs uppercase tracking-wider">SuperAdminDashboard · Rol: superadmin</p>
                </div>
              </div>
              <p className="text-[#8ca0b3] leading-relaxed">
                Acceso máximo al sistema. Gestión completa de usuarios, roles y acceso a todos los logs de auditoría
                del sistema. Única vista con poder de <strong className="text-white">crear, editar y eliminar cuentas</strong>.
              </p>
              <div className="space-y-1">
                <FeatureRow icon="👤" label="Crear usuarios con username, password y rol" />
                <FeatureRow icon="✏️" label="Editar username y rol de cualquier usuario" />
                <FeatureRow icon="🗑️" label="Eliminar usuarios (con confirmación)" />
                <FeatureRow icon="🔑" label="Resetear contraseña de cualquier cuenta" />
                <FeatureRow icon="📋" label="Visualizar audit logs globales" />
              </div>
              <div className="grid grid-cols-3 gap-2">
                {['Guard', 'Admin', 'Auditor'].map(r => (
                  <div key={r} className="p-2 rounded-lg bg-purple-500/10 border border-purple-400/20 text-center">
                    <p className="text-purple-300 font-bold text-xs">{r}</p>
                    <p className="text-[9px] text-[#4a6a82]">Rol disponible</p>
                  </div>
                ))}
              </div>
              <Tag color="purple">100% Completado</Tag>
            </div>
          </div>

          {/* ── VISTAS ADICIONALES ── */}
          <div className="space-y-6">
            <h3 className="text-xl font-bold text-center">Vistas adicionales del sistema</h3>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {[
                {
                  icon: '🔐', title: 'Recuperar Contraseña', comp: 'ForgotPassword + ResetPassword', pct: 95, color: 'cyan',
                  feats: ['Solicitud por username/email', 'Token seguro por email', 'Reset con nueva contraseña', 'Expiración automática del token']
                },
                {
                  icon: '🔄', title: 'Cambio Obligatorio de Clave', comp: 'PasswordChangeModal', pct: 100, color: 'green',
                  feats: ['Modal global en primer login', 'Validación de complejidad', 'mustChangePassword flag en BD', 'Fuerza cierre de sesión tras cambio']
                },
                {
                  icon: '⏰', title: 'Sesión & Timeout', comp: 'SessionWarningModal', pct: 100, color: 'amber',
                  feats: ['Aviso 5 min antes de expirar', 'Botón "Extender Sesión"', 'Logout automático por inactividad', 'JWT con expiración configurable']
                },
                {
                  icon: '👁️', title: 'Detalles de Visita', comp: 'VisitorDetailsModal + VisitDetailsModal', pct: 95, color: 'cyan',
                  feats: ['Modal con foto y datos completos', 'Historial de visitas del visitante', 'Ver acompañantes y vehículo', 'Información del anfitrión y área']
                },
                {
                  icon: '⏸️', title: 'Visitas en Espera', comp: 'WaitingVisits', pct: 90, color: 'amber',
                  feats: ['Lista de visitantes pendientes', 'Admitir con click (→ activo)', 'Polling o SSE tiempo real', 'Contador de tiempo en espera']
                },
                {
                  icon: '↔️', title: 'Visitas Intermitentes', comp: 'IntermittentVisits', pct: 88, color: 'amber',
                  feats: ['Visitas con salidas temporales', 'Reactivar visita con click', 'Log de cada salida temporal', 'Badge contador en tab']
                },
              ].map(v => (
                <div key={v.title} className="p-5 rounded-xl border border-white/10 bg-white/5 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-2xl">{v.icon}</span>
                    <Tag color={v.color as 'cyan' | 'amber' | 'green'}>{v.pct}%</Tag>
                  </div>
                  <div>
                    <h4 className="font-bold text-sm">{v.title}</h4>
                    <p className="text-[9px] text-[#4a6a82] font-mono">{v.comp}</p>
                  </div>
                  <ul className="space-y-1">
                    {v.feats.map(f => (
                      <li key={f} className="text-[10px] text-[#8ca0b3] flex gap-1.5">
                        <span className="text-[#4dd7ff] mt-0.5">›</span> {f}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>

        </div>
      </Section>

      {/* ══════════════════════════════════════════════════════════════════════
          4. CIERRE Y CTA
      ══════════════════════════════════════════════════════════════════════ */}
      <Section id="cta" className="flex items-center justify-center bg-white">
        <div className="absolute inset-0"
          style={{
            backgroundImage: 'radial-gradient(ellipse at 50% 50%, rgba(14,165,233,0.06) 0%, transparent 60%)',
          }} />
        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-sky-300/50 to-transparent" />

        <div className="relative z-10 max-w-5xl mx-auto px-6 py-20 w-full text-center space-y-12">
          <div className="space-y-3">
            <p className="text-[11px] uppercase tracking-[0.4em] text-[#e63e2a] font-semibold">04 — Contacto</p>
            <h2 className="text-4xl md:text-6xl font-black leading-tight text-slate-900">
              ¿Listo para tener<br /><span className="text-sky-600">control total</span><br />de tu acceso?
            </h2>
            <p className="text-slate-500 text-lg max-w-xl mx-auto">
              Contáctanos para más información sobre el sistema.
            </p>
          </div>

          {/* Contact info */}
          <div className="grid sm:grid-cols-2 gap-6 mt-8 max-w-xl mx-auto">
            {[
              { icon: '📧', label: 'Gustavo Colina', value: 'gustavojose0819@gmail.com', sub: 'Desarrollador Principal' },
              { icon: '�', label: 'German Cordero', value: 'germanpromo30@gmail.com', sub: 'Desarrollador' },
            ].map(c => (
              <div key={c.label} className="p-5 rounded-xl border border-slate-200 bg-slate-50 space-y-2 text-center">
                <span className="text-3xl">{c.icon}</span>
                <p className="text-[10px] uppercase tracking-widest text-slate-400">{c.label}</p>
                <p className="font-bold text-sm text-slate-800">{c.value}</p>
                <p className="text-slate-400 text-xs">{c.sub}</p>
              </div>
            ))}
          </div>

          {/* Location */}
          <div className="p-5 rounded-xl border border-slate-200 bg-slate-50 space-y-2">
            <span className="text-2xl">📍</span>
            <p className="font-bold text-slate-800">Industrias Alimentos El Trébol</p>
            <p className="text-slate-500 text-sm">Venezuela — Disponible para instalación on-premise o demo remota</p>
            <p className="text-[10px] text-slate-400 uppercase tracking-wider">Sistema Electron — Funciona 100% sin conexión a internet</p>
          </div>

          {/* Developers */}
          <div className="p-6 rounded-xl border border-sky-200 bg-sky-50 space-y-4">
            <p className="text-[11px] uppercase tracking-[0.3em] text-slate-400">Desarrollado por</p>
            <div className="flex flex-wrap justify-center gap-6">
              {[
                { name: 'Gustavo Colina', role: 'Desarrollador Principal', github: 'Suggus1899' },
                { name: 'German Cordero', role: 'Desarrollador', github: null },
              ].map(dev => (
                <div key={dev.name} className="flex flex-col items-center gap-2">
                  <div className="w-12 h-12 rounded-full bg-sky-100 border border-sky-300 flex items-center justify-center">
                    <span className="text-sky-600 font-black text-lg">{dev.name.charAt(0)}</span>
                  </div>
                  <p className="font-bold text-slate-800 text-sm">{dev.name}</p>
                  <p className="text-slate-400 text-[10px] uppercase tracking-wider">{dev.role}</p>
                  {dev.github && (
                    <a href={`https://github.com/${dev.github}`} target="_blank" rel="noreferrer"
                      className="flex items-center gap-1 text-[10px] text-slate-500 hover:text-slate-800 transition-colors">
                      <svg viewBox="0 0 24 24" className="w-3 h-3 fill-current"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>
                      @{dev.github}
                    </a>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Footer */}
          <div className="border-t border-slate-200 pt-8 space-y-3">
            <div className="flex justify-center">
              <img src="/src/logo/trebol_logo.png" alt="Industrias Alimentos El Trébol" className="h-16 w-auto object-contain opacity-90" />
            </div>
            <p className="text-[11px] uppercase tracking-[0.3em] text-slate-400">
              Industrias Alimentos El Trébol © 2025 — LogMaster v1.0.0-rc.2
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              <Tag color="cyan">React + TypeScript</Tag>
              <Tag color="amber">Electron Desktop</Tag>
              <Tag color="red">SQLite AES-256</Tag>
              <Tag color="green">Node.js + Express</Tag>
            </div>
          </div>
        </div>
      </Section>

    </div>
  );
}
