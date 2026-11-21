import { LANGUAGES, language, setLanguage, t } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/** Picks the app's language; switching reloads the page in it. */
export function LanguageButton() {
  return (
    <div
      role="radiogroup"
      aria-label={t("Language")}
      className="flex h-10 items-center rounded-full border border-border bg-card p-1 text-xs font-semibold"
    >
      {LANGUAGES.map(({ code, label, short }) => (
        <button
          key={code}
          type="button"
          role="radio"
          lang={code}
          aria-checked={language === code}
          aria-label={label}
          title={label}
          onClick={() => setLanguage(code)}
          className={cn(
            "h-full rounded-full px-2.5 transition-colors",
            language === code
              ? "bg-primary text-[#14140f]"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {short}
        </button>
      ))}
    </div>
  );
}
