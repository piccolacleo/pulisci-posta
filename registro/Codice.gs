// Apps Script legato al Foglio Google del registro (Estensioni, Apps Script).
// Pubblicato come applicazione web: "Esegui come: me", "Chi ha accesso: chiunque".
// Ogni accesso alla pagina diventa una riga: data e ora, casella, indirizzo, versione.

function doPost(e) {
  var dati = {};
  try {
    dati = JSON.parse(e.postData.contents);
  } catch (errore) {
    return ContentService.createTextOutput('no');
  }
  var foglio = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
  if (foglio.getLastRow() === 0) {
    foglio.appendRow(['Quando', 'Casella', 'Indirizzo', 'Versione']);
  }
  foglio.appendRow([
    new Date(),
    String(dati.casella || '').slice(0, 20),
    String(dati.indirizzo || '').slice(0, 200),
    String(dati.versione || '').slice(0, 10),
  ]);
  return ContentService.createTextOutput('ok');
}
