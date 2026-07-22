async function run() {
  try {
    const res = await fetch('http://localhost:3000/api/test-insert');
    const text = await res.text();
    console.log('HTTP Status:', res.status);
    console.log('Response:', text.substring(0, 500));
  } catch (err) {
    console.error('Fetch error:', err);
  }
}
run();
