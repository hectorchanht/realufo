// Page-specific links for SiteFooter. A screen (Doc) sets them while mounted;
// the footer, which lives in AppShell outside the routed screen, shows them.
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export interface FooterLinks {
  title: string;
  links: { to: string; text: string }[];
}

const Ctx = createContext<{ value: FooterLinks | null; set: (v: FooterLinks | null) => void }>({
  value: null,
  set: () => {}, // no provider (isolated screen tests): setting is a no-op
});

export function FooterLinksProvider({ children }: { children: ReactNode }) {
  const [value, set] = useState<FooterLinks | null>(null);
  return <Ctx.Provider value={{ value, set }}>{children}</Ctx.Provider>;
}

export const useFooterLinks = () => useContext(Ctx).value;

// Keyed on the serialized links so a new object each render doesn't loop.
export function useSetFooterLinks(v: FooterLinks | null): void {
  const { set } = useContext(Ctx);
  const key = JSON.stringify(v);
  useEffect(() => {
    set(v);
    return () => set(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, set]);
}
