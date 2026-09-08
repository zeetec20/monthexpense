// Linkedin/Github are marked @deprecated in lucide-react (brand icons,
// pointed at simpleicons.org instead) but still ship and render fine —
// not worth a whole new dependency for two icons.
import { Linkedin, Github, Globe, Newspaper, ExternalLink } from "lucide-react";
import { LegalPageShell } from "./LegalPageShell";

const SOCIAL_LINKS = [
  {
    href: "https://www.linkedin.com/in/firmanlestari",
    label: "LinkedIn",
    Icon: Linkedin,
  },
  { href: "https://github.com/zeetec20", label: "GitHub", Icon: Github },
  { href: "https://fiirman.my.id", label: "fiirman.my.id", Icon: Globe },
  {
    href: "https://medium.com/@firmanlestari",
    label: "Medium",
    Icon: Newspaper,
  },
];

export const AboutPage = () => {
  return (
    <LegalPageShell title="About">
      <p>
        MonthExpense is a personal expense tracker built to make logging day-to-day spending less
        annoying. You scan a receipt, say it out loud, or paste a chat/order confirmation as text,
        and it's logged. Expenses stay on your device and working offline and connecting to Google
        Sheets for the backup.
      </p>

      <h2>Who built this</h2>
      <p>
        Firman Lestari, a full-stack engineer from Banyuwangi, East Java, Indonesia, working mostly
        in TypeScript across React, Next.js, and Node.js, with a growing interest in Rust, Go, and
        practical AI tooling. Active open-source contributor.
      </p>
      <ul>
        {SOCIAL_LINKS.map(({ href, label, Icon }) => (
          <li key={href}>
            <a
              href={href}
              target="_blank"
              rel="noopener"
              className="inline-flex items-center gap-1.5 font-semibold text-ink hover:text-brand"
            >
              <Icon className="w-4 h-4" /> {label}
              <ExternalLink className="w-3 h-3 opacity-50" />
            </a>
          </li>
        ))}
      </ul>

      <h2>More</h2>
      <p>
        <a href="/privacy" className="underline">
          Privacy Policy
        </a>{" "}
        ·{" "}
        <a href="/terms" className="underline">
          Terms of Service
        </a>
      </p>
    </LegalPageShell>
  );
};
