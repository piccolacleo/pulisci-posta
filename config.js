// Identificativi delle due registrazioni. Non sono segreti: una pagina web non può tenerne,
// e Google e Microsoft accettano l'accesso solo da questo indirizzo registrato.
export const CONFIG = {
  // Google Cloud: client OAuth di tipo "Applicazione web", origine https://piccolacleo.github.io
  googleClientId: '485506179959-tsa651gca2qjkt4m84nkpthjct1crc4p.apps.googleusercontent.com',
  // Microsoft Entra: "ID applicazione (client)", solo account personali, ritorno "Single-page application"
  microsoftClientId: '8357baeb-5dc9-4dec-ad4a-b8e535354785',
  // Registro degli accessi: indirizzo dell'applicazione web Apps Script (registro/Codice.gs). Vuoto = nessun registro.
  registroUrl: '',
};
