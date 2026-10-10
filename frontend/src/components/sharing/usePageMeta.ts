import { useEffect } from 'react';

export interface PageMeta {
  title?: string;
  description?: string;
  /** Canonical URL for og:url (defaults to window.location.href). */
  url?: string;
}

interface MetaSpec {
  attr: 'name' | 'property';
  key: string;
  content: string;
}

/**
 * Set document.title and description / Open Graph / Twitter meta tags while mounted.
 * Previous values are restored (or created elements removed) on unmount or change.
 *
 * Note: social crawlers don't run JS, so real link previews need SSR/prerendering.
 */
export function usePageMeta({ title, description, url }: PageMeta): void {
  useEffect(() => {
    if (!title && !description) return undefined;

    const previousTitle = document.title;
    const restorers: Array<() => void> = [];

    const specs: MetaSpec[] = [];
    if (title) {
      specs.push(
        { attr: 'property', key: 'og:title', content: title },
        { attr: 'name', key: 'twitter:title', content: title },
      );
    }
    if (description) {
      specs.push(
        { attr: 'name', key: 'description', content: description },
        { attr: 'property', key: 'og:description', content: description },
        { attr: 'name', key: 'twitter:description', content: description },
      );
    }
    specs.push(
      { attr: 'property', key: 'og:type', content: 'article' },
      { attr: 'property', key: 'og:url', content: url ?? window.location.href },
      { attr: 'name', key: 'twitter:card', content: 'summary' },
    );

    for (const spec of specs) {
      let el = document.head.querySelector<HTMLMetaElement>(`meta[${spec.attr}="${spec.key}"]`);
      if (el) {
        const previous = el.getAttribute('content');
        const existing = el;
        restorers.push(() => {
          if (previous === null) existing.removeAttribute('content');
          else existing.setAttribute('content', previous);
        });
      } else {
        el = document.createElement('meta');
        el.setAttribute(spec.attr, spec.key);
        document.head.appendChild(el);
        const created = el;
        restorers.push(() => created.remove());
      }
      el.setAttribute('content', spec.content);
    }

    if (title) document.title = title;

    return () => {
      document.title = previousTitle;
      restorers.forEach((restore) => restore());
    };
  }, [title, description, url]);
}

export default usePageMeta;
