import type { Metadata } from 'next';
import { LegalPage, Section } from '../../../components/LegalPage';

export const metadata: Metadata = { title: 'Terms - Volvo Charge' };

const TermsPage = () => (
	<LegalPage title='Terms of use' updated='6 November 2026'>
		<Section title='What this is'>
			<p>
				Volvo Charge is a private, non-commercial household app. It works out what it costs to charge one Volvo
				at home and helps plan when to charge. It is not offered to the public and is used only by the people
				the owner has added to its allowlist.
			</p>
		</Section>
		<Section title='What data is read'>
			<p>
				With your consent through Volvo ID, the app reads vehicle status from Volvo: lock, doors and windows,
				battery and range, charging state, odometer, tyres, warnings, trip statistics and position. It also
				reads charging sessions from the home charger and public spot electricity prices.
			</p>
		</Section>
		<Section title='What the app can do to the car'>
			<p>
				The only commands the app sends are lock and climate (start or stop cabin climatisation). The app
				never unlocks the car and does not request the permission needed to do so.
			</p>
		</Section>
		<Section title='Where data is stored'>
			<p>Data is stored in Google Firebase in the europe-west1 region (Belgium). See the privacy page for details.</p>
		</Section>
		<Section title='Revoking access'>
			<p>
				You can revoke the app&apos;s access at any time from your Volvo ID account, or by disconnecting in the
				app&apos;s settings. Access then stops immediately.
			</p>
		</Section>
		<Section title='Costs are estimates'>
			<p>
				Costs, savings and peak-fee figures are estimates based on spot prices and the tariff values entered by
				the owner. They are estimates, not invoices, and may differ from what your electricity supplier bills.
			</p>
		</Section>
		<Section title='Contact'>
			<p>
				Questions or requests: <a href='mailto:pedrotari7@gmail.com'>pedrotari7@gmail.com</a>
			</p>
		</Section>
	</LegalPage>
);

export default TermsPage;
