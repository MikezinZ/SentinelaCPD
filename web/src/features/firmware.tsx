import { CheckCircle2, CircleAlert, Cpu, Download, LoaderCircle, RefreshCw, Rocket, Upload } from 'lucide-react';
import { useState } from 'react';
import { Banner, Empty, Failure, Heading, Loading, dateTime } from '../components/ui';
import { otaFinished } from '../contracts';
import type { Firmware, OtaJob, OtaStatus } from '../contracts';
import { api } from '../services/api';
import { useResource } from '../services/useResource';

const statusText: Record<OtaStatus, [string, string]> = {
  queued: ['Na fila', 'slate'], sent: ['Comando enviado', 'blue'], downloading: ['Baixando', 'blue'],
  installed: ['Instalado, reiniciando', 'amber'], success: ['Concluído', 'green'], failed: ['Falhou', 'red'],
  rejected: ['Recusado pelo dispositivo', 'red'], rolled_back: ['Revertido (rollback)', 'red'], timeout: ['Sem resposta', 'red'],
};
const kb = (bytes: number) => new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(bytes / 1024) + ' KB';

function UploadForm({ onSaved }: { onSaved: () => void }) {
  const [file, setFile] = useState<File | null>(null), [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState<Error | null>(null);
  const [done, setDone] = useState<Firmware | null>(null);
  return <form className="form-panel" onSubmit={async event => {
    event.preventDefault();
    if (!file) return;
    setBusy(true); setError(null); setDone(null);
    try {
      setDone(await api.uploadFirmware(file, notes.trim()));
      setFile(null); setNotes('');
      (event.target as HTMLFormElement).reset();
      onSaved();
    } catch (failure) { setError(failure instanceof Error ? failure : new Error('Falha no envio.')); } finally { setBusy(false); }
  }}>
    <h2><Upload size={18}/> Disponibilizar nova versão</h2>
    <p className="hint">Na Arduino IDE: aumente <code>FIRMWARE_VERSION</code> e <code>FIRMWARE_SEQUENCE</code> em <code>ProductConfig.h</code> e use <em>Sketch › Export Compiled Binary</em>. Envie o arquivo <code>firmware.ino.bin</code> (não o <code>merged</code>). A plataforma confere o cabeçalho ESP32, a placa, a versão e calcula o SHA-256.</p>
    {error && <Failure error={error}/>}
    {done && <Banner tone="green" title={`Versão ${done.version} disponível (sequência ${done.sequence}).`}>SHA-256 {done.sha256.slice(0, 16)}…</Banner>}
    <div className="form-grid">
      <label>Arquivo .bin<input type="file" accept=".bin,application/octet-stream" required onChange={e => setFile(e.target.files?.[0] ?? null)}/></label>
      <label>Notas da versão (opcional)<input maxLength={255} value={notes} onChange={e => setNotes(e.target.value)} placeholder="O que mudou"/></label>
    </div>
    <div className="form-footer"><p>{file ? `${file.name} · ${kb(file.size)}` : 'Nenhum arquivo selecionado.'}</p><button className="button primary" disabled={busy || !file}><Upload size={16}/>{busy ? 'Enviando…' : 'Enviar firmware'}</button></div>
  </form>;
}

function InstallForm({ versions, onStarted }: { versions: Firmware[]; onStarted: () => void }) {
  const devices = useResource('ota:devices', signal => api.devices(undefined, signal));
  const [deviceId, setDeviceId] = useState(''), [firmwareId, setFirmwareId] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState<Error | null>(null);
  const active = devices.data?.items.filter(device => device.enabled) ?? [];
  const device = active.find(item => item.id === (deviceId || active[0]?.id));
  const chosen = firmwareId || versions[0]?.id || '';
  return <form className="form-panel" onSubmit={async event => {
    event.preventDefault();
    if (!device || !chosen) return;
    setBusy(true); setError(null);
    try { await api.startOta(device.id, chosen); onStarted(); } catch (failure) { setError(failure instanceof Error ? failure : new Error('Falha ao iniciar.')); } finally { setBusy(false); }
  }}>
    <h2><Rocket size={18}/> Instalar em um dispositivo</h2>
    <p className="hint">O comando segue por MQTT. O ESP32 baixa o arquivo da API com um token de uso único, confere tamanho e SHA-256, grava no slot livre e reinicia. Se a nova versão não confirmar o funcionamento em 90 s, ele volta sozinho para a anterior.</p>
    {devices.error && <Failure error={devices.error}/>}
    {error && <Failure error={error}/>}
    <div className="form-grid">
      <label>Dispositivo<select value={device?.id ?? ''} onChange={e => setDeviceId(e.target.value)}>{active.map(item => <option key={item.id} value={item.id}>{item.name} ({item.id})</option>)}</select></label>
      <label>Versão<select value={chosen} onChange={e => setFirmwareId(e.target.value)}>{versions.map(item => <option key={item.id} value={item.id}>{item.version} (sequência {item.sequence})</option>)}</select></label>
      <label>Versão atual<input readOnly value={device?.firmware_version ?? '—'}/></label>
    </div>
    <div className="form-footer"><p>{device && device.freshness !== 'fresh' ? 'Atenção: o dispositivo não enviou dados recentes; o comando pode expirar.' : 'Mantenha o dispositivo ligado na fonte durante a atualização.'}</p><button className="button primary" disabled={busy || !device || !chosen}><Rocket size={16}/>{busy ? 'Enviando…' : 'Instalar agora'}</button></div>
  </form>;
}

function JobStatus({ job }: { job: OtaJob }) {
  const [label, tone] = statusText[job.status];
  const Icon = job.status === 'success' ? CheckCircle2 : otaFinished(job.status) ? CircleAlert : LoaderCircle;
  return <span className={'badge ' + tone}><Icon size={13} className={otaFinished(job.status) ? '' : 'spin'}/>{label}</span>;
}

export function FirmwarePage() {
  const versions = useResource('firmware:list', signal => api.firmware(signal));
  const jobs = useResource('firmware:jobs', signal => api.otaJobs(undefined, signal), true);
  const list = versions.data?.items ?? [];
  return <>
    <Heading title="Atualização de firmware" subtitle="OTA remota: disponibilize uma versão e instale nos dispositivos pela plataforma."><button className="button" onClick={() => { versions.reload(); jobs.reload(); }}><RefreshCw size={16}/> Atualizar</button></Heading>
    <UploadForm onSaved={versions.reload}/>
    <section className="admin-section">
      <div className="section-bar"><div><h2><Cpu size={18}/> Versões disponíveis <span className="count">{list.length}</span></h2><p>A sequência precisa crescer a cada versão: o ESP32 recusa instalar uma versão igual ou anterior.</p></div></div>
      {versions.error && <Failure error={versions.error}/>}
      {versions.busy && !versions.data ? <Loading/> : !list.length ? <Empty title="Nenhuma versão enviada">Envie o primeiro arquivo .bin acima.</Empty> :
        <div className="table-wrap"><table><thead><tr><th>Versão</th><th>Sequência</th><th>Placa</th><th>Tamanho</th><th>SHA-256</th><th>Enviado</th><th>Notas</th></tr></thead>
          <tbody>{list.map(item => <tr key={item.id}><td><strong>{item.version}</strong></td><td>{item.sequence}</td><td>{item.target}</td><td>{kb(item.size)}</td><td><code title={item.sha256}>{item.sha256.slice(0, 12)}…</code></td><td>{dateTime(item.uploaded_at)}<br/><small>{item.uploaded_by}</small></td><td>{item.notes || '—'}</td></tr>)}</tbody></table></div>}
    </section>
    {list.length > 0 && <InstallForm versions={list} onStarted={jobs.reload}/>}
    <section className="admin-section">
      <div className="section-bar"><div><h2><Download size={18}/> Histórico de atualizações</h2><p>Atualiza sozinho a cada 5 segundos. Cada etapa é informada pelo próprio dispositivo.</p></div></div>
      {jobs.error && <Failure error={jobs.error} cached={!!jobs.data}/>}
      {jobs.busy && !jobs.data ? <Loading/> : !jobs.data?.items.length ? <Empty title="Nenhuma atualização iniciada"/> :
        <div className="table-wrap"><table><thead><tr><th>#</th><th>Dispositivo</th><th>Versão</th><th>Situação</th><th>Detalhe</th><th>Iniciado</th><th>Concluído</th></tr></thead>
          <tbody>{jobs.data.items.map(job => <tr key={job.id}><td>{job.id}</td><td>{job.device_id}</td><td>{job.from_version ?? '?'} → <strong>{job.version}</strong></td><td><JobStatus job={job}/></td><td>{job.detail}</td><td>{dateTime(job.created_at)}<br/><small>{job.created_by}</small></td><td>{dateTime(job.finished_at)}</td></tr>)}</tbody></table></div>}
    </section>
  </>;
}
