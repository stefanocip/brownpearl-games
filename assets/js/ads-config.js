/**
 * Brown Pearl — configurazione banner ads per le pagine dei giochi.
 *
 * Cambia solo questo file quando decidi quale rete usare.
 * Lascia AD_PROVIDER su "none" finché non hai un account attivo:
 * il contenitore resta al suo posto (nessun salto di layout) ma non carica nulla.
 */
window.BP_ADS_CONFIG = {
  // "none" | "adsense" | "gamedistribution"
  provider: "none",

  adsense: {
    // Da AdSense → Account → Informazioni account. Formato: "ca-pub-XXXXXXXXXXXXXXXX"
    clientId: "ca-pub-XXXXXXXXXXXXXXXX",
    // Da AdSense → Annunci → Per unità annuncio, dopo aver creato un'unità display per questo slot
    slotId: "XXXXXXXXXX"
  },

  gamedistribution: {
    // Da developer.gamedistribution.com, dopo aver caricato/registrato il gioco
    gameId: "00000000000000000000000000000000"
  }
};
