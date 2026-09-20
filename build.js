const { execSync } = require('child_process');
const path = require('path');

const frontendModules = path.resolve(__dirname, '../../frontend/node_modules');
process.env.NODE_PATH = frontendModules;

execSync('npx esbuild js/app.js --bundle --outfile=bundle.js', {
  stdio: 'inherit',
  env: process.env,
  cwd: __dirname,
});
