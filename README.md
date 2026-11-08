# Pulisci posta

Pagina web per il telefono che entra in una casella Gmail o Hotmail, raggruppa le mail della posta in arrivo o della posta indesiderata per dominio del mittente e sposta nel cestino le mail dei mittenti scelti.

- **Nessun server**: la pagina gira tutta nel browser, e la posta va dal telefono a Google o a Microsoft senza passare da nessun altro.
- **Solo nel cestino** (Cestino di Gmail, Posta eliminata di Hotmail), mai la cancellazione definitiva: un errore si recupera.
- **Nella posta indesiderata segnala i domini sospetti** (finali insoliti, lettere doppie strane, indirizzi a caso, nomi di marchi con un dominio che non c'entra, errori di battitura o il proprio indirizzo nell'oggetto) senza selezionare niente da sola, e senza un pulsante "seleziona tutto": anche lì finiscono mittenti veri.
- **Nella posta in arrivo non segnala niente**, mostra solo l'elenco: lì si tolgono newsletter e conferme d'ordine di mittenti veri, e i criteri di sospetto darebbero quasi solo falsi allarmi.
- **"Annulla iscrizione" solo nella posta in arrivo**, e solo dove il mittente lo prevede (intestazione `List-Unsubscribe`): se accetta l'annullamento automatico (RFC 8058, una richiesta https) lo invia la pagina; altrimenti mostra il link o la mail da usare a mano. Mai nella posta indesiderata: su una mail di spam conferma a chi la manda che l'indirizzo è vivo. Il browser non lascia leggere la risposta del mittente, quindi la pagina sa che la richiesta è partita, non che sia stata accettata.
- **"Blocca"**: crea un filtro (Gmail) o una regola (Hotmail) che manda nel cestino le mail future dei mittenti scelti. Le mail già arrivate non si toccano: per quelle c'è "Sposta nel cestino". Il blocco si toglie dai filtri o dalle regole.

## File

| File | Cosa fa |
|---|---|
| `index.html`, `stile.css`, `app.js` | La pagina e il suo funzionamento |
| `analisi.js` | Raggruppamento per dominio e criteri di sospetto, senza accesso alla rete |
| `gmail.js` | Accesso con la libreria ufficiale di Google (modello a token) e API Gmail, permessi `gmail.modify` e `gmail.settings.basic` (filtri) |
| `outlook.js` | Accesso agli account Microsoft personali (codice con PKCE) e Microsoft Graph, permessi `Mail.ReadWrite` e `MailboxSettings.ReadWrite` (regole) |
| `rete.js` | Chiamate con ripetizione sui limiti di frequenza, ritmo regolato, accesso tenuto solo nella scheda aperta, annullamento automatico |
| `config.js` | I due identificativi delle registrazioni presso Google e Microsoft |

## Configurazione

`config.js` contiene i due identificativi, che non sono segreti:

- **Google Cloud**: API Gmail attivata, schermata di consenso "Esterna" con stato "In produzione", scope `gmail.modify` e `gmail.settings.basic` aggiunti alla schermata di consenso, client OAuth di tipo "Applicazione web" con origine JavaScript autorizzata `https://piccolacleo.github.io`.
- **Microsoft Entra**: registrazione "Solo account Microsoft personali", indirizzo di ritorno di tipo "Single-page application" `https://piccolacleo.github.io/pulisci-posta/`, permessi delegati `Mail.ReadWrite` e `MailboxSettings.ReadWrite` di Microsoft Graph.

Pubblicata con GitHub Pages dal ramo `master`, cartella principale.

## Stato (8 novembre 2026)

- **Annulla iscrizione e Blocca** sono nel ramo `blocca-e-annulla-iscrizione` (pull request #1), non ancora su `master`: finché non si unisce, la pagina online resta com'era.
- **Prima di unire**: il permesso `MailboxSettings.ReadWrite` è stato aggiunto in Microsoft Entra; lo scope `gmail.settings.basic` nella schermata di consenso Google va ancora confermato. Senza, l'accesso a Gmail fallisce.
- **Dopo l'unione**: rientrare in Gmail e in Hotmail per concedere i permessi nuovi.
- **Non provato su caselle vere**: la lettura dei link di annullamento è provata con esempi, il resto (filtro Gmail, regola Hotmail, richiesta automatica) no. Da provare prima su pochi mittenti.
- **Da sapere**: Hotmail ora legge 100 mail per volta (prima 200) perché le intestazioni rendono le risposte più pesanti. Le mail già arrivate non vengono toccate da "Blocca" né da "Annulla iscrizione".
