import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Banner } from './Banner';

const NOW = '2026-11-07T12:00:00.000Z';
const ago = (min: number) => new Date(Date.parse(NOW) - min * 60_000).toISOString();

describe('Banner', () => {
	it('shows delayed text at 61 minutes', () => {
		render(<Banner zaptecLastOkAt={ago(61)} volvoConnected now={NOW} />);
		expect(screen.getByText('Charger data delayed')).toBeInTheDocument();
	});

	it('renders nothing at 59 minutes', () => {
		const { container } = render(<Banner zaptecLastOkAt={ago(59)} volvoConnected now={NOW} />);
		expect(container).toBeEmptyDOMElement();
	});

	it('offers reconnect when Volvo is not connected', () => {
		render(<Banner zaptecLastOkAt={ago(1)} volvoConnected={false} now={NOW} />);
		expect(screen.getByText('Reconnect Volvo')).toBeInTheDocument();
		expect(screen.getByRole('link', { name: 'Reconnect in Settings' })).toHaveAttribute('href', '/settings');
		expect(screen.queryByText('Charger data delayed')).toBeNull();
	});
});
