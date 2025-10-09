// Simple health-check serverless function to verify Vercel functions are reachable
module.exports = (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
};
