/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The design system and shared packages ship as TypeScript source, so Next
  // compiles them as part of this app rather than expecting prebuilt output.
  transpilePackages: ['@acadia/ui', '@acadia/types', '@acadia/utils', '@acadia/validation'],
};

export default nextConfig;
