/**
 * Brown Pearl — loader banner ads per pagine gioco.
 * Legge window.BP_ADS_CONFIG (assets/js/ads-config.js) e attiva la rete scelta.
 * Il contenitore #bp-ad-banner deve già esistere nella pagina.
 */
(() => {
  "use strict";

  const cfg = window.BP_ADS_CONFIG || { provider: "none" };
  const container = document.getElementById("bp-ad-banner");
  if (!container) return;

  if (cfg.provider === "none") {
    return; // il contenitore resta visibile con il testo segnaposto (vedi game.css)
  }

  if (cfg.provider === "adsense") {
    initAdSense(cfg.adsense);
  } else if (cfg.provider === "gamedistribution") {
    initGameDistribution(cfg.gamedistribution);
  }

  function initAdSense({ clientId, slotId }) {
    // Script principale AdSense, una sola volta per pagina
    const loader = document.createElement("script");
    loader.async = true;
    loader.src = "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=" + clientId;
    loader.crossOrigin = "anonymous";
    document.head.appendChild(loader);

    const ins = document.createElement("ins");
    ins.className = "adsbygoogle";
    ins.style.display = "block";
    ins.setAttribute("data-ad-client", clientId);
    ins.setAttribute("data-ad-slot", slotId);
    ins.setAttribute("data-ad-format", "auto");
    ins.setAttribute("data-full-width-responsive", "true");
    container.appendChild(ins);

    loader.onload = () => {
      try { (window.adsbygoogle = window.adsbygoogle || []).push({}); }
      catch (e) { /* adblock o rete non ancora approvata: falliamo in silenzio */ }
    };
  }

  function initGameDistribution({ gameId }) {
    container.id = container.id || "bp-ad-banner";

    window.GD_OPTIONS = {
      gameId: gameId,
      onEvent: (event) => {
        // event.name può essere usato per mettere in pausa/riprendere il gioco
        // durante interstitial/rewarded, se in futuro li aggiungi qui.
      }
    };

    (function (d, s, id) {
      if (d.getElementById(id)) return;
      const js = d.createElement(s);
      js.id = id;
      js.src = "https://html5.api.gamedistribution.com/main.min.js";
      d.head.appendChild(js);
    })(document, "script", "gamedistribution-jssdk");

    // Il display ad viene richiesto quando l'SDK è pronto
    const tryShowDisplayAd = () => {
      if (window.gdsdk && window.gdsdk.showAd) {
        window.gdsdk
          .showAd(window.gdsdk.AdType.Display, { containerId: container.id })
          .catch(() => { /* nessun riempimento disponibile in questo momento */ });
      } else {
        setTimeout(tryShowDisplayAd, 300);
      }
    };
    tryShowDisplayAd();
  }
})();
