import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function run() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL + '/rest/v1/services?select=*&limit=1';
  const res = await fetch(url, {
    headers: {
      'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY!}`
    }
  });
  const data = await res.json();
  console.log('Services query result:', JSON.stringify(data, null, 2));

  // Let's also check the actual relations using the OpenAPI spec of PostgREST
  const swaggerRes = await fetch(process.env.NEXT_PUBLIC_SUPABASE_URL + '/rest/v1/', {
    headers: {
      'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY!}`
    }
  });
  const swagger = await swaggerRes.json();
  
  if (swagger.definitions && swagger.definitions.services) {
    console.log('Services OpenAPI definition:', JSON.stringify(swagger.definitions.services.properties, null, 2));
  } else {
    console.log('No services definition found in OpenAPI');
  }
}

run();
