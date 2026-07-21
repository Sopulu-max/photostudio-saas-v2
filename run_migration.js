const { Client } = require('pg');
const fs = require('fs');

const env = fs.readFileSync('.env.local', 'utf-8');
const envMap = {};
env.split('\n').forEach(line => {
  const [key, ...val] = line.split('=');
  if (key && val.length) envMap[key.trim()] = val.join('=').trim().replace(/"/g, '');
});

const password = envMap['SUPABASE_PASSWORD'];
const projectId = 'qvscrdunkqkiswxvxbbm';

const regions = [
  'us-east-1',
  'us-west-1',
  'us-west-2',
  'eu-central-1',
  'eu-west-1',
  'eu-west-2',
  'eu-west-3',
  'ap-southeast-1',
  'ap-southeast-2',
  'ap-northeast-1',
  'ap-northeast-2',
  'ap-south-1',
  'sa-east-1',
  'ca-central-1'
];

async function tryConnect() {
  const migrationSql = fs.readFileSync('supabase/migrations/20260720000002_configuration_engine.sql', 'utf8');

  for (const region of regions) {
    const host = `aws-0-${region}.pooler.supabase.com`;
    const connectionString = `postgresql://postgres.${projectId}:${password}@${host}:6543/postgres`;
    
    console.log(`Trying ${region}...`);
    const client = new Client({ 
      connectionString, 
      connectionTimeoutMillis: 5000,
      ssl: { rejectUnauthorized: false }
    });
    
    try {
      await client.connect();
      console.log(`SUCCESS connected to ${region}!`);
      
      console.log('Executing migration...');
      await client.query(migrationSql);
      console.log('Migration executed successfully!');
      
      await client.end();
      return;
    } catch (e) {
      if (e.code === 'ENOTFOUND' || e.message.includes('timeout') || e.message.includes('password authentication failed')) {
        // Expected if region is wrong or password is wrong (but password is correct)
      } else {
        console.error(`Error in ${region}:`, e.message);
      }
    } finally {
      // client.end(); // It will just close
    }
  }
  console.log('Failed to connect to any region.');
}

tryConnect();
