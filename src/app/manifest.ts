import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Weave Studio',
    short_name: 'Weave',
    description: 'The studio operating system.',
    start_url: '/',
    display: 'standalone',
    background_color: '#faf8f4',
    theme_color: '#1c1a17',
    icons: [{ src: '/weave-mark.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
  };
}
