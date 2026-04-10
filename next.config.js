/** @type {import('next').NextConfig} */
const nextConfig = {
  // Required for optimized Docker/Dokploy deployment.
  // Bundles only the files actually used — reduces image size significantly.
  output: "standalone",
};

module.exports = nextConfig;
