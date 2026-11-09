// Versione 2: un elenco a spunte dei mittenti, dal più insistente, con "Sposta nel cestino" e "Blocca e sposta".
// Lettura, segnalazioni e configurazione sono quelle della versione 1 (cartella sopra).

import { CONFIG } from '../config.js';
import { raggruppa } from '../analisi.js';
import { ErroreAccesso } from '../rete.js';
import * as gmail from './gmail.js';
import * as hotmail from './outlook.js';

const $ = selettore => document.querySelector(selettore);

function el(tag, proprieta = {}) {
  return Object.assign(document.createElement(tag), proprieta);
}

function minuti(secondi) {
  if (secondi < 60) return 'meno di un minuto';
  const m = Math.round(secondi / 60);
  return m === 1 ? 'circa un minuto' : `circa ${m} minuti`;
}

const plurale = (n, uno, tanti) => (n === 1 ? uno : `${n} ${tanti}`);

const CASELLE_PERSONALI = new Set([
  'gmail.com', 'googlemail.com', 'hotmail.com', 'hotmail.it', 'outlook.com', 'outlook.it', 'live.com', 'live.it',
  'msn.com', 'yahoo.com', 'yahoo.it', 'icloud.com', 'me.com', 'libero.it', 'virgilio.it', 'tiscali.it',
  'alice.it', 'tim.it', 'tin.it', 'fastwebnet.it', 'email.it', 'inwind.it', 'aol.com', 'proton.me', 'protonmail.com',
]);

const CASELLE = {
  gmail: {
    nome: 'Gmail',
    destinazione: 'nel Cestino',
    configurata: () => Boolean(CONFIG.googleClientId),
    accessoSalvato: gmail.accessoGmail,
    esci: gmail.esciGmail,
    indirizzo: gmail.indirizzoGmail,
    leggi: gmail.leggiGmail,
    cestina: gmail.cestinaGmail,
    blocca: gmail.bloccaGmail,
    comeSiToglie: 'Il blocco si toglie da Gmail, Impostazioni, “Filtri e indirizzi bloccati”.',
    // quattro mail al secondo, sia per leggere sia per spostare (limite di Google)
    tempo: quante => minuti(quante / 4),
  },
  hotmail: {
    nome: 'Hotmail',
    destinazione: 'in Posta eliminata',
    configurata: () => Boolean(CONFIG.microsoftClientId),
    accessoSalvato: hotmail.accessoHotmail,
    esci: hotmail.esciHotmail,
    indirizzo: hotmail.indirizzoHotmail,
    leggi: hotmail.leggiHotmail,
    cestina: hotmail.cestinaHotmail,
    blocca: hotmail.bloccaHotmail,
    comeSiToglie: 'Il blocco si toglie da Outlook, Impostazioni, Posta, “Regole” (si chiamano “Pulisci posta: blocco…”).'
      + '\n\nMicrosoft applica le regole alle mail che arrivano nella Posta in arrivo.',
    tempo: () => null,
  },
};

const nuovaCasella = () => ({
  accesso: null, indirizzo: '', cartella: 'arrivo', mittenti: null, letti: 0,
  selezionati: new Set(), bloccati: new Set(),
});

const stato = {
  attiva: 'gmail',
  occupato: false,
  gmail: nuovaCasella(),
  hotmail: nuovaCasella(),
};

const casella = () => stato[stato.attiva];
const definizione = () => CASELLE[stato.attiva];

function mostraMessaggio(testo, errore = false) {
  const p = $('#messaggio');
  p.textContent = testo;
  p.classList.toggle('errore', errore);
  p.hidden = !testo;
}

function gestisciErrore(errore, nomeCasella = stato.attiva) {
  if (errore instanceof ErroreAccesso) {
    CASELLE[nomeCasella].esci();
    stato[nomeCasella].accesso = null;
    mostraMessaggio(`L’accesso a ${CASELLE[nomeCasella].nome} è scaduto: rientra e ripeti l’ultima operazione.`, true);
  } else {
    mostraMessaggio(errore.message || String(errore), true);
  }
}

function occupato(si, testo = '') {
  stato.occupato = si;
  $('#avanzamento').hidden = !si;
  $('#testo-avanzamento').textContent = testo;
  $('#barra-avanzamento').removeAttribute('value');
  disegna();
}

function avanza(testo, frazione) {
  $('#testo-avanzamento').textContent = testo;
  $('#barra-avanzamento').value = Math.round(frazione * 100);
}

async function dopoAccesso(nomeCasella, accesso) {
  const s = stato[nomeCasella];
  s.accesso = accesso;
  try {
    s.indirizzo = await CASELLE[nomeCasella].indirizzo(accesso.token);
  } catch (errore) {
    gestisciErrore(errore, nomeCasella);
  }
}

function entra() {
  mostraMessaggio('');
  if (stato.attiva === 'gmail') {
    gmail.entraGmail()
      .then(accesso => dopoAccesso('gmail', accesso))
      .catch(errore => gestisciErrore(errore, 'gmail'))
      .finally(disegna);
  } else {
    hotmail.entraHotmail(CONFIG.microsoftClientId).catch(errore => gestisciErrore(errore, 'hotmail'));
  }
}

function esci() {
  definizione().esci();
  stato[stato.attiva] = nuovaCasella();
  mostraMessaggio('');
  disegna();
}

// Dai gruppi per dominio della versione 1 a un elenco piatto di mittenti, ognuno col suo dominio.
function elencoMittenti(gruppi) {
  const mittenti = [];
  for (const g of gruppi) {
    for (const m of g.mittenti) {
      mittenti.push({ ...m, dominio: g.dominio, motivi: g.motivi, compagni: g.mittenti.length });
    }
  }
  return mittenti.sort((a, b) => b.ids.length - a.ids.length || a.indirizzo.localeCompare(b.indirizzo));
}

async function analizza() {
  const s = casella();
  const def = definizione();
  const cartella = document.querySelector('input[name="cartella"]:checked').value;
  const quante = Number($('#quante').value);
  mostraMessaggio('');
  occupato(true, 'Leggo le mail…');
  try {
    const messaggi = await def.leggi(s.accesso.token, cartella, quante,
      (fatti, totale) => avanza(`Leggo le mail: ${fatti} di ${totale}`, fatti / totale));
    s.cartella = cartella;
    s.mittenti = elencoMittenti(raggruppa(messaggi, s.indirizzo, cartella === 'indesiderata'));
    s.letti = messaggi.length;
    s.selezionati.clear();
    $('#cerca').value = '';
  } catch (errore) {
    gestisciErrore(errore);
  } finally {
    occupato(false);
  }
}

function scelti() {
  const s = casella();
  return (s.mittenti || []).filter(m => s.selezionati.has(m.indirizzo));
}

// Toglie dall'elenco le mail spostate; i mittenti rimasti senza mail spariscono.
function togliSpostate(s, spostate) {
  for (const m of s.mittenti) m.ids = m.ids.filter(id => !spostate.has(id));
  s.mittenti = s.mittenti.filter(m => m.ids.length);
  s.letti -= spostate.size;
}

async function sposta(def, s, ids, testo) {
  const falliti = await def.cestina(s.accesso.token, ids,
    (fatti, totale) => avanza(`${testo}: ${fatti} di ${totale}`, fatti / totale));
  const spostate = new Set(ids.filter(id => !falliti.includes(id)));
  togliSpostate(s, spostate);
  return { spostate: spostate.size, falliti: falliti.length };
}

function frasePostamento(def, spostate, falliti) {
  return `${plurale(spostate, '1 mail spostata', 'mail spostate')} ${def.destinazione}.`
    + (falliti === 1 ? ' Una non si è spostata: riprova.' : falliti ? ` ${falliti} non si sono spostate: riprova.` : '');
}

async function cestina() {
  const s = casella();
  const def = definizione();
  const lista = scelti();
  const ids = lista.flatMap(m => m.ids);
  if (!ids.length) return;
  const tempo = def.tempo(ids.length);
  const domanda = `Sposto ${def.destinazione} ${ids.length} mail di ${plurale(lista.length, 'un mittente', 'mittenti')}?`
    + (tempo && ids.length > 200 ? `\nCi vorrà ${tempo}.` : '')
    + '\n\nSe sbagli, le recuperi da lì.';
  if (!confirm(domanda)) return;

  mostraMessaggio('');
  occupato(true, 'Sposto le mail…');
  try {
    const { spostate, falliti } = await sposta(def, s, ids, `Sposto ${def.destinazione}`);
    s.selezionati.clear();
    mostraMessaggio(`Fatto: ${frasePostamento(def, spostate, falliti)}`, falliti > 0);
  } catch (errore) {
    gestisciErrore(errore);
  } finally {
    occupato(false);
  }
}

function erroreDiPermesso(errore) {
  return /insufficient|scope|ErrorAccessDenied|Access is denied|403/i.test(errore?.message || '');
}

function mancaPermessoBlocchi(def) {
  def.esci();
  stato[stato.attiva].accesso = null;
  mostraMessaggio(`Per bloccare serve un permesso in più: rientra in ${def.nome} e lascia la spunta anche su quello dei filtri o delle impostazioni.`, true);
}

// Blocca i mittenti scelti (le mail future) e sposta nel cestino quelle già arrivate.
async function blocca() {
  const s = casella();
  const def = definizione();
  const lista = scelti();
  if (!lista.length) return;
  if (stato.attiva === 'gmail' && s.accesso.filtri === false) {
    mancaPermessoBlocchi(def);
    disegna();
    return;
  }
  const indirizzi = lista.map(m => m.indirizzo);
  const ids = lista.flatMap(m => m.ids);
  const domanda = `Blocco ${plurale(indirizzi.length, 'un mittente', 'mittenti')} e sposto ${def.destinazione} le ${ids.length} mail già arrivate?`
    + `\n\nLe loro mail future andranno ${def.destinazione}. ${def.comeSiToglie}`;
  if (!confirm(domanda)) return;

  mostraMessaggio('');
  occupato(true, 'Creo i blocchi…');
  let bloccati = 0;
  try {
    const falliti = await def.blocca(s.accesso.token, indirizzi,
      (fatti, totale) => avanza(`Creo i blocchi: ${fatti} di ${totale}`, fatti / totale));
    if (falliti.length === indirizzi.length) {
      // nessun blocco creato: quasi sempre manca il permesso, e spostare senza bloccare non è quello che si è chiesto
      throw new Error(`Nessun blocco creato. Se succede di nuovo, esci, rientra in ${def.nome} e concedi tutti i permessi.`);
    }
    for (const indirizzo of indirizzi) if (!falliti.includes(indirizzo)) s.bloccati.add(indirizzo);
    bloccati = indirizzi.length - falliti.length;

    const { spostate, falliti: nonSpostate } = await sposta(def, s, ids, `Sposto ${def.destinazione}`);
    s.selezionati.clear();
    mostraMessaggio(`Fatto: ${plurale(bloccati, '1 mittente bloccato', 'mittenti bloccati')}`
      + (falliti.length ? ` (${plurale(falliti.length, 'uno no', 'no')}: riprova)` : '')
      + `, ${frasePostamento(def, spostate, nonSpostate)}`, falliti.length > 0 || nonSpostate > 0);
  } catch (errore) {
    if (!(errore instanceof ErroreAccesso) && erroreDiPermesso(errore)) mancaPermessoBlocchi(def);
    else gestisciErrore(errore);
  } finally {
    occupato(false);
  }
}

function filtroAttivo() {
  return $('#cerca').value.trim().toLowerCase();
}

function mostrati() {
  const s = casella();
  if (!s.mittenti) return [];
  const testo = filtroAttivo();
  const soloSospetti = s.cartella === 'indesiderata' && $('#solo-sospetti').checked;
  return s.mittenti.filter(m => {
    if (soloSospetti && !m.motivi.length) return false;
    if (!testo) return true;
    return m.indirizzo.includes(testo) || m.dominio.includes(testo) || m.nomi.some(n => n.toLowerCase().includes(testo));
  });
}

function voceMittente(m, s) {
  const li = el('li');
  li.classList.toggle('scelto', s.selezionati.has(m.indirizzo));
  const etichetta = el('label');
  const scelta = el('input', { type: 'checkbox', checked: s.selezionati.has(m.indirizzo) });
  scelta.addEventListener('change', () => {
    if (scelta.checked) s.selezionati.add(m.indirizzo);
    else s.selezionati.delete(m.indirizzo);
    li.classList.toggle('scelto', scelta.checked);
    aggiornaBarra();
  });
  const testo = el('span', { className: 'testo' });
  testo.append(el('span', { className: 'indirizzo', textContent: m.indirizzo }));
  testo.append(el('span', { className: 'dettaglio', textContent: `${plurale(m.ids.length, '1 mail', 'mail')}${m.nomi.length ? ` · ${m.nomi.slice(0, 2).join(', ')}` : ''}` }));
  if (m.oggetti.length) testo.append(el('span', { className: 'dettaglio', textContent: `Oggetto: ${m.oggetti[0]}` }));
  etichetta.append(scelta, testo);
  li.append(etichetta);

  const segni = [];
  if (s.bloccati.has(m.indirizzo)) segni.push(el('span', { className: 'segno bloccato', textContent: 'già bloccato' }));
  for (const motivo of m.motivi) segni.push(el('span', { className: 'segno', textContent: motivo }));
  if (segni.length) {
    const riga = el('div', { className: 'segni' });
    riga.append(...segni);
    li.append(riga);
  }

  // Le campagne di spam cambiano indirizzo a ogni mail ma tengono il dominio: un tocco li spunta tutti.
  // Non sulle caselle personali (gmail.com, hotmail.it...): lì lo stesso dominio è di persone diverse.
  if (m.compagni > 1 && !CASELLE_PERSONALI.has(m.dominio)) {
    const altri = s.mittenti.filter(x => x.dominio === m.dominio);
    const tutti = altri.every(x => s.selezionati.has(x.indirizzo));
    const pulsante = el('button', {
      type: 'button',
      className: 'stesso-dominio',
      textContent: tutti ? `Togli la spunta ai ${altri.length} indirizzi di ${m.dominio}` : `Spunta tutti i ${altri.length} indirizzi di ${m.dominio}`,
    });
    pulsante.addEventListener('click', () => {
      for (const x of altri) {
        if (tutti) s.selezionati.delete(x.indirizzo);
        else s.selezionati.add(x.indirizzo);
      }
      disegnaElenco();
    });
    li.append(pulsante);
  }
  return li;
}

function disegnaElenco() {
  const s = casella();
  const lista = $('#elenco');
  lista.replaceChildren();
  $('#risultati').hidden = !s.mittenti || !s.accesso;
  if (!s.mittenti) return;
  const indesiderata = s.cartella === 'indesiderata';
  $('#nota-sospetti').hidden = !indesiderata;
  $('#filtro-sospetti').hidden = !indesiderata;

  const sospetti = s.mittenti.filter(m => m.motivi.length).length;
  const riepilogo = [`${s.letti} mail da ${plurale(s.mittenti.length, 'un mittente', 'mittenti')}.`];
  if (indesiderata) riepilogo.push(sospetti === 0 ? 'Nessuno sembra sospetto.' : `${plurale(sospetti, 'Uno sembra sospetto', 'sembrano sospetti')}.`);
  $('#riepilogo').textContent = s.mittenti.length ? riepilogo.join(' ') : 'In questa cartella non c’è niente.';

  const visibili = mostrati();
  for (const m of visibili) lista.append(voceMittente(m, s));
  if (s.mittenti.length && !visibili.length) lista.append(el('li', { className: 'nota', textContent: 'Nessun mittente corrisponde alla ricerca.' }));

  // "Spunta questi" solo dopo una ricerca o col filtro dei sospetti: mai su tutto l'elenco,
  // perché anche nella posta indesiderata finiscono mittenti veri.
  const ristretto = Boolean(filtroAttivo()) || (indesiderata && $('#solo-sospetti').checked);
  const pulsante = $('#spunta-mostrati');
  pulsante.hidden = !ristretto || !visibili.length;
  pulsante.textContent = visibili.length === 1 ? 'Spunta questo' : `Spunta questi ${visibili.length}`;
  aggiornaBarra();
}

function aggiornaBarra() {
  const s = casella();
  const lista = scelti();
  const ids = lista.reduce((somma, m) => somma + m.ids.length, 0);
  $('#barra').hidden = !lista.length || stato.occupato || !s.accesso;
  $('#togli-spunte').hidden = !lista.length;
  $('#conta-selezione').textContent = `${plurale(lista.length, '1 mittente', 'mittenti')}, ${plurale(ids, '1 mail', 'mail')}`;
}

function disegna() {
  const s = casella();
  const def = definizione();
  for (const b of document.querySelectorAll('.scheda')) {
    b.setAttribute('aria-pressed', String(b.dataset.casella === stato.attiva));
    b.disabled = stato.occupato;
  }

  const pulsanteEntra = $('#entra');
  pulsanteEntra.textContent = `Entra in ${def.nome}`;
  if (!def.configurata()) {
    $('#stato-accesso').textContent = `L’accesso a ${def.nome} non è ancora configurato.`;
    pulsanteEntra.hidden = false;
    pulsanteEntra.disabled = true;
    $('#esci').hidden = true;
  } else if (!s.accesso) {
    const inPreparazione = stato.attiva === 'gmail' && !gmail.gmailPronto();
    $('#stato-accesso').textContent = inPreparazione ? 'Preparo l’accesso a Google…' : `Non sei ancora entrato in ${def.nome}.`;
    pulsanteEntra.hidden = false;
    pulsanteEntra.disabled = stato.occupato || inPreparazione;
    $('#esci').hidden = true;
  } else {
    $('#stato-accesso').textContent = s.indirizzo ? `Sei entrato come ${s.indirizzo}.` : `Sei entrato in ${def.nome}.`;
    pulsanteEntra.hidden = true;
    $('#esci').hidden = false;
    $('#esci').disabled = stato.occupato;
  }

  $('#scelta').hidden = !s.accesso;
  $('#analizza').disabled = stato.occupato;
  const tempo = def.tempo(Number($('#quante').value));
  $('#nota-tempo').textContent = tempo ? `${def.nome} ne legge circa quattro al secondo: ci vorrà ${tempo}.` : '';
  $('#cestina').disabled = stato.occupato;
  $('#blocca').disabled = stato.occupato;

  disegnaElenco();
}

async function avvio() {
  for (const b of document.querySelectorAll('.scheda')) {
    b.addEventListener('click', () => {
      stato.attiva = b.dataset.casella;
      mostraMessaggio('');
      $('#cerca').value = '';
      disegna();
    });
  }
  $('#entra').addEventListener('click', entra);
  $('#esci').addEventListener('click', esci);
  $('#analizza').addEventListener('click', analizza);
  $('#cestina').addEventListener('click', cestina);
  $('#blocca').addEventListener('click', blocca);
  $('#quante').addEventListener('change', disegna);
  $('#solo-sospetti').addEventListener('change', disegnaElenco);
  $('#cerca').addEventListener('input', disegnaElenco);
  $('#spunta-mostrati').addEventListener('click', () => {
    const s = casella();
    for (const m of mostrati()) s.selezionati.add(m.indirizzo);
    disegnaElenco();
  });
  $('#togli-spunte').addEventListener('click', () => {
    casella().selezionati.clear();
    disegnaElenco();
  });

  if (CONFIG.microsoftClientId) {
    try {
      const accesso = await hotmail.completaRitornoHotmail(CONFIG.microsoftClientId);
      if (accesso) {
        stato.attiva = 'hotmail';
        await dopoAccesso('hotmail', accesso);
      }
    } catch (errore) {
      stato.attiva = 'hotmail';
      gestisciErrore(errore, 'hotmail');
    }
  }

  for (const nome of Object.keys(CASELLE)) {
    if (stato[nome].accesso || !CASELLE[nome].configurata()) continue;
    const salvato = CASELLE[nome].accessoSalvato();
    if (salvato) await dopoAccesso(nome, salvato);
  }

  if (CONFIG.googleClientId) {
    gmail.preparaGmail(CONFIG.googleClientId).then(pronto => {
      if (!pronto) mostraMessaggio('Non riesco a caricare l’accesso di Google: controlla la connessione e ricarica la pagina.', true);
      disegna();
    });
  }
  disegna();
}

avvio();
