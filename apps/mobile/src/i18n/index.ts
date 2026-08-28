import i18next from "i18next";
import { initReactI18next } from "react-i18next";
import { esAR } from "./locales/es-AR";

// Phase 1 is single-locale by design (rioplatense voseo, Argentine vocabulary —
// see CLAUDE.md Principles). es-AR is the only resource bundle for now; adding
// a locale later means adding another file here and switching i18next.language.
i18next.use(initReactI18next).init({
  lng: "es-AR",
  fallbackLng: "es-AR",
  resources: {
    "es-AR": { translation: esAR },
  },
  interpolation: { escapeValue: false },
});

export default i18next;
