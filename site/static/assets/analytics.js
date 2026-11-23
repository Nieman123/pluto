// Google Analytics loader. It lives in its own file, not inline in the page,
// so the site's Content-Security-Policy can block every inline script.
(function () {
  var script = document.currentScript;
  var id = script && script.dataset.measurementId;
  if (!id) return;
  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() { window.dataLayer.push(arguments); };
  window.gtag("js", new Date());
  window.gtag("config", id);
  window.addEventListener("load", function () {
    var analyticsScript = document.createElement("script");
    analyticsScript.async = true;
    analyticsScript.src = "https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(id);
    document.head.appendChild(analyticsScript);
  }, { once: true });
})();
