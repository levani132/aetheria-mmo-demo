/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false, // strict mode double-mounts; messy with Three.js refs
  webpack: (config) => {
    config.module.rules.push({
      test: /\.(glsl|vs|fs|vert|frag)$/,
      use: ['raw-loader'],
    });
    return config;
  },
};

module.exports = nextConfig;
