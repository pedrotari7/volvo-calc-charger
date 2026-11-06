const path = require('path');

// Shared by the SWC plugin, the PostCSS plugin and the test compiler; they must agree.
module.exports = {
	dev: process.env.NODE_ENV === 'development',
	runtimeInjection: false,
	enableFontSizePxToRem: false,
	treeshakeCompensation: true,
	aliases: {
		'@/*': [path.join(__dirname, '*')],
		'@shared/*': [path.join(__dirname, '../shared/*')],
	},
	unstable_moduleResolution: {
		type: 'commonJS',
		rootDir: path.join(__dirname, '..'),
	},
};
