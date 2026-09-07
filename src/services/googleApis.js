// Keep the installed Google SDK and its authentication implementations; load only
// the APIs this application uses instead of the entire generated API catalogue.
import { auth, calendar } from 'googleapis/build/src/apis/calendar/index.js';
import { drive } from 'googleapis/build/src/apis/drive/index.js';
import { oauth2 } from 'googleapis/build/src/apis/oauth2/index.js';
import { walletobjects } from 'googleapis/build/src/apis/walletobjects/index.js';

// SDK factories use their receiver's _options as global request defaults.
// Production uses the default empty options and configures each client explicitly.
export const google = { _options: {}, auth, calendar, drive, oauth2, walletobjects };
