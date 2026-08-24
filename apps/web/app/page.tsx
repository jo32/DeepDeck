import { LandingPage } from "./_components/landing-page";
import { getRequestLocale } from "../lib/locale";

export default async function Home() {
  return <LandingPage locale={await getRequestLocale()} />;
}
