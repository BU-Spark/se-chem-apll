import path from 'node:path';
import type { NextConfig } from 'next';
const url = new URL(process.env.DATABASE_URL ?? 'postgresql://invalid/invalid');
if (!['localhost', '127.0.0.1'].includes(url.hostname) || url.pathname !== '/spark_submission_test') {
  throw new Error('Browser fixture requires the dedicated local spark_submission_test database.');
}
const config: NextConfig = {
  webpack(config, { webpack }) {
    config.plugins.push(
      new webpack.NormalModuleReplacementPlugin(
        /(?:lib\/auth\/(?:server|api)|app\/components\/QevVideo\/QevVideo)(?:\.tsx?)?$/,
        (resource: { request: string }) => {
          resource.request = path.resolve(
            process.cwd(),
            'test/browser',
            resource.request.includes('QevVideo') ? 'Video.tsx' : 'identity.ts'
          );
        }
      )
    );
    return config;
  },
};
export default config;
