const jwt = require('jsonwebtoken')

const authenticateToken = (req, res, next) =>
{
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Format: "Bearer <token>"

    //For LOCAL DEV
    req.userId = '6952bd331482f8927092ddcc'
    next()

    // if (!token) return res.sendStatus(401); // Unauthorized if no token

    // // 2. Verify the token
    // jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) =>
    // {
    //     if (err) return res.sendStatus(403); // Forbidden if token is invalid/expired

    //     // 3. Attach relevant data (e.g., id or username) to the request object
    //     // Downstream handlers can now access req.user
    //     req.user = decoded;
    //     next();
    // })
}

module.exports = authenticateToken