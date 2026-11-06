import type { Metadata } from 'next';
import { LegalPage, Section } from '../../../components/LegalPage';

export const metadata: Metadata = { title: 'Privacy - Volvo Charge' };

const PrivacyPage = () => (
	<LegalPage title='Privacy' updated='6 November 2026'>
		<Section title='Data read from Volvo'>
			<ul>
				<li>Vehicle relation (which car is linked to the account)</li>
				<li>Lock, doors and windows status</li>
				<li>Odometer, tyre status, warnings and diagnostics</li>
				<li>Trip statistics</li>
				<li>Battery charge level, electric range, charging connection and system status, estimated charging time</li>
				<li>Recharge status and charging history</li>
				<li>Vehicle location</li>
			</ul>
			<p>
				The app can also send two commands, lock and climate start or stop. Only the last four characters of
				the VIN are shown in the app.
			</p>
		</Section>
		<Section title='Other data'>
			<p>
				Charging sessions (times and energy) from the home charger, and public spot prices. Names, email
				addresses and addresses returned by the charger service are not stored. Signed-in household members are
				identified by their Google account email for access control.
			</p>
		</Section>
		<Section title='Where it is stored'>
			<p>
				In Google Firebase (Firestore) in the europe-west1 region. Volvo access tokens are kept in a server-side
				secret store and are never sent to the browser.
			</p>
		</Section>
		<Section title='Retention'>
			<p>
				Data is kept until you disconnect the Volvo account. Disconnecting deletes the stored tokens and stops
				all reading of vehicle data.
			</p>
		</Section>
		<Section title='Revoking access'>
			<p>
				Remove the app from your Volvo ID account, or use Disconnect in the app&apos;s settings. Volvo grants
				also expire on their own after at most three months.
			</p>
		</Section>
		<Section title='Deletion requests'>
			<p>
				To delete all stored data, email <a href='mailto:pedrotari7@gmail.com'>pedrotari7@gmail.com</a> and it
				will be deleted.
			</p>
		</Section>
	</LegalPage>
);

export default PrivacyPage;
