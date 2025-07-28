// middleware/auth.js
const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// JWT Secret from Supabase Dashboard
const jwtSecret = process.env.SUPABASE_JWT_SECRET;

const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'Authorization required'
      });
    }

    const token = authHeader.split(' ')[1];

    // If JWT secret is configured, verify locally (faster)
    if (jwtSecret) {
      try {
        const decoded = jwt.verify(token, jwtSecret);
        
        // Get user details from Supabase using the user ID from token
        const { data: userData, error: userError } = await supabase
          .from('profiles')
          .select('id, full_name, email')
          .eq('id', decoded.sub)
          .single();

        if (userError || !userData) {
          return res.status(401).json({
            success: false,
            error: 'User not found'
          });
        }

        // Attach user to request
        req.user = {
          id: decoded.sub,
          email: decoded.email || userData.email,
          ...userData
        };

        next();
      } catch (jwtError) {
        console.error('JWT verification error:', jwtError.message);
        return res.status(401).json({
          success: false,
          error: 'Invalid token'
        });
      }
    } else {
      // Fallback: Use Supabase admin client to verify (slower but works)
      try {
        // Get user from token using service role
        const { data: userData, error } = await supabase.auth.admin.getUserById(token);

        if (error || !userData) {
          // Try alternative method
          const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
            headers: {
              'Authorization': `Bearer ${token}`,
              'apikey': process.env.SUPABASE_ANON_KEY
            }
          });

          if (!response.ok) {
            return res.status(401).json({
              success: false,
              error: 'Invalid authentication'
            });
          }

          const user = await response.json();
          req.user = user;
        } else {
          req.user = userData.user;
        }

        next();
      } catch (error) {
        console.error('Supabase auth error:', error);
        return res.status(401).json({
          success: false,
          error: 'Authentication failed'
        });
      }
    }
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
};

module.exports = { authenticateToken };
