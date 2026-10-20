// Raggruppa le mail per dominio del mittente e segnala i domini sospetti.
// Funzioni pure, senza accesso alla rete: si provano anche fuori dal browser.

const DOMINI_SECONDO_LIVELLO = new Set([
  'co.uk', 'org.uk', 'ac.uk', 'gov.uk', 'com.au', 'net.au', 'co.nz', 'co.jp', 'co.in', 'co.za',
  'com.br', 'com.mx', 'com.ar', 'com.tr', 'com.cn', 'com.hk', 'gov.it', 'edu.it',
]);

// Finali di dominio poco usati dai mittenti veri e molto dagli spammer.
const FINALI_INSOLITI = new Set([
  'space', 'site', 'top', 'xyz', 'online', 'shop', 'click', 'icu', 'buzz', 'rest', 'cfd', 'sbs',
  'store', 'fun', 'monster', 'quest', 'bond', 'cyou', 'pw', 'tk', 'ml', 'ga', 'cf', 'gq', 'lol', 'bar',
]);

// Doppie rare in italiano e in inglese (maiilvelocity, smaartaff), o tre lettere uguali di fila.
const DOPPIE_STRANE = /(aa|ii|uu|yy|ww|hh|jj|qq|xx)|([a-z])\2\2/;

const CONSONANTI_DI_FILA = /[bcdfghjklmnpqrstvwxz]{5,}/;

// Marchi usati spesso per le truffe: "parole" si cercano nel nome e nell'indirizzo del mittente,
// "domini" sono i pezzi che il dominio vero del marchio contiene.
const MARCHI = [
  { nome: 'Amazon', parole: ['amazon'], domini: ['amazon'] },
  { nome: 'PayPal', parole: ['paypal'], domini: ['paypal'] },
  { nome: 'Poste Italiane', parole: ['poste', 'bancoposta', 'postepay'], domini: ['poste'] },
  { nome: 'Intesa Sanpaolo', parole: ['intesa', 'sanpaolo'], domini: ['intesasanpaolo', 'intesa'] },
  { nome: 'UniCredit', parole: ['unicredit'], domini: ['unicredit'] },
  { nome: 'BNL', parole: ['bnl'], domini: ['bnl'] },
  { nome: 'Fineco', parole: ['fineco'], domini: ['fineco'] },
  { nome: 'Mediolanum', parole: ['mediolanum'], domini: ['mediolanum'] },
  { nome: 'BPER', parole: ['bper'], domini: ['bper'] },
  { nome: 'Nexi', parole: ['nexi'], domini: ['nexi'] },
  { nome: 'Satispay', parole: ['satispay'], domini: ['satispay'] },
  { nome: 'American Express', parole: ['american express', 'amex'], domini: ['americanexpress', 'amex', 'aexp'] },
  { nome: 'Netflix', parole: ['netflix'], domini: ['netflix'] },
  { nome: 'Spotify', parole: ['spotify'], domini: ['spotify'] },
  { nome: 'Disney', parole: ['disney'], domini: ['disney'] },
  { nome: 'DAZN', parole: ['dazn'], domini: ['dazn'] },
  { nome: 'Apple', parole: ['apple', 'icloud', 'itunes'], domini: ['apple', 'icloud'] },
  { nome: 'Microsoft', parole: ['microsoft', 'outlook', 'hotmail', 'onedrive', 'office 365'], domini: ['microsoft', 'outlook', 'live', 'office', 'hotmail', 'msn', 'onedrive', 'xbox', 'skype', 'bing'] },
  { nome: 'Google', parole: ['google', 'gmail', 'youtube'], domini: ['google', 'gmail', 'youtube'] },
  { nome: 'Facebook', parole: ['facebook', 'instagram', 'whatsapp'], domini: ['facebook', 'facebookmail', 'instagram', 'whatsapp', 'meta'] },
  { nome: 'eBay', parole: ['ebay'], domini: ['ebay'] },
  { nome: 'DHL', parole: ['dhl'], domini: ['dhl'] },
  { nome: 'BRT', parole: ['brt', 'bartolini'], domini: ['brt'] },
  { nome: 'GLS', parole: ['gls'], domini: ['gls'] },
  { nome: 'SDA', parole: ['sda'], domini: ['sda'] },
  { nome: 'UPS', parole: ['ups'], domini: ['ups'] },
  { nome: 'FedEx', parole: ['fedex'], domini: ['fedex'] },
  { nome: 'INPS', parole: ['inps'], domini: ['inps'] },
  { nome: 'Agenzia delle Entrate', parole: ['agenzia delle entrate', 'agenzia entrate', 'agenziaentrate'], domini: ['agenziaentrate'] },
  { nome: 'Enel', parole: ['enel'], domini: ['enel'] },
  { nome: 'TIM', parole: ['tim'], domini: ['tim', 'telecomitalia'] },
  { nome: 'Vodafone', parole: ['vodafone'], domini: ['vodafone'] },
  { nome: 'WindTre', parole: ['windtre', 'wind tre'], domini: ['windtre', 'wind'] },
  { nome: 'Iliad', parole: ['iliad'], domini: ['iliad'] },
  { nome: 'Fastweb', parole: ['fastweb'], domini: ['fastweb'] },
  { nome: 'Aruba', parole: ['aruba'], domini: ['aruba'] },
  { nome: 'Zalando', parole: ['zalando'], domini: ['zalando'] },
  { nome: 'Temu', parole: ['temu'], domini: ['temu'] },
  { nome: 'Shein', parole: ['shein'], domini: ['shein'] },
  { nome: 'Norton', parole: ['norton'], domini: ['norton'] },
  { nome: 'McAfee', parole: ['mcafee'], domini: ['mcafee'] },
];

// Errori di battitura tipici delle mail truffa.
const ERRORI_TIPICI = [
  'sercice', 'servlce', 'acount', 'accout', 'acconut', 'verifiy', 'verfy', 'securty', 'scurity',
  'pasword', 'passwrd', 'paypai', 'amaz0n', 'arnazon', 'micr0soft', 'rnicrosoft', 'netfllx',
  'supprt', 'custumer', 'costumer', 'informazzioni', 'subbito',
];

export function separaMittente(testo) {
  const valore = (testo || '').trim();
  const conNome = valore.match(/^(.*?)\s*<\s*([^<>\s]+@[^<>\s]+)\s*>\s*$/);
  if (conNome) {
    return { nome: conNome[1].replace(/^"+|"+$/g, '').trim(), indirizzo: conNome[2].toLowerCase() };
  }
  const solo = valore.match(/[^\s<>"]+@[^\s<>"]+/);
  return { nome: '', indirizzo: (solo ? solo[0] : valore).toLowerCase() };
}

export function dominioBase(indirizzo) {
  const host = (indirizzo.split('@')[1] || '').toLowerCase().replace(/\.+$/, '');
  if (!host) return '(senza dominio)';
  const parti = host.split('.');
  const ultimeDue = parti.slice(-2).join('.');
  if (parti.length >= 3 && DOMINI_SECONDO_LIVELLO.has(ultimeDue)) return parti.slice(-3).join('.');
  return ultimeDue;
}

function finale(dominio) {
  return dominio.split('.').pop();
}

function nomeDelDominio(dominio) {
  // "maiilvelocity.space" -> "maiilvelocity", "agenziaentrate.gov.it" -> "agenziaentrate"
  return dominio.split('.')[0];
}

export function sequenzaCasuale(parteLocale) {
  const s = parteLocale.toLowerCase().replace(/[._+\-]/g, '');
  if (s.length < 6) return false;
  let cambi = 0;
  for (let i = 1; i < s.length; i++) {
    if (/\d/.test(s[i]) !== /\d/.test(s[i - 1])) cambi++;
  }
  if (cambi >= 4) return true;
  if (CONSONANTI_DI_FILA.test(s)) return true;
  const vocali = (s.match(/[aeiou]/g) || []).length;
  return s.length >= 12 && vocali / s.length < 0.15;
}

function contieneParola(testo, parola) {
  if (parola.length > 4) return testo.includes(parola);
  return new RegExp(`(^|[^a-z0-9])${parola}($|[^a-z0-9])`).test(testo);
}

export function marchioFuoriPosto(nome, indirizzo, dominio) {
  const testo = `${nome} ${indirizzo.split('@')[0]}`.toLowerCase();
  const nomeDominio = dominio.replace(/\./g, '');
  for (const marchio of MARCHI) {
    if (!marchio.parole.some(p => contieneParola(testo, p))) continue;
    if (!marchio.domini.some(d => nomeDominio.includes(d))) return marchio.nome;
  }
  return null;
}

export function problemiOggetto(oggetto, mioIndirizzo) {
  const testo = (oggetto || '').toLowerCase();
  const problemi = [];
  if (mioIndirizzo) {
    const mio = mioIndirizzo.toLowerCase();
    const locale = mio.split('@')[0];
    if (testo.includes(mio) || (locale.length >= 5 && testo.includes(locale))) problemi.push('indirizzo');
  }
  if (ERRORI_TIPICI.some(e => testo.includes(e))) problemi.push('errori');
  return problemi;
}

// messaggi: [{ id, nome, indirizzo, oggetto }]
// Restituisce i gruppi per dominio, dal più numeroso, ognuno con i suoi mittenti.
// Con `segnala` (posta indesiderata) aggiunge i motivi di sospetto. Nella posta in arrivo no: lì si tolgono
// newsletter e conferme d'ordine di mittenti veri, e le segnalazioni sarebbero quasi tutte falsi allarmi.
export function raggruppa(messaggi, mioIndirizzo, segnala = true) {
  const gruppi = new Map();
  for (const m of messaggi) {
    const dominio = dominioBase(m.indirizzo);
    let gruppo = gruppi.get(dominio);
    if (!gruppo) {
      gruppo = { dominio, conteggio: 0, mittenti: new Map(), motivi: new Map() };
      gruppi.set(dominio, gruppo);
    }
    let mittente = gruppo.mittenti.get(m.indirizzo);
    if (!mittente) {
      mittente = { indirizzo: m.indirizzo, nomi: new Set(), ids: [], oggetti: [] };
      gruppo.mittenti.set(m.indirizzo, mittente);
    }
    gruppo.conteggio++;
    mittente.ids.push(m.id);
    if (m.nome) mittente.nomi.add(m.nome);
    if (m.oggetto && mittente.oggetti.length < 3) mittente.oggetti.push(m.oggetto);
    if (!segnala) continue;

    const marchio = marchioFuoriPosto(m.nome, m.indirizzo, dominio);
    if (marchio) gruppo.motivi.set('marchio', `usa il nome ${marchio}, ma il dominio non è di ${marchio}`);
    for (const p of problemiOggetto(m.oggetto, mioIndirizzo)) {
      if (p === 'indirizzo') gruppo.motivi.set('oggetto-indirizzo', 'il tuo indirizzo nell’oggetto');
      if (p === 'errori') gruppo.motivi.set('oggetto-errori', 'errori di battitura nell’oggetto');
    }
    if (sequenzaCasuale(m.indirizzo.split('@')[0])) {
      gruppo.motivi.set('casuale', 'indirizzo con lettere e numeri a caso');
    }
  }

  for (const gruppo of segnala ? gruppi.values() : []) {
    const fine = finale(gruppo.dominio);
    if (FINALI_INSOLITI.has(fine)) gruppo.motivi.set('finale', `dominio che finisce in “.${fine}”`);
    if (DOPPIE_STRANE.test(nomeDelDominio(gruppo.dominio))) gruppo.motivi.set('doppie', 'lettere doppie strane nel dominio');
  }

  return [...gruppi.values()]
    .map(g => ({
      dominio: g.dominio,
      conteggio: g.conteggio,
      motivi: [...g.motivi.values()],
      mittenti: [...g.mittenti.values()]
        .map(x => ({ indirizzo: x.indirizzo, nomi: [...x.nomi], ids: x.ids, oggetti: x.oggetti }))
        .sort((a, b) => b.ids.length - a.ids.length),
    }))
    .sort((a, b) => b.conteggio - a.conteggio);
}
