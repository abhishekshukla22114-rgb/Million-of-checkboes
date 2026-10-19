import { verifyAccessToken } from './index.js';

export function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authorization header required' });
  }

  const token = authHeader.split(' ')[1];
  const decoded = verifyAccessToken(token);

  if (!decoded) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  req.user = {
    userId: decoded.userId,
    email: decoded.email,
    username: decoded.username,
  };

  next();
}

export function optionalAuthMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    req.user = null;
    return next();
  }

  const token = authHeader.split(' ')[1];
  const decoded = verifyAccessToken(token);

  if (decoded) {
    req.user = {
      userId: decoded.userId,
      email: decoded.email,
      username: decoded.username,
    };
  } else {
    req.user = null;
  }

  next();
}