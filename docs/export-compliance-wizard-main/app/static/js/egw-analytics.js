/**
 * ExportGateway GA4 helpers. Requires site-wide gtag (GA4) or GTM dataLayer.
 * Safe to load multiple times; first load wins.
 */
(function () {
  "use strict";

  if (window.egwTrack) return;

  const SESSION_PREFIX = "egw_evt_";

  function pushEvent(eventName, params) {
    const payload = params || {};
    if (typeof window.gtag === "function") {
      window.gtag("event", eventName, payload);
      return;
    }
    if (Array.isArray(window.dataLayer)) {
      window.dataLayer.push(Object.assign({ event: eventName }, payload));
    }
  }

  window.egwTrack = function (eventName, params) {
    pushEvent(eventName, params);
  };

  window.egwTrackSessionOnce = function (eventName, params) {
    let skip = false;
    try {
      const key = SESSION_PREFIX + eventName;
      if (sessionStorage.getItem(key)) skip = true;
      else sessionStorage.setItem(key, "1");
    } catch (e) {
      /* private browsing */
    }
    if (skip) return;
    pushEvent(eventName, params);
  };

  function isContactPage() {
    const path = (window.location.pathname || "").toLowerCase();
    return path.includes("contact");
  }

  function isToolEmbedForm(form) {
    return Boolean(
      form.id === "egIntrastatForm" ||
      form.closest("#egw-freight-tool, #egw-compliance-wizard, .egw-widget")
    );
  }

  function bindContactFormTracking() {
    if (!isContactPage()) return;

    document.addEventListener(
      "wpcf7mailsent",
      function () {
        window.egwTrack("contact_form_submitted", {
          form_plugin: "contact_form_7",
          page_path: window.location.pathname,
        });
      },
      false
    );

    document.addEventListener(
      "submit",
      function (event) {
        const form = event.target;
        if (!(form instanceof HTMLFormElement)) return;
        if (isToolEmbedForm(form)) return;
        if (form.closest(".wpcf7")) return;

        const now = Date.now();
        if (form.__egwContactTracked && now - form.__egwContactTracked < 5000) return;
        form.__egwContactTracked = now;

        window.egwTrack("contact_form_submitted", {
          form_plugin: "html_form",
          page_path: window.location.pathname,
        });
      },
      true
    );
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bindContactFormTracking);
  } else {
    bindContactFormTracking();
  }
})();
