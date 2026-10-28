import {createApi} from '@/api';
import {host} from '@/common/youtrack/host';
import {createYouTrackClient} from '@/common/youtrack/rest';

/** Typed client for the ReBoards backend handlers. */
export const api = createApi(host);

/** YouTrack REST client bound to the widget host. */
export const youtrack = createYouTrackClient(host);
