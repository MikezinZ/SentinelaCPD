import { Link2, Pencil, RefreshCw, Save, UserPlus, X } from 'lucide-react';
import { useState } from 'react';
import { Banner, Empty, Failure, Heading, Loading, dateTime } from '../components/ui';
import { ApiError } from '../contracts';
import type { Device, ManagedUser, Role } from '../contracts';
import { api } from '../services/api';
import { useResource } from '../services/useResource';

const roleNames: Record<Role, string> = { admin: 'Administrador', operator: 'Operador', viewer: 'Visualizador' };
const errorOf = (failure: unknown) => failure instanceof Error ? failure : new Error('Falha na solicitação.');
const fieldsOf = (failure: unknown) => failure instanceof ApiError && failure.fields ? failure.fields : {};

function NewUserForm({ onSaved }: { onSaved: () => void }) {
  const empty = { email: '', name: '', role: 'operator' as Role, password: '' };
  const [form, setForm] = useState(empty), [busy, setBusy] = useState(false);
  const [error, setError] = useState<Error | null>(null), [fields, setFields] = useState<Record<string, string>>({});
  const [done, setDone] = useState('');
  return <form className="form-panel" onSubmit={async event => {
    event.preventDefault();
    setBusy(true); setError(null); setFields({}); setDone('');
    try {
      const user = await api.createUser({ ...form, email: form.email.trim(), name: form.name.trim() });
      setForm(empty);
      setDone(`${user.name} cadastrado como ${roleNames[user.role]}.`);
      onSaved();
    } catch (failure) { setError(errorOf(failure)); setFields(fieldsOf(failure)); } finally { setBusy(false); }
  }}>
    <h2><UserPlus size={18}/> Cadastrar usuário</h2>
    {error && <Failure error={error}/>}
    {done && <Banner tone="green" title={done}/>}
    <div className="form-grid">
      <label>Nome<input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} aria-invalid={!!fields.name}/>{fields.name && <small className="field-error">{fields.name}</small>}</label>
      <label>E-mail (login)<input type="email" required value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} aria-invalid={!!fields.email}/>{fields.email && <small className="field-error">{fields.email}</small>}</label>
      <label>Perfil<select value={form.role} onChange={e => setForm({ ...form, role: e.target.value as Role })}>{Object.entries(roleNames).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
      <label>Senha inicial (mín. 8)<input type="password" autoComplete="new-password" required minLength={8} value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} aria-invalid={!!fields.password}/>{fields.password && <small className="field-error">{fields.password}</small>}</label>
    </div>
    <div className="form-footer"><p>Visualizador só consulta. Operador também reconhece alertas. Administrador gerencia limites, usuários, dispositivos e firmware.</p><button className="button primary" disabled={busy}><Save size={16}/>{busy ? 'Salvando…' : 'Cadastrar'}</button></div>
  </form>;
}

function UserRow({ user, onSaved }: { user: ManagedUser; onSaved: () => void }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState<Error | null>(null);
  async function change(value: Parameters<typeof api.updateUser>[1]) {
    setBusy(true); setError(null);
    try { await api.updateUser(user.id, value); onSaved(); } catch (failure) { setError(errorOf(failure)); } finally { setBusy(false); }
  }
  return <tr>
    <td><strong>{user.name}</strong><br/><small>{user.email}</small>{error && <Failure error={error}/>}</td>
    <td><select aria-label={'Perfil de ' + user.name} value={user.role} disabled={busy} onChange={e => void change({ role: e.target.value as Role })}>{Object.entries(roleNames).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></td>
    <td><span className={'badge ' + (user.active ? 'green' : 'slate')}>{user.active ? 'Ativo' : 'Desativado'}</span></td>
    <td>{dateTime(user.created_at)}</td>
    <td className="row-actions">
      <button className="button" disabled={busy} onClick={() => void change({ active: !user.active })}>{user.active ? 'Desativar' : 'Reativar'}</button>
      <button className="button" disabled={busy} onClick={() => {
        const password = window.prompt(`Nova senha para ${user.name} (mínimo 8 caracteres):`);
        if (password) void change({ password });
      }}>Redefinir senha</button>
    </td>
  </tr>;
}

function DeviceRow({ device, onSaved }: { device: Device; onSaved: () => void }) {
  const [editing, setEditing] = useState(false), [busy, setBusy] = useState(false);
  const [name, setName] = useState(device.name), [location, setLocation] = useState(device.location);
  const [error, setError] = useState<Error | null>(null);
  async function save(change: Parameters<typeof api.updateDevice>[1]) {
    setBusy(true); setError(null);
    try { await api.updateDevice(device.id, change); setEditing(false); onSaved(); } catch (failure) { setError(errorOf(failure)); } finally { setBusy(false); }
  }
  return <tr>
    <td><code>{device.id}</code>{error && <Failure error={error}/>}</td>
    <td>{editing ? <input aria-label="Nome" value={name} onChange={e => setName(e.target.value)}/> : device.name}</td>
    <td>{editing ? <input aria-label="Local" value={location} onChange={e => setLocation(e.target.value)}/> : device.location || '—'}</td>
    <td>{device.firmware_version}</td>
    <td><span className={'badge ' + (device.enabled ? 'green' : 'slate')}>{device.enabled ? 'Ativo' : 'Desativado'}</span></td>
    <td className="row-actions">{editing ? <>
      <button className="button primary" disabled={busy} onClick={() => void save({ name, location })}><Save size={15}/> Salvar</button>
      <button className="button" disabled={busy} onClick={() => { setEditing(false); setName(device.name); setLocation(device.location); }}><X size={15}/></button>
    </> : <>
      <button className="button" onClick={() => setEditing(true)}><Pencil size={15}/> Editar</button>
      <button className="button" disabled={busy} onClick={() => void save({ enabled: !device.enabled })}>{device.enabled ? 'Desativar' : 'Reativar'}</button>
    </>}</td>
  </tr>;
}

function LinkDeviceForm({ onSaved }: { onSaved: () => void }) {
  const [id, setId] = useState(''), [name, setName] = useState(''), [location, setLocation] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState<Error | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  return <form className="form-panel" onSubmit={async event => {
    event.preventDefault();
    setBusy(true); setError(null); setFields({});
    try { await api.linkDevice(id.trim(), name.trim(), location.trim()); setId(''); setName(''); setLocation(''); onSaved(); }
    catch (failure) { setError(errorOf(failure)); setFields(fieldsOf(failure)); } finally { setBusy(false); }
  }}>
    <h2><Link2 size={18}/> Vincular dispositivo</h2>
    <p className="hint">Cadastre um ESP32 antes de ligá-lo. O ID aparece no monitor serial (ESP32_CPD_…). Um ESP32 novo também é vinculado sozinho no primeiro envio de dados.</p>
    {error && <Failure error={error}/>}
    <div className="form-grid">
      <label>ID do dispositivo<input required value={id} onChange={e => setId(e.target.value)} placeholder="ESP32_CPD_7C700ABF1388" aria-invalid={!!fields.id}/>{fields.id && <small className="field-error">{fields.id}</small>}</label>
      <label>Nome<input value={name} onChange={e => setName(e.target.value)} placeholder="Rack Principal"/></label>
      <label>Local<input value={location} onChange={e => setLocation(e.target.value)} placeholder="Sala CPD - Setor A"/></label>
    </div>
    <div className="form-footer"><p>Dispositivos desativados têm os dados descartados pelo ingestor.</p><button className="button primary" disabled={busy}><Save size={16}/>{busy ? 'Salvando…' : 'Vincular'}</button></div>
  </form>;
}

export function Admin() {
  const users = useResource('admin:users', signal => api.users(signal));
  const devices = useResource('admin:devices', signal => api.devices(undefined, signal));
  return <>
    <Heading title="Administração" subtitle="Usuários da plataforma e dispositivos vinculados."><button className="button" onClick={() => { users.reload(); devices.reload(); }}><RefreshCw size={16}/> Atualizar</button></Heading>
    <section className="admin-section">
      <div className="section-bar"><div><h2>Usuários <span className="count">{users.data?.items.length ?? 0}</span></h2><p>Mudar o perfil, desativar ou redefinir a senha encerra as sessões abertas do usuário.</p></div></div>
      {users.error && <Failure error={users.error}/>}
      {users.busy && !users.data ? <Loading/> : !users.data?.items.length ? <Empty title="Nenhum usuário"/> :
        <div className="table-wrap"><table><thead><tr><th>Usuário</th><th>Perfil</th><th>Situação</th><th>Criado em</th><th>Ações</th></tr></thead>
          <tbody>{users.data.items.map(user => <UserRow key={user.id} user={user} onSaved={users.reload}/>)}</tbody></table></div>}
      <NewUserForm onSaved={users.reload}/>
    </section>
    <section className="admin-section">
      <div className="section-bar"><div><h2>Dispositivos <span className="count">{devices.data?.items.length ?? 0}</span></h2><p>Nome e local aparecem no app e no dashboard.</p></div></div>
      {devices.error && <Failure error={devices.error}/>}
      {devices.busy && !devices.data ? <Loading/> : !devices.data?.items.length ? <Empty title="Nenhum dispositivo"/> :
        <div className="table-wrap"><table><thead><tr><th>ID</th><th>Nome</th><th>Local</th><th>Firmware</th><th>Situação</th><th>Ações</th></tr></thead>
          <tbody>{devices.data.items.map(device => <DeviceRow key={device.id + device.name + device.location + device.enabled} device={device} onSaved={devices.reload}/>)}</tbody></table></div>}
      <LinkDeviceForm onSaved={devices.reload}/>
    </section>
  </>;
}
