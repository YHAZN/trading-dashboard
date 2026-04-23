import { put } from '@vercel/blob';

export const config = {
  runtime: 'edge',
  maxDuration: 30,
};

export default async function handler(req) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: corsHeaders });
  }

  try {
    const formData = await req.formData();
    const file = formData.get('photo');

    if (!file || typeof file === 'string') {
      return new Response(JSON.stringify({ error: 'No file provided' }), { status: 400, headers: corsHeaders });
    }

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowedTypes.includes(file.type)) {
      return new Response(JSON.stringify({ error: 'Invalid file type' }), { status: 400, headers: corsHeaders });
    }

    if (file.size > 5 * 1024 * 1024) {
      return new Response(JSON.stringify({ error: 'File too large (max 5MB)' }), { status: 400, headers: corsHeaders });
    }

    const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_');
    const pathname = `reviews/${Date.now()}-${safeName}`;

    const blob = await put(pathname, file.stream(), {
      access: 'public',
      contentType: file.type,
      addRandomSuffix: false,
    });

    return new Response(JSON.stringify({ url: blob.url }), { status: 200, headers: corsHeaders });
  } catch (error) {
    console.error('Upload error:', error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
  }
}
