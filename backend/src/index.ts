import { setGlobalOptions } from 'firebase-functions/v2';
import { REGION } from './lib/firebase';

setGlobalOptions({ region: REGION });

export { volvoAuthStart, volvoCallback, volvoDisconnect } from './volvoOAuth';
export { fetchPrices, fetchPricesHourly } from './fetchPrices';
export { pollZaptec } from './pollZaptec';
export { pollCar } from './pollCar';
