// Chiamate alle API di Google e Microsoft: riprova sui limiti di frequenza, ritmo regolato, accesso salvato.

export class ErroreAccesso extends Error {}

export const dormi = ms => new Promise(risolvi => setTimeout(risolvi, ms));

async function limiteSuperato(risposta) {
  try {
    return /rateLimitExceeded|userRateLimitExceeded/.test(await risposta.text());
  } catch {
    return false;
  }
}

async function testoErrore(risposta) {
  try {
    const dati = await risposta.json();
    return dati.error?.message || dati.error_description || JSON.stringify(dati.error || dati);
  } catch {
    return risposta.statusText;
  }
}

export async function chiama(token, url, opzioni = {}) {
  for (let tentativo = 0; ; tentativo++) {
    const risposta = await fetch(url, {
      ...opzioni,
      headers: { ...(opzioni.headers || {}), Authorization: `Bearer ${token}` },
    });
    if (risposta.status === 401) throw new ErroreAccesso('L’accesso è scaduto: rientra.');
    const daRiprovare = risposta.status === 429 || risposta.status >= 500
      || (risposta.status === 403 && await limiteSuperato(risposta.clone()));
    if (daRiprovare && tentativo < 5) {
      const secondi = Number(risposta.headers.get('Retry-After'));
      await dormi(secondi > 0 ? secondi * 1000 : 1000 * 2 ** tentativo + Math.random() * 500);
      continue;
    }
    if (!risposta.ok) throw new Error(`Errore ${risposta.status}: ${await testoErrore(risposta)}`);
    const testo = await risposta.text();
    return testo ? JSON.parse(testo) : null;
  }
}

// Esegue fn su ogni elemento, al massimo `insieme` alla volta e con almeno `intervalloMs` fra un avvio e l'altro.
// Un errore di accesso ferma tutto; gli altri errori mettono l'elemento fra i falliti e si va avanti.
export async function inParallelo(elementi, insieme, intervalloMs, fn, avanzamento) {
  const risultati = new Array(elementi.length);
  const falliti = [];
  let prossimo = 0;
  let fatti = 0;
  let ultimoAvvio = 0;
  let erroreGrave = null;

  async function lavora() {
    while (prossimo < elementi.length && !erroreGrave) {
      const i = prossimo++;
      const quando = Math.max(Date.now(), ultimoAvvio + intervalloMs);
      ultimoAvvio = quando;
      if (quando > Date.now()) await dormi(quando - Date.now());
      try {
        risultati[i] = await fn(elementi[i]);
      } catch (errore) {
        if (errore instanceof ErroreAccesso) {
          erroreGrave = errore;
          return;
        }
        falliti.push(elementi[i]);
      }
      fatti++;
      avanzamento?.(fatti, elementi.length);
    }
  }

  await Promise.all(Array.from({ length: Math.min(insieme, elementi.length) }, lavora));
  if (erroreGrave) throw erroreGrave;
  return { risultati, falliti };
}

// L'accesso vive solo nella scheda aperta (sessionStorage): chiusa la pagina, si rientra.
export function salvaAccesso(chiave, dati) {
  try {
    sessionStorage.setItem(chiave, JSON.stringify(dati));
  } catch {
    // senza memoria della scheda si rientra a ogni ricarica, nient'altro
  }
}

export function leggiAccesso(chiave) {
  try {
    const dati = JSON.parse(sessionStorage.getItem(chiave) || 'null');
    return dati && dati.scade > Date.now() + 60_000 ? dati : null;
  } catch {
    return null;
  }
}

export function cancellaAccesso(chiave) {
  try {
    sessionStorage.removeItem(chiave);
  } catch {
    // niente da cancellare
  }
}
