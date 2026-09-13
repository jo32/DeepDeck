import { BenchmarkPage } from '../../_components/benchmark-page';
import { benchmarkMetadata } from '../../../lib/benchmark';
export const metadata = benchmarkMetadata('en');
export default function Page() { return <BenchmarkPage locale="en" />; }
