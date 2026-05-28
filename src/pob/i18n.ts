import i18next from "i18next";
import { initReactI18next } from "react-i18next";

import en from "./i18n/en.json";
import ko from "./i18n/ko.json";

void i18next.use(initReactI18next).init({
  resources: {
    ko: { translation: ko },
    en: { translation: en },
  },
  lng: "ko",
  fallbackLng: "en",
  interpolation: { escapeValue: false },
  returnNull: false,
});

export default i18next;
