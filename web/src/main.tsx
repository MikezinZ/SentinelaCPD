import { Activity, ArrowRight, BellRing, FlaskConical, LayoutDashboard, LogOut, ShieldCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, NavLink, Route, Routes, useNavigate } from 'react-router-dom';
import { Banner, Brand, Empty, Failure, Loading } from './components/ui';
import type { Role, User } from './contracts';
import { Alerts } from './features/alerts';
import { Demo, DeviceDetails, Devices } from './features/devices';
import { History } from './features/history';
import { DeviceLimits } from './features/limits';
import { demoEmail, demoPassword, roles, setScenario } from './mocks/server';
import type { Scenario } from './mocks/server';
import { api, apiBase, useMocks } from './services/api';
import './style.css';

const roleLabels: Record<Role, string> = { admin: 'Administrador', operator: 'Operador', viewer: 'Visualizador' };

function Login({ onUser }: { onUser: (value: User) => void }) {
  const [email, setEmail] = useState(''), [password, setPassword] = useState('');
  const [error, setError] = useState<Error | null>(null), [busy, setBusy] = useState(false);
  async function submit(address: string, secret: string) {
    setBusy(true);
    setError(null);
    try { onUser(await api.login(address, secret)); }
    catch (failure) {
      setPassword('');
      setError(failure instanceof Error ? failure : new Error('Não foi possível entrar.'));
    } finally { setBusy(false); }
  }
  return <main className="login-layout"><section className="login-brand"><Brand/><div className="login-message"><span className="eyebrow"><Activity size={16}/> TELEMETRIA DE DATA CENTER</span><h1>O CPD em<br/>tempo real.</h1><p>Monitore temperatura, umidade e corrente RMS dos racks. Acompanhe ocorrências em uma única central de alertas.</p></div><span className="login-foot"><ShieldCheck size={17}/> Acesso restrito a contas provisionadas</span></section><section className="login-content"><div className="login-box"><div className="login-mobile-brand"><Brand/></div><h2>Entrar no SentinelaCPD</h2><p>Acesse a central de monitoramento do CPD.</p>
    <form onSubmit={event => { event.preventDefault(); void submit(email, password); }}><label>E-mail<input type="email" autoComplete="username" required value={email} onChange={event => setEmail(event.target.value)} placeholder="nome@empresa.com.br"/></label><label>Senha<input type="password" autoComplete="current-password" required value={password} onChange={event => setPassword(event.target.value)} placeholder="Digite sua senha"/></label>{error && <Failure error={error}/>}<button className="button primary" disabled={busy}>{busy ? 'Entrando…' : 'Entrar'} <ArrowRight size={17}/></button></form>
    {useMocks && <div className="login-demo"><strong><FlaskConical size={17}/> Modo Demonstração</strong><p>Entre com um perfil de teste para explorar suas permissões.</p><div>{roles.map(role => <button key={role} className="button" disabled={busy} onClick={() => { const address = demoEmail(role); setEmail(address); void submit(address, demoPassword); }}>{roleLabels[role]}</button>)}</div></div>}
    </div></section></main>;
}

function App() {
  const [user, setUser] = useState<User | null>(null), [restoring, setRestoring] = useState(!useMocks);
  const [scenario, setDemo] = useState<Scenario>('normal');
  const navigate = useNavigate();
  useEffect(() => {
    api.onExpired(() => {
      setUser(null);
      setDemo('normal');
      setScenario('normal');
      navigate('/login', { replace: true });
    });
    return () => api.onExpired(() => {});
  }, [navigate]);
  useEffect(() => {
    if (!useMocks) void api.restore().then(setUser).catch(() => setUser(null)).finally(() => setRestoring(false));
  }, []);
  function change(value: Scenario) {
    setScenario(value);
    setDemo(value);
    if (value === 'expired') void api.me().catch(() => {});
    else window.dispatchEvent(new Event("demo:change"));
  }
  async function logout() {
    setUser(null);
    navigate('/login', { replace: true });
    setScenario('normal');
    setDemo('normal');
    await api.logout().catch(() => {});
  }
  if (restoring) return <Loading/>;
  if (!user) return <Routes><Route path="/login" element={<Login onUser={value => { setUser(value); navigate('/devices', { replace: true }); }}/>}/><Route path="*" element={<Navigate to="/login" replace/>}/></Routes>;
  return <div className="shell"><a className="skip-link" href="#main">Ir para o conteúdo</a><aside className="sidebar"><Brand/><nav aria-label="Menu principal"><span>OPERAÇÃO</span><NavLink to="/devices"><LayoutDashboard size={19}/> Visão geral</NavLink><NavLink to="/alerts"><BellRing size={19}/> Central de alertas</NavLink></nav><div className="sidebar-end"><div className="environment"><span><Activity size={16}/></span><div><strong>{useMocks ? 'Ambiente simulado' : 'Ambiente de operação'}</strong><small>{useMocks ? 'Dados de demonstração' : apiBase}</small></div></div><div className="sidebar-version">SENTINELACPD <span>V1.0</span></div></div></aside>
    <div className="workspace"><header className="topbar"><div className="topbar-label"><span className="topbar-mark"><Activity size={17}/></span> Monitoramento <span className="breadcrumb-divider">/</span> <span>CPD</span></div><div className="profile"><div className="avatar">{user.name.split(' ').slice(0, 2).map(word => word[0]).join('')}</div><div><strong>{user.name}</strong><small>{roleLabels[user.role]}</small></div><button className="icon-button" aria-label="Sair da sessão" title="Sair da sessão" onClick={() => void logout()}><LogOut size={18}/></button></div></header>
      <main id="main" className="main"><Routes><Route path="/devices" element={<Devices scenario={scenario} change={change}/>}/><Route path="/devices/:id" element={<DeviceDetails role={user.role}/>}/><Route path="/devices/:id/history" element={<History/>}/><Route path="/devices/:id/limits" element={user.role === 'admin' ? <DeviceLimits/> : <Banner tone="red" title="Acesso restrito">A configuração de limites exige o perfil administrador.</Banner>}/><Route path="/alerts" element={<Alerts role={user.role}/>}/><Route path="/" element={<Navigate to="/devices" replace/>}/><Route path="/login" element={<Navigate to="/devices" replace/>}/><Route path="*" element={<Empty title="Página não encontrada"><NavLink to="/devices">Voltar para a visão geral</NavLink></Empty>}/></Routes><div className="secondary-demo">{useMocks && <Routes><Route path="/devices" element={null}/><Route path="*" element={<Demo scenario={scenario} change={change}/>}/></Routes>}</div></main>
    </div></div>;
}
createRoot(document.getElementById('root')!).render(<BrowserRouter><App/></BrowserRouter>);
