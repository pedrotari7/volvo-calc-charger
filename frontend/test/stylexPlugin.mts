import { transformAsync } from '@babel/core';
import { createRequire } from 'node:module';
import type { Plugin } from 'vite';

const stylexOptions = createRequire(import.meta.url)('../stylex.config.js');

// Compiles StyleX the way the build does, as a Babel pass ahead of the React plugin.
export const stylex = (): Plugin => ({
	name: 'volvo:stylex',
	enforce: 'pre',
	async transform(code, id) {
		const [file] = id.split('?');
		if (!file || !/\.(tsx?|jsx?|mjs)$/.test(file) || file.includes('/node_modules/')) return null;
		if (!code.includes('@stylexjs/stylex')) return null;

		const result = await transformAsync(code, {
			filename: file,
			babelrc: false,
			configFile: false,
			sourceMaps: true,
			parserOpts: { plugins: file.endsWith('.tsx') ? ['typescript', 'jsx'] : ['typescript'] },
			plugins: [['@stylexjs/babel-plugin', stylexOptions]],
		});

		if (!result?.code) return null;

		return { code: result.code, map: result.map ? JSON.stringify(result.map) : null };
	},
});
