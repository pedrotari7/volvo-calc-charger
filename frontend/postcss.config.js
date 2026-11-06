const rsOptions = require('./stylex.config');

// Collects StyleX rules into the stylesheet; include globs are load-bearing.
module.exports = {
	plugins: {
		'@stylexswc/postcss-plugin': {
			include: ['app/**/*.{ts,tsx}', 'components/**/*.{ts,tsx}', 'lib/**/*.{ts,tsx}'],
			exclude: ['**/*.test.{ts,tsx}'],
			rsOptions,
			useCSSLayers: false,
		},
		autoprefixer: {},
	},
};
