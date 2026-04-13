import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import en from "@/locales/en.json";
import fr from "@/locales/fr.json";

const STORAGE_KEY = "commandkeeper:lang";

function getInitialLanguage(): "en" | "fr" {
    if (typeof window === "undefined") return "fr";

    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === "en" || saved === "fr") return saved;

    const nav = (navigator.language || "").toLowerCase();
    if (nav.startsWith("en")) return "en";
    if (nav.startsWith("fr")) return "fr";
    return "fr";
}

i18n
    .use(initReactI18next)
    .init({
        resources: {
            en: { translation: en },
            fr: { translation: fr },
        },
        lng: getInitialLanguage(),
        fallbackLng: "fr",
        interpolation: {
            escapeValue: false,
            prefix: "[[",
            suffix: "]]",
        },
    })
    .catch(() => {
        // ignore init errors
    });

if (typeof window !== "undefined") {
    i18n.on("languageChanged", (lng) => {
        if (lng === "en" || lng === "fr") {
            window.localStorage.setItem(STORAGE_KEY, lng);
        }
    });
}

export default i18n;
