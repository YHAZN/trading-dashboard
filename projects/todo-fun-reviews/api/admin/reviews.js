import { put, list } from '@vercel/blob';

const ADMIN_TOKEN = (process.env.ADMIN_TOKEN || 'change-me-in-production').trim();

function checkAuth(req) {
  const rawAuth = req.headers.authorization || req.headers['authorization'] || '';
  // Trim whitespace/newlines from pasted tokens
  const auth = rawAuth.trim();
  const token = auth.replace(/^Bearer\s+/i, '').trim();
  const match = token === ADMIN_TOKEN;

  // Debug endpoint
  if (req.url.includes('debug=1')) {
    return {
      debug: true,
      authHeader: rawAuth,
      tokenReceivedLength: token.length,
      expectedLength: ADMIN_TOKEN.length,
      match,
    };
  }

  return match;
}

async function getReviews() {
  try {
    const { blobs } = await list({ prefix: 'reviews/' });
    const reviews = await Promise.all(
      blobs.map(async (blob) => {
        const res = await fetch(blob.url);
        return await res.json();
      })
    );
    return reviews.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  } catch (err) {
    console.error('Failed to load reviews:', err);
    return [];
  }
}

async function updateReview(reviewId, updates) {
  // Find existing blob for this review (addRandomSuffix=false means the pathname matches)
  const { blobs } = await list({ prefix: `reviews/${reviewId}` });
  const existing = blobs.find(b => b.pathname === `reviews/${reviewId}.json`) || blobs[0];
  if (!existing) {
    throw new Error('Review not found');
  }

  const getRes = await fetch(existing.url);
  if (!getRes.ok) {
    throw new Error(`Failed to load review: ${getRes.status}`);
  }
  const review = await getRes.json();
  const updated = { ...review, ...updates, updated_at: new Date().toISOString() };

  await put(
    `reviews/${reviewId}.json`,
    JSON.stringify(updated),
    {
      access: 'public',
      contentType: 'application/json',
      addRandomSuffix: false,
      allowOverwrite: true,
    }
  );

  return updated;
}

export default async function handler(req, res) {
  const { method } = req;
  
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (method === 'OPTIONS') {
    return res.status(204).end();
  }

  const authResult = checkAuth(req);
  
  // Debug mode
  if (authResult.debug) {
    return res.status(200).json(authResult);
  }
  
  if (!authResult) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // GET /api/admin/reviews?status=pending
    if (method === 'GET') {
      const status = req.query.status || 'pending';
      const allReviews = await getReviews();
      const filtered = allReviews.filter(r => r.status === status);

      return res.status(200).json({ reviews: filtered });
    }

    // PATCH /api/admin/reviews/:id
    if (method === 'PATCH') {
      const reviewId = req.query.id || req.url.split('?')[0].split('/').pop();
      const { status: newStatus } = req.body;

      if (!['approved', 'rejected'].includes(newStatus)) {
        return res.status(400).json({ error: 'Invalid status' });
      }

      await updateReview(reviewId, { status: newStatus });

      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Admin API error:', error);
    return res.status(500).json({ error: error.message });
  }
}
