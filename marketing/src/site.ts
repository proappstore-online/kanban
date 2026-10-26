/**
 * The marketing site's content and settings. Everything the pages say about the
 * app comes from this file: edit the copy, swap in your own images (put them in
 * public/assets/), or change the pages in src/pages/ directly. Keep claims true —
 * no invented pricing, testimonials, customer counts or reviews; leave an optional
 * section empty and it is left out.
 *
 * The Privacy Policy and Terms are a starting point, not legal advice. Review them
 * against what your app actually does before you rely on them.
 */
export const site = {
  appId: 'kanban',
  name: 'Kanban Pro',
  appUrl: 'https://kanban.proappstore.online/',
  /** Who runs the app; named as the operator on the legal pages and in the footer. */
  owner: 'The Kanban Pro team',
  /** Where people can reach you. Leave empty to point them at the app instead. */
  contactEmail: '',
  /** Optional help page or support link shown in the footer. */
  supportUrl: '',
  /** Jurisdiction whose law governs the Terms. Leave empty to omit the clause. */
  governingLaw: '',
  /** Shown on the legal pages; update it whenever you change them. */
  legalUpdated: '2026-10-26',
  /** Brand colours, mapped into the Tailwind theme (bg-accent, text-accent-deep, ...). */
  colors: {
    accent: '#d86f4d',
    /** Buttons and links: dark enough for white text, and for text on paper. */
    accentDeep: '#9f4427',
    accentSoft: '#ffd4bf',
    ink: '#111111',
    muted: '#666666',
    paper: '#ffffff',
    paperDeep: '#f7f7f7',
  },
  headline: 'Keep your team’s work moving.',
  summary: 'Organize team work in shared kanban boards with assigned cards, comments and real-time presence.',
  ctaLabel: 'Open Kanban Pro',
  /** Optional hero image, e.g. { src: '/assets/hero.png', alt: '...' }. Without one, a brand-colour panel is shown. */
  heroImage: null as Image | null,
  /** Optional product screenshots, shown in a gallery. */
  screenshots: [] as Image[],
  benefits: [
    { title: 'Organize shared boards', body: 'Keep your team’s work in workspaces and move cards between board columns.' },
    { title: 'Make responsibilities clear', body: 'Assign cards, discuss details in comments and keep requirements with the work.' },
    { title: 'Work together in real time', body: 'See who is present and follow updates on the same shared board.' },
  ],
  howItWorks: [
    { title: 'Open your workspace', body: 'Sign in and create a workspace or join one you have been invited to.' },
    { title: 'Create a board', body: 'Add cards, organize columns and invite the people you work with.' },
    { title: 'Keep work up to date', body: 'Assign cards, discuss details and move work as its status changes.' },
  ],
}

interface Image {
  src: string
  alt: string
}

/** How the legal pages tell people to reach you. */
export const contact = site.contactEmail
  ? `email ${site.contactEmail}`
  : `contact us through ${site.appUrl}`
