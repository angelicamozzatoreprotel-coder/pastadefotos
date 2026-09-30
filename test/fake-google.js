// Simula os serviços do Apps Script usados pela automação e carrega o Codigo.gs.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const CODE = readFileSync(new URL('../apps-script/Codigo.gs', import.meta.url), 'utf8');

class FakeFolder {
  constructor(drive, name, parent) {
    this.drive = drive;
    this.name = name;
    this.parent = parent;
    this.id = `f${drive.nextId++}`;
    this.trashed = false;
    drive.all.push(this);
  }
  getName() { return this.name; }
  getId() { return this.id; }
  isTrashed() { return this.trashed; }
  setTrashed(v) { this.trashed = v; return this; }
  children() { return this.drive.all.filter((f) => f.parent === this && !f.trashed); }
  getFolders() {
    const list = this.drive.all.filter((f) => f.parent === this);
    let i = 0;
    return { hasNext: () => i < list.length, next: () => list[i++] };
  }
  createFolder(name) {
    if (this.drive.failCreateAfter !== null && this.drive.creates >= this.drive.failCreateAfter) {
      throw new Error('Drive indisponível');
    }
    this.drive.creates += 1;
    return new FakeFolder(this.drive, name, this);
  }
}

export function createEnv({ clientes = [], props = {}, http = null } = {}) {
  const drive = { all: [], nextId: 1, creates: 0, failCreateAfter: null };
  const fotos = new FakeFolder(drive, 'Fotos', null);
  const store = { RAI_API_KEY: 'chave-teste', FOTOS_FOLDER_ID: fotos.id, ...props };
  const emails = [];
  const requests = [];
  const logs = [];
  const triggers = [];
  const env = { clientes, http };

  const scriptProps = {
    getProperty: (k) => (k in store ? store[k] : null),
    setProperty: (k, v) => { store[k] = String(v); },
    setProperties: (obj) => { for (const [k, v] of Object.entries(obj)) store[k] = String(v); },
    deleteProperty: (k) => { delete store[k]; },
  };

  const sandbox = {
    console: {
      log: (m) => logs.push(m),
      warn: (m) => logs.push(m),
      error: (m) => logs.push(m),
    },
    PropertiesService: { getScriptProperties: () => scriptProps },
    UrlFetchApp: {
      fetch: (url, opts) => {
        requests.push({ url, opts });
        if (env.http) return env.http(url, opts);
        return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ clientes: env.clientes }) };
      },
    },
    DriveApp: {
      getFolderById: (id) => {
        const f = drive.all.find((x) => x.id === id);
        if (!f) throw new Error('não encontrado');
        return f;
      },
    },
    MailApp: { sendEmail: (to, subject, body) => emails.push({ to, subject, body }) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
    Utilities: { sleep: () => {} },
    Session: { getEffectiveUser: () => ({ getEmail: () => 'dono@exemplo.com' }) },
    ScriptApp: {
      newTrigger: (fn) => {
        const t = { fn, minutes: null };
        const chain = {
          timeBased: () => chain,
          everyMinutes: (m) => { t.minutes = m; return chain; },
          create: () => { triggers.push({ getHandlerFunction: () => fn, minutes: t.minutes }); },
        };
        return chain;
      },
      getProjectTriggers: () => [...triggers],
      deleteTrigger: (t) => triggers.splice(triggers.indexOf(t), 1),
    },
  };
  vm.createContext(sandbox);
  vm.runInContext(CODE, sandbox);

  return { gs: sandbox, env, drive, fotos, store, emails, requests, logs, triggers };
}

export function cliente(id, nome) {
  return { clickup_task_id: id, nome, apelido: 'x', nome_contato: null };
}

export function atuais(n) {
  return Array.from({ length: n }, (_, i) => cliente(`id${i}`, `🏨 Hotel ${i}`));
}
