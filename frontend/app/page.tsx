import { LandingNav, LandingFooter } from "@/components/landing/nav-footer";
import { Hero } from "@/components/landing/hero";
import { Roles } from "@/components/landing/roles";
import { ChatTeaser } from "@/components/landing/chat-teaser";

export default function HomePage() {
  return (
    <>
      <LandingNav />
      <main>
        <Hero />
        <Roles />
        <ChatTeaser />
      </main>
      <LandingFooter />
    </>
  );
}
