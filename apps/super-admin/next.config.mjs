/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Built as a static site (`out/`) that talks to the API from the browser, so it
  // can be served from any static host. Record detail pages take their id from the
  // query string (`/organizations/view?id=…`) rather than a dynamic segment for this reason.
  output: 'export',
  // Emit `organizations/view/index.html` rather than `organizations/view.html`, which every
  // static host resolves for `/organizations/view` without rewrite rules.
  trailingSlash: true,
  images: { unoptimized: true },
  // The design system and shared packages ship as TypeScript source, so Next
  // compiles them as part of this app rather than expecting prebuilt output.
  transpilePackages: ['@acadia/ui', '@acadia/types', '@acadia/utils', '@acadia/validation'],
};

export default nextConfig;
