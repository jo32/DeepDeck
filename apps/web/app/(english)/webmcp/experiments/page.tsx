import { ExperimentsPage } from '../../../_components/experiments-page';
import { experimentMetadata } from '../../../../lib/webmcp-experiments';
export const metadata = experimentMetadata('en');
export default function Page() { return <ExperimentsPage locale="en" />; }
