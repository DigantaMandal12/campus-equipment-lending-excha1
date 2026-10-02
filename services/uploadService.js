const fs = require('fs');
const path = require('path');

const UPLOADS_DIR = path.join(__dirname, '..', 'public', 'uploads');

// Safe initialization of uploads folder (avoids crashes on read-only serverless filesystems)
try {
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }
} catch (err) {
  // Read-only filesystem (e.g. Vercel serverless function container)
}

/**
 * Save a base64 encoded data URI to public/uploads
 * In persistent environments (local development), writes to disk and returns "/uploads/...".
 * In serverless environments (Vercel read-only filesystem), gracefully returns dataUri
 * to be stored directly in MongoDB so images persist across lambda cold starts without EROFS errors.
 * 
 * @param {string} dataUri - e.g. "data:image/png;base64,iVBORw0KGgo..."
 * @param {string} originalFilename - original filename hint
 * @returns {string} public path or data URI
 */
function saveBase64Image(dataUri, originalFilename = 'image.png') {
  if (!dataUri || typeof dataUri !== 'string') {
    throw new Error('Invalid image data provided.');
  }

  // Matches data:[<mediatype>][;base64],<data>
  const matches = dataUri.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
  if (!matches || matches.length !== 3) {
    // If not a data URI, check if it's already an http/https or /uploads URL
    if (dataUri.startsWith('http://') || dataUri.startsWith('https://') || dataUri.startsWith('/uploads/')) {
      return dataUri;
    }
    throw new Error('Invalid base64 image format.');
  }

  try {
    if (!fs.existsSync(UPLOADS_DIR)) {
      fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    }

    const mimeType = matches[1].toLowerCase();
    const base64Data = matches[2];

    // Extension mapping
    let ext = 'png';
    if (mimeType.includes('jpeg') || mimeType.includes('jpg')) ext = 'jpg';
    else if (mimeType.includes('webp')) ext = 'webp';
    else if (mimeType.includes('gif')) ext = 'gif';
    else if (mimeType.includes('svg')) ext = 'svg';

    const sanitizedBase = path.basename(originalFilename || 'equipment', path.extname(originalFilename || 'equipment'))
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .slice(0, 30);

    const filename = `equip-${Date.now()}-${Math.floor(Math.random() * 10000)}-${sanitizedBase}.${ext}`;
    const filePath = path.join(UPLOADS_DIR, filename);

    const buffer = Buffer.from(base64Data, 'base64');
    fs.writeFileSync(filePath, buffer);

    return `/uploads/${filename}`;
  } catch (fsErr) {
    // In serverless environments (Vercel read-only filesystem), fallback to storing Data URI directly
    console.warn('[UPLOAD SERVICE] Filesystem write bypassed (serverless environment). Preserving image as data URI.');
    return dataUri;
  }
}

module.exports = {
  saveBase64Image,
  UPLOADS_DIR
};