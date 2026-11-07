import { EventsTeaser } from './_components/events-teaser';
import { Hero } from './_components/hero';
import { ModuleGrid } from './_components/module-grid';
import { SiteFooter } from './_components/site-footer';
import { SiteHeader } from './_components/site-header';

export default function Home() {
  return (
    <>
      <noscript>
        <style>
          {
            '[data-reveal]{opacity:1!important;transform:none!important}[data-needs-js]{display:none!important}'
          }
        </style>
      </noscript>
      <SiteHeader />
      <main>
        <Hero />
        <ModuleGrid />
        <EventsTeaser />
      </main>
      <SiteFooter />
    </>
  );
}
