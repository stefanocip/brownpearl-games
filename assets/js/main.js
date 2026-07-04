(() => {
  "use strict";

  document.getElementById("year").textContent = new Date().getFullYear();

  /* ---------- ambient spores ---------- */
  const sporeLayer = document.getElementById("spores");
  const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (sporeLayer && !prefersReduced) {
    const COUNT = 18;
    const colors = ["", "amber", "dusk"];
    for (let i = 0; i < COUNT; i++) {
      const s = document.createElement("span");
      s.className = "spore " + colors[i % colors.length];
      const left = Math.random() * 100;
      const duration = 14 + Math.random() * 12;
      const delay = -Math.random() * duration;
      const drift = (Math.random() * 60 - 30).toFixed(0) + "px";
      const size = 3 + Math.random() * 4;
      s.style.left = left + "%";
      s.style.width = s.style.height = size + "px";
      s.style.animationDuration = duration + "s";
      s.style.animationDelay = delay + "s";
      s.style.setProperty("--drift", drift);
      sporeLayer.appendChild(s);
    }
  }

  /* ---------- QR code: always points at this exact page ---------- */
  const qrBox = document.getElementById("qrBox");
  if (qrBox && window.QRCode) {
    new QRCode(qrBox, {
      text: window.location.origin + window.location.pathname,
      width: 88,
      height: 88,
      colorDark: "#120e0b",
      colorLight: "#f2e6d8",
      correctLevel: QRCode.CorrectLevel.M
    });
  }

  /* ---------- PWA install prompt (Android/desktop Chrome) ---------- */
  let deferredPrompt = null;
  const installBtn = document.getElementById("installBtn");

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    installBtn.classList.add("show");
  });

  installBtn?.addEventListener("click", async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    installBtn.classList.remove("show");
  });

  window.addEventListener("appinstalled", () => {
    installBtn?.classList.remove("show");
  });

  /* ---------- service worker ---------- */
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js").catch(() => {
        /* offline shell is a nice-to-have, fail silently */
      });
    });
  }
})();
