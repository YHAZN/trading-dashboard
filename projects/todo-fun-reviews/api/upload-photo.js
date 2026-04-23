import { put } from '@vercel/blob';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Parse multipart using built-in formdata support via a raw body read + boundary split
    const contentType = req.headers['content-type'] || '';
    if (!contentType.includes('multipart/form-data')) {
      return res.status(400).json({ error: 'Expected multipart/form-data' });
    }

    const boundary = contentType.split('boundary=')[1];
    if (!boundary) {
      return res.status(400).json({ error: 'Missing boundary' });
    }

    // Read raw body
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const body = Buffer.concat(chunks);

    // Split on boundary
    const boundaryBuf = Buffer.from(`--${boundary}`);
    const parts = [];
    let start = 0;
    while (start < body.length) {
      const idx = body.indexOf(boundaryBuf, start);
      if (idx === -1) break;
      const end = body.indexOf(boundaryBuf, idx + boundaryBuf.length);
      const part = body.slice(idx + boundaryBuf.length, end === -1 ? body.length : end);
      if (part.length > 4) parts.push(part);
      start = idx + boundaryBuf.length;
    }

    let fileBuffer = null;
    let mimeType = 'application/octet-stream';
    let filename = `upload_${Date.now()}.jpg`;

    for (const part of parts) {
      // Find header/body split (double CRLF)
      const headerEnd = part.indexOf('\r\n\r\n');
      if (headerEnd === -1) continue;
      const headerStr = part.slice(0, headerEnd).toString();
      if (!headerStr.includes('filename')) continue;

      // Extract filename
      const fnMatch = headerStr.match(/filename="([^"]+)"/);
      if (fnMatch) filename = fnMatch[1].replace(/[^a-zA-Z0-9.\-_]/g, '_');

      // Extract content-type
      const ctMatch = headerStr.match(/Content-Type:\s*([^\r\n]+)/i);
      if (ctMatch) mimeType = ctMatch[1].trim();

      // Body is after double CRLF, strip trailing CRLF
      fileBuffer = part.slice(headerEnd + 4, part.length - 2);
    }

    if (!fileBuffer) {
      return res.status(400).json({ error: 'No file found in request' });
    }

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowedTypes.includes(mimeType)) {
      return res.status(400).json({ error: `Invalid file type: ${mimeType}` });
    }

    if (fileBuffer.length > 5 * 1024 * 1024) {
      return res.status(400).json({ error: 'File too large (max 5MB)' });
    }

    const pathname = `reviews/${Date.now()}-${filename}`;
    const blob = await put(pathname, fileBuffer, {
      access: 'public',
      contentType: mimeType,
      addRandomSuffix: true,
    });

    return res.status(200).json({ url: blob.url });
  } catch (error) {
    console.error('Upload error:', error);
    return res.status(500).json({ error: error.message });
  }
}
