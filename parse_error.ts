import { parse } from 'node-html-parser';

async function run() {
  try {
    const res = await fetch('http://localhost:3000/api/test-insert');
    const text = await res.text();
    
    // Parse the HTML to extract the error message Next.js provides
    const root = parse(text);
    const title = root.querySelector('title')?.text;
    console.log('Title:', title);
    
    // Next.js dev overlay usually injects JSON data for the error
    const nextData = root.querySelector('#__NEXT_DATA__')?.text;
    if (nextData) {
        console.log('Next Data:', nextData.substring(0, 200));
    }
    
    // In turbopack/new app router, errors are often in script tags or React error boundaries
    const scripts = root.querySelectorAll('script');
    for (const s of scripts) {
        if (s.text.includes('Error:')) {
            const match = s.text.match(/Error:.*?(?=")/);
            if (match) {
                console.log('Found error in script:', match[0]);
            }
        }
    }
    
  } catch (err) {
    console.error('Fetch error:', err);
  }
}
run();
