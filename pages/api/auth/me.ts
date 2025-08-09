import type { NextApiRequest, NextApiResponse } from 'next';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const role = req.cookies['user_role'] || 'admin';
  const username = decodeURIComponent(req.cookies['user_name'] || '');
  const displayName = decodeURIComponent(req.cookies['user_display_name'] || username);
  if (!req.cookies['auth_token']) {
    return res.status(401).json({ message: 'Unauthorized' });
  }
  return res.status(200).json({ role, username, displayName });
} 