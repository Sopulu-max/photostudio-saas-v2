import type { MetadataRoute } from 'next';

/** The operator companion opens into the one compact reading that works in a pocket. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Weave Studio Companion',
    short_name: 'Weave',
    description: 'Today’s studio work, ready on a phone.',
    start_url: '/mobile',
    display: 'standalone',
    background_color: '#faf8f4',
    theme_color: '#1c1a17',
    icons: [{ src: '/weave-mark.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
  };
}
