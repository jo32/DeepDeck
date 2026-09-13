import { BenchmarkPage } from '../../../_components/benchmark-page';
import { benchmarkMetadata } from '../../../../lib/benchmark';
export const metadata = benchmarkMetadata('zh');
export default function Page() { return <BenchmarkPage locale="zh" />; }
