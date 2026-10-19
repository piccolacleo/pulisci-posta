// Hotmail (account Microsoft personali): accesso con codice e PKCE verso /consumers, nessun server, e chiamate a Microsoft Graph.

import { chiama, inParallelo, salvaAccesso, leggiAccesso, cancellaAccesso } from './rete.js';

const AUTORITA = 'https://login.microsoftonline.com/consumers/oauth2/v2.0';
const PERMESSI = 'openid https://graph.microsoft.com/User.Read https://graph.microsoft.com/Mail.ReadWrite';
const GRAPH = 'https://graph.microsoft.com/v1.0';
const CHIAVE = 'pulisci-posta.hotmail';
const CHIAVE_RITORNO = 'pulisci-posta.hotmail.ritorno';

// Outlook accetta poche richieste insieme sulla stessa casella.
const INSIEME = 3;
const INTERVALLO_MS = 100;

function casuale(byte) {
  const valori = crypto.getRandomValues(new Uint8Array(byte));
  return base64url(valori);
}

function base64url(buffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Lo stesso indirizzo registrato presso Microsoft come "Single-page application", con la barra finale.
export const indirizzoRitorno = () => new URL('./', location.origin + location.pathname).href;

export async function entraHotmail(clientId) {
  const verificatore = casuale(48);
  const stato = casuale(18);
  const sfida = base64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verificatore)));
  sessionStorage.setItem(CHIAVE_RITORNO, JSON.stringify({ verificatore, stato }));
  const parametri = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: indirizzoRitorno(),
    response_mode: 'query',
    scope: PERMESSI,
    state: stato,
    code_challenge: sfida,
    code_challenge_method: 'S256',
    prompt: 'select_account',
  });
  location.assign(`${AUTORITA}/authorize?${parametri}`);
}

// Al rientro da Microsoft l'indirizzo della pagina porta ?code=...: lo si scambia con l'accesso e si pulisce l'indirizzo.
// Restituisce null se la pagina non arriva da un accesso.
export async function completaRitornoHotmail(clientId) {
  const query = new URLSearchParams(location.search);
  if (!query.has('code') && !query.has('error')) return null;
  const attesa = JSON.parse(sessionStorage.getItem(CHIAVE_RITORNO) || 'null');
  sessionStorage.removeItem(CHIAVE_RITORNO);
  history.replaceState(null, '', location.pathname);

  if (query.has('error')) {
    throw new Error(`Accesso a Hotmail non riuscito: ${query.get('error_description') || query.get('error')}`);
  }
  if (!attesa || attesa.stato !== query.get('state')) {
    throw new Error('Accesso a Hotmail non valido: riprova da capo.');
  }
  const risposta = await fetch(`${AUTORITA}/token`, {
    method: 'POST',
    body: new URLSearchParams({
      client_id: clientId,
      scope: PERMESSI,
      code: query.get('code'),
      redirect_uri: indirizzoRitorno(),
      grant_type: 'authorization_code',
      code_verifier: attesa.verificatore,
    }),
  });
  const dati = await risposta.json();
  if (!risposta.ok) throw new Error(`Accesso a Hotmail non riuscito: ${dati.error_description || dati.error}`);
  const accesso = { token: dati.access_token, scade: Date.now() + Number(dati.expires_in) * 1000 };
  salvaAccesso(CHIAVE, accesso);
  return accesso;
}

export const accessoHotmail = () => leggiAccesso(CHIAVE);
export const esciHotmail = () => cancellaAccesso(CHIAVE);

export async function indirizzoHotmail(token) {
  const io = await chiama(token, `${GRAPH}/me?$select=mail,userPrincipalName`);
  return io.mail || io.userPrincipalName;
}

// cartella: 'arrivo' | 'indesiderata'. Restituisce [{ id, nome, indirizzo, oggetto }], dalla più recente.
export async function leggiHotmail(token, cartella, quante, avanzamento) {
  const nomeCartella = cartella === 'indesiderata' ? 'junkemail' : 'inbox';
  const pagina = Math.min(200, quante);
  let url = `${GRAPH}/me/mailFolders/${nomeCartella}/messages?$select=from,subject&$orderby=receivedDateTime%20desc&$top=${pagina}`;
  const messaggi = [];
  while (url && messaggi.length < quante) {
    const risposta = await chiama(token, url);
    for (const m of risposta.value || []) {
      messaggi.push({
        id: m.id,
        nome: m.from?.emailAddress?.name || '',
        indirizzo: (m.from?.emailAddress?.address || '').toLowerCase(),
        oggetto: m.subject || '',
      });
    }
    url = risposta['@odata.nextLink'];
    avanzamento?.(Math.min(messaggi.length, quante), quante);
  }
  return messaggi.slice(0, quante);
}

// Sposta in Posta eliminata, da cui si recupera; mai cancellazione definitiva. Restituisce gli id non spostati.
export async function cestinaHotmail(token, ids, avanzamento) {
  const { falliti } = await inParallelo(ids, INSIEME, INTERVALLO_MS, id => chiama(token,
    `${GRAPH}/me/messages/${encodeURIComponent(id)}/move`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ destinationId: 'deleteditems' }),
    }), avanzamento);
  return falliti;
}
