# Pulisci posta

Pagina web per il telefono che entra in una casella Gmail o Hotmail, raggruppa le mail della posta in arrivo o della posta indesiderata per dominio del mittente e sposta nel cestino le mail dei mittenti scelti.

- **Nessun server**: la pagina gira tutta nel browser, e la posta va dal telefono a Google o a Microsoft senza passare da nessun altro.
- **Solo nel cestino** (Cestino di Gmail, Posta eliminata di Hotmail), mai la cancellazione definitiva: un errore si recupera.
- **Nella posta indesiderata segnala i domini sospetti** (finali insoliti, lettere doppie strane, indirizzi a caso, nomi di marchi con un dominio che non c'entra, errori di battitura o il proprio indirizzo nell'oggetto) senza selezionare niente da sola, e senza un pulsante "seleziona tutto": anche lì finiscono mittenti veri.
- **Nella posta in arrivo non segnala niente**, mostra solo l'elenco: lì si tolgono newsletter e conferme d'ordine di mittenti veri, e i criteri di sospetto darebbero quasi solo falsi allarmi.
- **Non offre "annulla iscrizione"**: su una mail di spam conferma a chi la manda che l'indirizzo è vivo.

## File

| File | Cosa fa |
|---|---|
| `index.html`, `stile.css`, `app.js` | La pagina e il suo funzionamento |
| `analisi.js` | Raggruppamento per dominio e criteri di sospetto, senza accesso alla rete |
| `gmail.js` | Accesso con la libreria ufficiale di Google (modello a token) e API Gmail, permesso `gmail.modify` |
| `outlook.js` | Accesso agli account Microsoft personali (codice con PKCE) e Microsoft Graph, permesso `Mail.ReadWrite` |
| `rete.js` | Chiamate con ripetizione sui limiti di frequenza, ritmo regolato, accesso tenuto solo nella scheda aperta |
| `config.js` | I due identificativi delle registrazioni presso Google e Microsoft |

## Configurazione

`config.js` contiene i due identificativi, che non sono segreti:

- **Google Cloud**: API Gmail attivata, schermata di consenso "Esterna" con stato "In produzione", client OAuth di tipo "Applicazione web" con origine JavaScript autorizzata `https://piccolacleo.github.io`.
- **Microsoft Entra**: registrazione "Solo account Microsoft personali", indirizzo di ritorno di tipo "Single-page application" `https://piccolacleo.github.io/pulisci-posta/`, permesso delegato `Mail.ReadWrite` di Microsoft Graph.

Pubblicata con GitHub Pages dal ramo `master`, cartella principale.
