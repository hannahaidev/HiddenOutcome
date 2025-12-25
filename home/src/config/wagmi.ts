import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { sepolia } from 'wagmi/chains';

export const config = getDefaultConfig({
  appName: 'Hidden Outcome',
  projectId: 'hidden-outcome-demo-id',
  chains: [sepolia],
  ssr: false,
});
