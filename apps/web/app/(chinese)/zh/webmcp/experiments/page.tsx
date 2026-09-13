import { ExperimentsPage } from '../../../../_components/experiments-page';
import { experimentMetadata } from '../../../../../lib/webmcp-experiments';
export const metadata = experimentMetadata('zh');
export default function Page() { return <ExperimentsPage locale="zh" />; }
