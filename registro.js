// Registro degli accessi: a ogni ingresso la pagina manda casella, indirizzo e versione
// al Foglio Google di chi pubblica la pagina (script in registro/Codice.gs).
// Nessuna mail passa di qui. Se l'indirizzo del registro manca o non risponde, la pagina funziona lo stesso.

import { CONFIG } from './config.js';

export function registraAccesso(casella, indirizzo, versione) {
  if (!CONFIG.registroUrl) return;
  try {
    // "no-cors" e testo semplice: Apps Script non risponde alle domande preliminari dei browser,
    // e alla pagina la risposta non serve.
    fetch(CONFIG.registroUrl, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ casella, indirizzo, versione }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    // il registro non deve mai fermare la pagina
  }
}
