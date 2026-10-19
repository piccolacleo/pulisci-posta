import { CONFIG } from './config.js';
import { raggruppa } from './analisi.js';
import { ErroreAccesso } from './rete.js';
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
    tempo: () => null,
  },
};

const nuovaCasella = () => ({ accesso: null, indirizzo: '', gruppi: null, letti: 0, selezionati: new Set(), aperti: new Set() });

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
    s.gruppi = raggruppa(messaggi, s.indirizzo);
    s.letti = messaggi.length;
    s.selezionati.clear();
    s.aperti.clear();
  } catch (errore) {
    gestisciErrore(errore);
  } finally {
    occupato(false);
  }
}

function selezione() {
  const s = casella();
  const ids = [];
  let mittenti = 0;
  for (const g of s.gruppi || []) {
    for (const m of g.mittenti) {
      if (!s.selezionati.has(m.indirizzo)) continue;
      mittenti++;
      ids.push(...m.ids);
    }
  }
  return { ids, mittenti };
}

async function cestina() {
  const s = casella();
  const def = definizione();
  const { ids, mittenti } = selezione();
  if (!ids.length) return;
  const tempo = def.tempo(ids.length);
  const domanda = `Sposto ${def.destinazione} ${ids.length} mail di ${mittenti === 1 ? 'un mittente' : `${mittenti} mittenti`}?`
    + (tempo && ids.length > 200 ? `\nCi vorrà ${tempo}.` : '')
    + '\n\nSe sbagli, le recuperi da lì.';
  if (!confirm(domanda)) return;

  mostraMessaggio('');
  occupato(true, 'Sposto le mail…');
  let falliti = [];
  try {
    falliti = await def.cestina(s.accesso.token, ids,
      (fatti, totale) => avanza(`Sposto ${def.destinazione}: ${fatti} di ${totale}`, fatti / totale));
    const spostati = new Set(ids.filter(id => !falliti.includes(id)));
    for (const g of s.gruppi) {
      for (const m of g.mittenti) m.ids = m.ids.filter(id => !spostati.has(id));
      g.mittenti = g.mittenti.filter(m => m.ids.length);
      g.conteggio = g.mittenti.reduce((somma, m) => somma + m.ids.length, 0);
    }
    s.gruppi = s.gruppi.filter(g => g.conteggio).sort((a, b) => b.conteggio - a.conteggio);
    s.letti -= spostati.size;
    s.selezionati.clear();
    mostraMessaggio(`Fatto: ${spostati.size === 1 ? '1 mail spostata' : `${spostati.size} mail spostate`} ${def.destinazione}.`
      + (falliti.length === 1 ? ' Una non si è spostata: riprova.' : falliti.length ? ` ${falliti.length} non si sono spostate: riprova.` : ''),
    falliti.length > 0);
  } catch (errore) {
    gestisciErrore(errore);
  } finally {
    occupato(false);
  }
}

function elementoGruppo(g, s) {
  const li = el('li', { className: g.motivi.length ? 'gruppo sospetto' : 'gruppo' });

  const riga = el('div', { className: 'riga' });
  const etichetta = el('label');
  const scelta = el('input', { type: 'checkbox' });
  scelta.dataset.dominio = g.dominio;
  scelta.addEventListener('change', () => {
    const tutti = g.mittenti.every(m => s.selezionati.has(m.indirizzo));
    for (const m of g.mittenti) {
      if (tutti) s.selezionati.delete(m.indirizzo);
      else s.selezionati.add(m.indirizzo);
    }
    aggiornaSelezione();
  });
  const testo = el('span');
  testo.append(
    el('span', { className: 'dominio', textContent: g.dominio }),
    el('span', { className: 'dettaglio', textContent: `${g.conteggio} mail · ${g.mittenti.length === 1 ? '1 mittente' : `${g.mittenti.length} mittenti`}` }),
  );
  etichetta.append(scelta, testo);
  riga.append(etichetta);
  li.append(riga);

  if (g.motivi.length) {
    const riquadro = el('div', { className: 'motivi' });
    const elenco = el('ul');
    for (const motivo of g.motivi) elenco.append(el('li', { textContent: motivo }));
    riquadro.append(el('strong', { textContent: 'Sospetto' }), elenco);
    li.append(riquadro);
  }

  const dettagli = el('details');
  dettagli.open = s.aperti.has(g.dominio);
  dettagli.addEventListener('toggle', () => {
    if (dettagli.open) s.aperti.add(g.dominio);
    else s.aperti.delete(g.dominio);
  });
  dettagli.append(el('summary', { textContent: 'Vedi i mittenti' }));
  const lista = el('ul', { className: 'mittenti' });
  for (const m of g.mittenti) {
    const voce = el('li');
    const et = el('label');
    const sc = el('input', { type: 'checkbox' });
    sc.dataset.indirizzo = m.indirizzo;
    sc.addEventListener('change', () => {
      if (sc.checked) s.selezionati.add(m.indirizzo);
      else s.selezionati.delete(m.indirizzo);
      aggiornaSelezione();
    });
    const t = el('span');
    t.append(el('span', { className: 'indirizzo', textContent: `${m.indirizzo} · ${m.ids.length} mail` }));
    if (m.nomi.length) t.append(el('span', { className: 'dettaglio', textContent: `Nome: ${m.nomi.slice(0, 2).join(', ')}` }));
    if (m.oggetti.length) t.append(el('span', { className: 'dettaglio', textContent: `Oggetto: ${m.oggetti[0]}` }));
    et.append(sc, t);
    voce.append(et);
    lista.append(voce);
  }
  dettagli.append(lista);
  li.append(dettagli);
  return li;
}

function disegnaGruppi() {
  const s = casella();
  const lista = $('#gruppi');
  lista.replaceChildren();
  $('#risultati').hidden = !s.gruppi || !s.accesso;
  if (!s.gruppi) return;
  const sospetti = s.gruppi.filter(g => g.motivi.length).length;
  $('#riepilogo').textContent = s.gruppi.length
    ? `${s.letti} mail da ${s.gruppi.length === 1 ? 'un dominio' : `${s.gruppi.length} domini`}. `
      + (sospetti === 1 ? 'Un dominio sembra sospetto.' : `${sospetti} domini sembrano sospetti.`)
    : 'In questa cartella non c’è niente.';
  const soloSospetti = $('#solo-sospetti').checked;
  for (const g of s.gruppi) {
    if (soloSospetti && !g.motivi.length) continue;
    lista.append(elementoGruppo(g, s));
  }
  aggiornaSelezione();
}

function aggiornaSelezione() {
  const s = casella();
  for (const sc of document.querySelectorAll('#gruppi input[data-indirizzo]')) {
    sc.checked = s.selezionati.has(sc.dataset.indirizzo);
  }
  for (const sc of document.querySelectorAll('#gruppi input[data-dominio]')) {
    const g = s.gruppi.find(x => x.dominio === sc.dataset.dominio);
    const scelti = g.mittenti.filter(m => s.selezionati.has(m.indirizzo)).length;
    sc.checked = scelti === g.mittenti.length;
    sc.indeterminate = scelti > 0 && scelti < g.mittenti.length;
  }
  const { ids } = selezione();
  $('#barra').hidden = ids.length === 0 || stato.occupato;
  $('#conta-selezione').textContent = ids.length === 1 ? '1 mail selezionata' : `${ids.length} mail selezionate`;
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

  disegnaGruppi();
}

async function avvio() {
  for (const b of document.querySelectorAll('.scheda')) {
    b.addEventListener('click', () => {
      stato.attiva = b.dataset.casella;
      mostraMessaggio('');
      disegna();
    });
  }
  $('#entra').addEventListener('click', entra);
  $('#esci').addEventListener('click', esci);
  $('#analizza').addEventListener('click', analizza);
  $('#cestina').addEventListener('click', cestina);
  $('#quante').addEventListener('change', disegna);
  $('#solo-sospetti').addEventListener('change', disegnaGruppi);

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
