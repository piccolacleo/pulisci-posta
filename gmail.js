// Gmail: accesso con la libreria ufficiale di Google (modello a token, nessun server) e chiamate all'API.

import { chiama, inParallelo, salvaAccesso, leggiAccesso, cancellaAccesso } from './rete.js';
import { separaMittente } from './analisi.js';

const PERMESSO = 'https://www.googleapis.com/auth/gmail.modify';
const BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';
const CHIAVE = 'pulisci-posta.gmail';

// Gmail concede 6.000 unità al minuto per utente; leggere o cestinare una mail ne costa 20.
// Quattro chiamate al secondo stanno sotto il limite con margine.
const INSIEME = 4;
const INTERVALLO_MS = 250;

let clientToken = null;
let inAttesa = null;

function rispostaToken(risposta) {
  const attesa = inAttesa;
  inAttesa = null;
  if (!attesa) return;
  if (risposta.error) {
    attesa.ko(new Error(`Accesso a Gmail non riuscito (${risposta.error}).`));
    return;
  }
  if (!google.accounts.oauth2.hasGrantedAllScopes(risposta, PERMESSO)) {
    attesa.ko(new Error('Senza il permesso di gestire la posta la pagina non può lavorare: rientra e lascia la spunta sul permesso.'));
    return;
  }
  const dati = { token: risposta.access_token, scade: Date.now() + Number(risposta.expires_in) * 1000 };
  salvaAccesso(CHIAVE, dati);
  attesa.ok(dati);
}

function erroreFinestra(errore) {
  const attesa = inAttesa;
  inAttesa = null;
  if (!attesa) return;
  const motivo = errore?.type === 'popup_closed' ? 'Hai chiuso la finestra di accesso.'
    : errore?.type === 'popup_failed_to_open' ? 'Il telefono ha bloccato la finestra di accesso: consenti i popup per questa pagina.'
      : 'Accesso a Gmail non riuscito.';
  attesa.ko(new Error(motivo));
}

// La libreria di Google arriva con uno <script async>: si aspetta che sia pronta, al massimo 15 secondi.
export function preparaGmail(clientId) {
  return new Promise(risolvi => {
    const limite = Date.now() + 15_000;
    const prova = () => {
      if (window.google?.accounts?.oauth2) {
        clientToken = google.accounts.oauth2.initTokenClient({
          client_id: clientId,
          scope: PERMESSO,
          callback: rispostaToken,
          error_callback: erroreFinestra,
        });
        risolvi(true);
      } else if (Date.now() > limite) {
        risolvi(false);
      } else {
        setTimeout(prova, 200);
      }
    };
    prova();
  });
}

export const gmailPronto = () => clientToken !== null;

// Va chiamata direttamente dal tocco sul pulsante, altrimenti il telefono blocca la finestra di accesso.
export function entraGmail() {
  return new Promise((ok, ko) => {
    inAttesa = { ok, ko };
    clientToken.requestAccessToken();
  });
}

export const accessoGmail = () => leggiAccesso(CHIAVE);
export const esciGmail = () => cancellaAccesso(CHIAVE);

export async function indirizzoGmail(token) {
  return (await chiama(token, `${BASE}/profile`)).emailAddress;
}

// cartella: 'arrivo' | 'indesiderata'. Restituisce [{ id, nome, indirizzo, oggetto }], dalla più recente.
export async function leggiGmail(token, cartella, quante, avanzamento) {
  const etichetta = cartella === 'indesiderata' ? 'SPAM' : 'INBOX';
  const ids = [];
  let pagina = null;
  do {
    const parametri = new URLSearchParams({ labelIds: etichetta, maxResults: String(Math.min(500, quante - ids.length)) });
    if (etichetta === 'SPAM') parametri.set('includeSpamTrash', 'true');
    if (pagina) parametri.set('pageToken', pagina);
    const elenco = await chiama(token, `${BASE}/messages?${parametri}`);
    for (const m of elenco.messages || []) ids.push(m.id);
    pagina = elenco.nextPageToken;
  } while (pagina && ids.length < quante);

  const { risultati } = await inParallelo(ids, INSIEME, INTERVALLO_MS, async id => {
    const m = await chiama(token, `${BASE}/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&fields=id,payload/headers`);
    const intestazioni = m.payload?.headers || [];
    const valore = nome => intestazioni.find(h => h.name.toLowerCase() === nome)?.value || '';
    return { id, ...separaMittente(valore('from')), oggetto: valore('subject') };
  }, avanzamento);
  return risultati.filter(Boolean);
}

// Sposta nel cestino, mai cancellazione definitiva. Restituisce gli id che non si sono spostati.
export async function cestinaGmail(token, ids, avanzamento) {
  const { falliti } = await inParallelo(ids, INSIEME, INTERVALLO_MS,
    id => chiama(token, `${BASE}/messages/${id}/trash`, { method: 'POST' }), avanzamento);
  return falliti;
}
