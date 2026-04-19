import { put, list } from '@vercel/blob';

async function getReviews(productId = null) {
  try {
    const { blobs } = await list({ prefix: 'reviews/' });
    const reviews = await Promise.all(
      blobs.map(async (blob) => {
        const res = await fetch(blob.url);
        return await res.json();
      })
    );

    if (productId) {
      return reviews.filter(r => r.product_id === productId && r.status === 'approved');
    }

    return reviews;
  } catch (err) {
    console.error('Failed to load reviews:', err);
    return [];
  }
}

async function saveReview(reviewId, data) {
  const result = await put(
    `reviews/${reviewId}.json`,
    JSON.stringify(data),
    {
      access: 'public',
      contentType: 'application/json',
      addRandomSuffix: false,
      allowOverwrite: true,
    }
  );
  return result;
}

export default async function handler(req, res) {
  const { method } = req;

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (method === 'OPTIONS') {
    return res.status(204).end();
  }

  try {
    // GET /api/reviews?product_id=123
    if (method === 'GET') {
      const productId = req.query.product_id;
      if (!productId) {
        return res.status(400).json({ error: 'product_id required' });
      }

      const reviews = await getReviews(productId);
      const sorted = reviews.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

      // Calculate stats
      const stats = {
        total: reviews.length,
        average: reviews.length > 0 ? (reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length).toFixed(1) : 0,
        distribution: {
          5: reviews.filter(r => r.rating === 5).length,
          4: reviews.filter(r => r.rating === 4).length,
          3: reviews.filter(r => r.rating === 3).length,
          2: reviews.filter(r => r.rating === 2).length,
          1: reviews.filter(r => r.rating === 1).length,
        },
      };

      return res.status(200).json({ reviews: sorted, stats });
    }

    // POST /api/reviews (submit new review)
    if (method === 'POST') {
      const {
        product_id,
        product_title,
        order_id,
        customer_email,
        customer_name,
        rating,
        title,
        content,
        photos = [],
      } = req.body;

      // Validation
      if (!product_id || !rating || rating < 1 || rating > 5) {
        return res.status(400).json({ error: 'Invalid input' });
      }

      // Generate review ID
      const reviewId = `review_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Create review object
      const review = {
        id: reviewId,
        product_id,
        product_title,
        order_id,
        customer_email,
        customer_name,
        rating,
        title,
        content,
        photos,
        verified_purchase: !!order_id,
        status: 'pending',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      // Save to blob storage
      await saveReview(reviewId, review);

      // Trigger AI reply (async, don't wait)
      const origin = `${req.headers['x-forwarded-proto'] || 'https'}://${req.headers.host}`;
      fetch(`${origin}/api/ai-reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          review_id: reviewId,
          product_title,
          rating,
          content,
          customer_name,
        }),
      }).catch(err => console.error('AI reply trigger failed:', err));

      return res.status(201).json({ success: true, review_id: reviewId });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('API error:', error);
    return res.status(500).json({ error: error.message });
  }
}
