import { useEffect } from "react";
import { useTranslation } from "react-i18next";

function LanguageSwitcher() {
  const { i18n } = useTranslation();
  const isArabic = i18n.language === "ar";

  useEffect(() => {
    document.documentElement.lang = i18n.language;
    document.documentElement.dir = i18n.language === "ar" ? "rtl" : "ltr";
  }, [i18n.language]);

  const toggle = () => {
    i18n.changeLanguage(isArabic ? "en" : "ar");
  };

  return (
    <button
      onClick={toggle}
      className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 transition hover:bg-gray-100"
    >
      {isArabic ? "English" : "العربية"}
    </button>
  );
}

export default LanguageSwitcher;
